import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Model } from '@openai/agents';

import { AgentError } from '../agent.errors';
import { AiSettingsService, providerSecretKey } from '../settings/ai-settings.service';
import { SecretStore } from '../settings/secret-store.service';
import type { LLMProvider, ProviderConfig, ProviderSummary } from './llm-provider';
import { OpenAiCompatibleLLMProvider } from './openai-compatible.provider';

/** Nest injection token for the built-in providers. Adding one means adding a
 *  class to the module's provider array — there is no switch to extend. */
export const LLM_PROVIDERS = Symbol('LLM_PROVIDERS');

/**
 * Which providers exist, and how to turn "openai / gpt-4.1-mini" into a model
 * the Agents SDK can run.
 *
 * Built-ins arrive by dependency injection. User-defined OpenAI-compatible
 * endpoints arrive from settings and are materialised into the same interface,
 * so nothing downstream can tell the two apart.
 */
@Injectable()
export class ProviderRegistry implements OnModuleInit {
  private readonly logger = new Logger(ProviderRegistry.name);
  private readonly providers = new Map<string, LLMProvider>();

  constructor(
    @Inject(LLM_PROVIDERS) private readonly builtIns: LLMProvider[],
    private readonly settings: AiSettingsService,
    private readonly secrets: SecretStore,
  ) {}

  async onModuleInit(): Promise<void> {
    for (const provider of this.builtIns) this.register(provider);
    await this.syncCustomProviders();
  }

  register(provider: LLMProvider): void {
    if (this.providers.has(provider.id)) {
      this.logger.warn(`provider "${provider.id}" registered twice; keeping the first`);
      return;
    }
    this.providers.set(provider.id, provider);
  }

  unregister(id: string): void {
    this.providers.delete(id);
  }

  get(id: string): LLMProvider | null {
    return this.providers.get(id) ?? null;
  }

  require(id: string): LLMProvider {
    const provider = this.get(id);
    if (!provider) {
      throw new AgentError('provider_not_configured', `No provider named "${id}" is registered.`);
    }
    return provider;
  }

  all(): LLMProvider[] {
    return [...this.providers.values()];
  }

  /** Re-reads the settings document and mirrors its custom endpoints. */
  async syncCustomProviders(): Promise<void> {
    const settings = await this.settings.all();
    const wanted = new Set(settings.customProviders.map((entry) => entry.id));

    for (const definition of settings.customProviders) {
      if (this.providers.has(definition.id)) continue;
      this.providers.set(
        definition.id,
        new OpenAiCompatibleLLMProvider(definition.id, definition.name),
      );
    }
    for (const [id, provider] of this.providers) {
      const isBuiltIn = this.builtIns.some((entry) => entry.id === id);
      if (!isBuiltIn && !wanted.has(id)) this.providers.delete(id);
      void provider;
    }
  }

  /** What Settings renders. Never contains a key, only a preview of one. */
  async summaries(): Promise<ProviderSummary[]> {
    const settings = await this.settings.all();
    const rows: ProviderSummary[] = [];
    for (const provider of this.all()) {
      const stored = settings.providers[provider.id];
      const apiKeyPreview = await this.secrets.preview(providerSecretKey(provider.id));
      rows.push({
        id: provider.id,
        name: provider.name,
        kind: provider.kind,
        enabled: stored?.enabled ?? false,
        configured: apiKeyPreview !== null || (stored?.baseUrl ?? null) !== null,
        apiKeyPreview,
        baseUrl: stored?.baseUrl ?? null,
        defaultModel: stored?.defaultModel ?? null,
        timeoutMs: stored?.timeoutMs ?? 60_000,
        maxRetries: stored?.maxRetries ?? 2,
        capabilities: provider.capabilities,
        supportedParameters: [...provider.supportedParameters],
        configFields: [...provider.configFields],
        suggestedModels: [...provider.suggestedModels],
      });
    }
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Configuration with the secret attached — only for constructing a model. */
  async configFor(providerId: string): Promise<ProviderConfig> {
    return this.settings.resolveProvider(providerId);
  }

  /**
   * Build a runnable model, refusing early and clearly when the provider is off
   * or incompletely configured. Failing here is much kinder than failing on the
   * first token.
   */
  async createModel(providerId: string, modelId: string): Promise<Model> {
    const provider = this.require(providerId);
    const config = await this.configFor(providerId);
    if (!config.enabled) {
      throw new AgentError(
        'provider_not_configured',
        `${provider.name} is turned off in Settings → AI & Agents.`,
      );
    }
    const issues = provider.validateConfiguration(config);
    if (issues.length > 0) {
      throw new AgentError('provider_not_configured', `${provider.name}: ${issues[0].message}`);
    }
    return provider.createModel(config, modelId);
  }
}
