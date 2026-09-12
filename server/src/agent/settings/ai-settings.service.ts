import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { DEFAULT_PROVIDER_CONFIG, type ProviderConfig } from '../providers/llm-provider';
import { JsonFileStore } from './json-file-store';
import { SecretStore } from './secret-store.service';
import {
  defaultAiSettings,
  type AgentOverride,
  type AiSettings,
  type CustomProviderDefinition,
  type CustomSearchProviderDefinition,
  type ModelRole,
  type ModelSelection,
  type PrivacySettings,
  type SearchSettings,
  type StoredProviderConfig,
  type StoredSearchProviderConfig,
} from './ai-settings.types';

/**
 * Drop keys whose value is `undefined` before merging a patch.
 *
 * A validated DTO materialises every optional property, so an untouched field
 * arrives as `{ headers: undefined }` rather than being absent. Spreading that
 * over the stored configuration erases it — which turns "enable this provider"
 * into "enable it and forget its headers, model and base URL". Every write
 * below goes through this.
 */
function definedOnly<T extends object>(patch: T): Partial<T> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    output[key] = value;
  }
  return output as Partial<T>;
}

const SETTINGS_KEY = 'ai';
const FILE_PATH = process.env.AI_SETTINGS_PATH ?? 'data/ai-settings.json';

export const providerSecretKey = (providerId: string) => `provider:${providerId}:apiKey`;
export const searchSecretKey = (providerId: string) => `search:${providerId}:apiKey`;

/**
 * The single source of truth for how the agent subsystem is configured.
 *
 * Held in memory and written through, because it is read on every run and
 * changed rarely. Postgres when there is one, a 0600 JSON file when there is
 * not — the same "optional archive" posture the rest of the service takes.
 *
 * Environment variables seed a *first* boot only (`OPENAI_API_KEY` and friends),
 * so a developer can clone, export a key and get a working agent without
 * opening Settings. After that the stored document wins: an operator's change
 * in the UI must not be silently reverted by a stale variable.
 */
@Injectable()
export class AiSettingsService implements OnModuleInit {
  private readonly logger = new Logger(AiSettingsService.name);
  private readonly file = new JsonFileStore<AiSettings>(FILE_PATH, defaultAiSettings);
  private cache: AiSettings = defaultAiSettings();
  private loaded = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: SecretStore,
  ) {}

  async onModuleInit(): Promise<void> {
    this.cache = await this.load();
    await this.seedFromEnvironment();
    this.loaded = true;
  }

  /** The whole document. Safe to hand to a controller: it holds no secrets. */
  async all(): Promise<AiSettings> {
    if (!this.loaded) this.cache = await this.load();
    return this.cache;
  }

  async privacy(): Promise<PrivacySettings> {
    return (await this.all()).privacy;
  }

  async search(): Promise<SearchSettings> {
    return (await this.all()).search;
  }

  async modelForRole(role: ModelRole): Promise<ModelSelection | null> {
    return (await this.all()).models[role];
  }

  async agentOverride(agentId: string): Promise<AgentOverride | null> {
    return (await this.all()).agents[agentId] ?? null;
  }

  /**
   * A provider's configuration *with* its secret attached.
   *
   * The only path that ever produces plaintext. Everything that is not
   * constructing a provider must use `storedProvider` instead.
   */
  async resolveProvider(providerId: string): Promise<ProviderConfig> {
    const stored = (await this.all()).providers[providerId];
    const apiKey = await this.secrets.get(providerSecretKey(providerId));
    return {
      ...DEFAULT_PROVIDER_CONFIG,
      ...definedOnly(stored ?? {}),
      providerId,
      apiKey,
    };
  }

  async storedProvider(providerId: string): Promise<StoredProviderConfig | null> {
    return (await this.all()).providers[providerId] ?? null;
  }

  async searchProviderConfig(providerId: string): Promise<StoredSearchProviderConfig | null> {
    return (await this.all()).search.providers[providerId] ?? null;
  }

  async searchApiKey(providerId: string): Promise<string | null> {
    return this.secrets.get(searchSecretKey(providerId));
  }

  // ------------------------------------------------------------------ writes

  async updateProvider(
    providerId: string,
    patch: Partial<StoredProviderConfig> & { apiKey?: string | null },
  ): Promise<StoredProviderConfig> {
    const { apiKey, ...rest } = patch;
    if (apiKey !== undefined) {
      // `null` means "leave what is stored alone"; `''` means "remove it".
      if (apiKey !== null) await this.secrets.set(providerSecretKey(providerId), apiKey);
    }
    // Saving a real credential is how a provider goes live in the "Save
    // credentials" flow, which never touches the separate "Enabled" switch.
    // Without this, a key can be stored and `configured: true` while the
    // provider stays disabled and every run keeps failing with
    // provider_not_configured — a key entered and saved should just work.
    if ((apiKey || rest.baseUrl) && rest.enabled === undefined) {
      rest.enabled = true;
    }
    const next = await this.mutate((current) => {
      const existing = current.providers[providerId] ?? defaultStoredProvider();
      return {
        ...current,
        providers: { ...current.providers, [providerId]: { ...existing, ...definedOnly(rest) } },
      };
    });
    return next.providers[providerId];
  }

  async addCustomProvider(definition: CustomProviderDefinition): Promise<AiSettings> {
    return this.mutate((current) => ({
      ...current,
      customProviders: [
        ...current.customProviders.filter((entry) => entry.id !== definition.id),
        definition,
      ],
    }));
  }

  async removeCustomProvider(providerId: string): Promise<AiSettings> {
    await this.secrets.clear(providerSecretKey(providerId));
    return this.mutate((current) => {
      const providers = { ...current.providers };
      delete providers[providerId];
      return {
        ...current,
        providers,
        customProviders: current.customProviders.filter((entry) => entry.id !== providerId),
      };
    });
  }

  async setModelRole(role: ModelRole, selection: ModelSelection | null): Promise<AiSettings> {
    return this.mutate((current) => ({
      ...current,
      models: { ...current.models, [role]: selection },
    }));
  }

  async updateAgent(agentId: string, patch: Partial<AgentOverride>): Promise<AgentOverride> {
    const next = await this.mutate((current) => {
      const existing = current.agents[agentId] ?? defaultAgentOverride();
      return {
        ...current,
        agents: { ...current.agents, [agentId]: { ...existing, ...definedOnly(patch) } },
      };
    });
    return next.agents[agentId];
  }

  async updateSearch(patch: Partial<SearchSettings>): Promise<SearchSettings> {
    const next = await this.mutate((current) => ({
      ...current,
      search: { ...current.search, ...definedOnly(patch) },
    }));
    return next.search;
  }

  async updateSearchProvider(
    providerId: string,
    patch: Partial<StoredSearchProviderConfig> & { apiKey?: string | null },
  ): Promise<StoredSearchProviderConfig> {
    const { apiKey, ...rest } = patch;
    if (apiKey !== undefined && apiKey !== null) {
      await this.secrets.set(searchSecretKey(providerId), apiKey);
    }
    const next = await this.mutate((current) => {
      const existing = current.search.providers[providerId] ?? {
        enabled: false,
        baseUrl: null,
        timeoutMs: current.search.timeoutMs,
      };
      return {
        ...current,
        search: {
          ...current.search,
          providers: {
            ...current.search.providers,
            [providerId]: { ...existing, ...definedOnly(rest) },
          },
        },
      };
    });
    return next.search.providers[providerId];
  }

  async addCustomSearchProvider(
    definition: CustomSearchProviderDefinition,
  ): Promise<SearchSettings> {
    const next = await this.mutate((current) => ({
      ...current,
      search: {
        ...current.search,
        customProviders: [
          ...current.search.customProviders.filter((entry) => entry.id !== definition.id),
          definition,
        ],
      },
    }));
    return next.search;
  }

  async removeCustomSearchProvider(providerId: string): Promise<SearchSettings> {
    await this.secrets.clear(searchSecretKey(providerId));
    const next = await this.mutate((current) => {
      const providers = { ...current.search.providers };
      delete providers[providerId];
      return {
        ...current,
        search: {
          ...current.search,
          providers,
          customProviders: current.search.customProviders.filter(
            (entry) => entry.id !== providerId,
          ),
        },
      };
    });
    return next.search;
  }

  async updatePrivacy(patch: Partial<PrivacySettings>): Promise<PrivacySettings> {
    const next = await this.mutate((current) => ({
      ...current,
      privacy: { ...current.privacy, ...definedOnly(patch) },
    }));
    return next.privacy;
  }

  // ----------------------------------------------------------------- storage

  private async mutate(apply: (current: AiSettings) => AiSettings): Promise<AiSettings> {
    const next = apply(await this.all());
    this.cache = next;
    await this.persist(next);
    return next;
  }

  private async persist(settings: AiSettings): Promise<void> {
    const database = this.prisma.db;
    if (database) {
      await database.appSetting.upsert({
        where: { key: SETTINGS_KEY },
        create: { key: SETTINGS_KEY, value: settings },
        update: { value: settings },
      });
      return;
    }
    await this.file.write(settings);
  }

  private async load(): Promise<AiSettings> {
    const database = this.prisma.db;
    if (database) {
      const row = await database.appSetting.findUnique({ where: { key: SETTINGS_KEY } });
      if (row?.value) return { ...defaultAiSettings(), ...(row.value as unknown as AiSettings) };
      // Carry a file-backed document into Postgres the first time one appears,
      // so adding a database later does not lose the configuration.
      const fromFile = await this.file.read();
      if (Object.keys(fromFile.providers).length > 0) {
        await this.persist(fromFile);
        return fromFile;
      }
      return defaultAiSettings();
    }
    return this.file.read();
  }

  /**
   * First-boot convenience only: an exported key becomes a configured provider
   * once, and never overwrites something an operator has since changed.
   */
  private async seedFromEnvironment(): Promise<void> {
    const seeds: { id: string; key: string | undefined; model: string | undefined }[] = [
      { id: 'openai', key: process.env.OPENAI_API_KEY, model: process.env.OPENAI_DEFAULT_MODEL },
      {
        id: 'openrouter',
        key: process.env.OPENROUTER_API_KEY,
        model: process.env.OPENROUTER_DEFAULT_MODEL,
      },
      {
        id: 'anthropic',
        key: process.env.ANTHROPIC_API_KEY,
        model: process.env.ANTHROPIC_DEFAULT_MODEL,
      },
      { id: 'google', key: process.env.GOOGLE_API_KEY, model: process.env.GOOGLE_DEFAULT_MODEL },
    ];

    for (const seed of seeds) {
      if (!seed.key) continue;
      if (this.cache.providers[seed.id]) continue;
      if (await this.secrets.has(providerSecretKey(seed.id))) continue;
      await this.secrets.set(providerSecretKey(seed.id), seed.key);
      await this.updateProvider(seed.id, {
        enabled: true,
        defaultModel: seed.model ?? null,
      });
      this.logger.log(`seeded ${seed.id} provider from the environment`);
    }

    // Pick a primary model if one provider is configured and nothing is chosen.
    const settings = await this.all();
    if (!settings.models.primary) {
      const [firstId] = Object.entries(settings.providers)
        .filter(([, config]) => config.enabled && config.defaultModel)
        .map(([id]) => id);
      const model = firstId ? settings.providers[firstId].defaultModel : null;
      if (firstId && model) {
        await this.setModelRole('primary', { providerId: firstId, modelId: model });
      }
    }
  }
}

function defaultStoredProvider(): StoredProviderConfig {
  return {
    enabled: false,
    baseUrl: null,
    organization: null,
    project: null,
    headers: {},
    defaultModel: null,
    timeoutMs: 60_000,
    maxRetries: 2,
  };
}

function defaultAgentOverride(): AgentOverride {
  return {
    enabled: true,
    model: null,
    fallbackModel: null,
    extraInstructions: null,
    capabilities: null,
    parameters: {},
  };
}
