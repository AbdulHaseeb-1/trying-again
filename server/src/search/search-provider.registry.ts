import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { AiSettingsService, searchSecretKey } from '../agent/settings/ai-settings.service';
import { SecretStore } from '../agent/settings/secret-store.service';
import { RestSearchProvider } from './providers/rest.provider';
import { SearxngSearchProvider } from './providers/searxng.provider';
import type {
  SearchProvider,
  SearchProviderConfig,
  SearchProviderSummary,
} from './search-provider';

export const SEARCH_PROVIDERS = Symbol('SEARCH_PROVIDERS');

/**
 * Which engines exist. Built-ins by injection, operator-defined instances from
 * settings — both behind the same interface, so the tool layer never branches
 * on which one answered.
 */
@Injectable()
export class SearchProviderRegistry implements OnModuleInit {
  private readonly logger = new Logger(SearchProviderRegistry.name);
  private readonly providers = new Map<string, SearchProvider>();

  constructor(
    @Inject(SEARCH_PROVIDERS) private readonly builtIns: SearchProvider[],
    private readonly settings: AiSettingsService,
    private readonly secrets: SecretStore,
  ) {}

  async onModuleInit(): Promise<void> {
    for (const provider of this.builtIns) this.register(provider);
    await this.syncCustomProviders();
  }

  register(provider: SearchProvider): void {
    if (this.providers.has(provider.id)) {
      this.logger.warn(`search provider "${provider.id}" registered twice; keeping the first`);
      return;
    }
    this.providers.set(provider.id, provider);
  }

  unregister(id: string): void {
    this.providers.delete(id);
  }

  get(id: string): SearchProvider | null {
    return this.providers.get(id) ?? null;
  }

  all(): SearchProvider[] {
    return [...this.providers.values()];
  }

  async syncCustomProviders(): Promise<void> {
    const search = await this.settings.search();
    const wanted = new Set(search.customProviders.map((entry) => entry.id));

    for (const definition of search.customProviders) {
      if (this.providers.has(definition.id)) continue;
      this.providers.set(
        definition.id,
        definition.kind === 'searxng'
          ? new SearxngSearchProvider(definition.id, definition.name, definition.baseUrl)
          : new RestSearchProvider(definition.id, definition.name, definition.baseUrl),
      );
    }
    for (const id of [...this.providers.keys()]) {
      const isBuiltIn = this.builtIns.some((entry) => entry.id === id);
      if (!isBuiltIn && !wanted.has(id)) this.providers.delete(id);
    }
  }

  /** Configuration with the key attached — only for calling a provider. */
  async configFor(providerId: string): Promise<SearchProviderConfig> {
    const search = await this.settings.search();
    const stored = search.providers[providerId];
    const custom = search.customProviders.find((entry) => entry.id === providerId);
    return {
      providerId,
      apiKey: await this.secrets.get(searchSecretKey(providerId)),
      baseUrl: stored?.baseUrl ?? custom?.baseUrl ?? null,
      timeoutMs: stored?.timeoutMs ?? search.timeoutMs,
    };
  }

  async summaries(): Promise<SearchProviderSummary[]> {
    const search = await this.settings.search();
    const rows: SearchProviderSummary[] = [];
    for (const provider of this.all()) {
      const stored = search.providers[provider.id];
      const custom = search.customProviders.find((entry) => entry.id === provider.id);
      const apiKeyPreview = await this.secrets.preview(searchSecretKey(provider.id));
      const baseUrl = stored?.baseUrl ?? custom?.baseUrl ?? null;
      rows.push({
        id: provider.id,
        name: provider.name,
        enabled: stored?.enabled ?? false,
        configured:
          (!provider.capabilities.requiresApiKey || apiKeyPreview !== null) &&
          (!provider.capabilities.requiresBaseUrl || baseUrl !== null),
        apiKeyPreview,
        baseUrl,
        capabilities: provider.capabilities,
      });
    }
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  }
}
