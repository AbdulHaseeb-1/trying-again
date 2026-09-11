import { Injectable, Logger } from '@nestjs/common';

import { AgentError } from '../agent/agent.errors';
import { AiSettingsService } from '../agent/settings/ai-settings.service';
import { UrlFetcher } from './fetch/url-fetcher';
import { SearchProviderRegistry } from './search-provider.registry';
import type {
  FetchedPage,
  SearchHealth,
  SearchQueryOptions,
  SearchResult,
} from './search-provider';

export type SearchOutcome = {
  providerId: string;
  providerName: string;
  results: SearchResult[];
  /** Set when the configured default failed and the fallback answered. */
  fellBackFrom: string | null;
};

/**
 * The one entry point agents reach the internet through.
 *
 * Its job is the part no adapter should own: which engine to ask, what to do
 * when that engine is down, and the domain policy that applies regardless of
 * which engine answered.
 */
@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly registry: SearchProviderRegistry,
    private readonly settings: AiSettingsService,
    private readonly fetcher: UrlFetcher,
  ) {}

  /** The effective query policy: stored settings, narrowed by any per-call override. */
  async queryOptions(overrides: Partial<SearchQueryOptions> = {}): Promise<SearchQueryOptions> {
    const search = await this.settings.search();
    return {
      maxResults: overrides.maxResults ?? search.maxResults,
      depth: overrides.depth ?? search.depth,
      recencyDays: overrides.recencyDays ?? search.recencyDays,
      // A caller may add restrictions but never remove the configured ones.
      allowedDomains: [...search.allowedDomains, ...(overrides.allowedDomains ?? [])],
      blockedDomains: [...search.blockedDomains, ...(overrides.blockedDomains ?? [])],
      safeSearch: overrides.safeSearch ?? search.safeSearch,
      timeoutMs: overrides.timeoutMs ?? search.timeoutMs,
    };
  }

  async search(
    query: string,
    overrides: Partial<SearchQueryOptions> = {},
    signal?: AbortSignal,
  ): Promise<SearchOutcome> {
    const settings = await this.settings.all();
    if (!settings.privacy.allowWebAccess) {
      throw new AgentError('permission_denied', 'Web access is turned off in Settings.');
    }

    const options = await this.queryOptions(overrides);
    const order = [settings.search.defaultProviderId, settings.search.fallbackProviderId].filter(
      (id): id is string => typeof id === 'string' && id.length > 0,
    );
    if (order.length === 0) {
      throw new AgentError(
        'search_failed',
        'No web search provider is configured. Add one in Settings → AI & Agents → Search.',
      );
    }

    let firstFailure: unknown = null;
    for (const [index, providerId] of order.entries()) {
      const provider = this.registry.get(providerId);
      if (!provider) continue;
      const enabled = settings.search.providers[providerId]?.enabled ?? false;
      if (!enabled) continue;
      try {
        const config = await this.registry.configFor(providerId);
        const results = await provider.search(query, options, config, signal);
        return {
          providerId,
          providerName: provider.name,
          results,
          fellBackFrom: index > 0 ? order[0] : null,
        };
      } catch (error) {
        if (signal?.aborted) throw new AgentError('cancelled');
        firstFailure ??= error;
        this.logger.warn(`search provider "${providerId}" failed: ${String(error)}`);
      }
    }

    throw new AgentError(
      'search_failed',
      'Web search is unavailable right now.',
      firstFailure instanceof Error ? firstFailure.message : undefined,
      firstFailure,
    );
  }

  /**
   * Read one page.
   *
   * Prefers a provider's own extraction where it has one — those endpoints see
   * pages our fetcher cannot, and they are already inside the provider's own
   * safety posture — and otherwise falls back to the SSRF-guarded fetcher.
   */
  async fetchPage(url: string, signal?: AbortSignal): Promise<FetchedPage> {
    const settings = await this.settings.all();
    if (!settings.privacy.allowWebAccess) {
      throw new AgentError('permission_denied', 'Web access is turned off in Settings.');
    }
    const options = await this.queryOptions();

    // The address is checked before anything is asked to open it, whichever
    // path ends up doing the fetching.
    await this.fetcher.assertSafe(url, options.allowedDomains, options.blockedDomains);

    const defaultId = settings.search.defaultProviderId;
    const provider = defaultId ? this.registry.get(defaultId) : null;
    if (provider?.fetch && settings.search.providers[provider.id]?.enabled) {
      try {
        return await provider.fetch(url, await this.registry.configFor(provider.id), signal);
      } catch (error) {
        this.logger.warn(`provider extraction failed for ${url}: ${String(error)}`);
      }
    }
    return this.fetcher.fetchPage(
      url,
      {
        timeoutMs: options.timeoutMs,
        allowedDomains: options.allowedDomains,
        blockedDomains: options.blockedDomains,
      },
      signal,
    );
  }

  async testProvider(providerId: string, signal?: AbortSignal): Promise<SearchHealth> {
    const provider = this.registry.get(providerId);
    if (!provider) return { status: 'error', message: 'No such search provider.' };
    return provider.healthCheck(await this.registry.configFor(providerId), signal);
  }
}
