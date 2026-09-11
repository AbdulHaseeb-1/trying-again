import {
  applyPolicy,
  cleanSnippet,
  domainOf,
  resultId,
  toIsoOrNull,
} from '../normalization/normalize';
import type {
  SearchHealth,
  SearchProvider,
  SearchProviderCapabilities,
  SearchProviderConfig,
  SearchQueryOptions,
  SearchResult,
} from '../search-provider';
import { healthFromStatus, healthFromTransport, SearchHttpError, searchFetch } from './http-support';

const DEFAULT_BASE_URL = 'https://api.search.brave.com/res/v1';

/** Brave Search — a general web index with its own crawler. */
export class BraveSearchProvider implements SearchProvider {
  readonly id = 'brave';
  readonly name = 'Brave Search';
  readonly capabilities: SearchProviderCapabilities = {
    fullTextFetch: false,
    domainFilter: false,
    recencyFilter: true,
    safeSearch: true,
    scores: false,
    requiresApiKey: true,
    requiresBaseUrl: false,
  };

  async search(
    query: string,
    options: SearchQueryOptions,
    config: SearchProviderConfig,
    signal?: AbortSignal,
  ): Promise<SearchResult[]> {
    const params = new URLSearchParams({
      q: query,
      count: String(Math.min(20, options.maxResults)),
      safesearch: options.safeSearch ? 'moderate' : 'off',
    });
    if (options.recencyDays !== null) {
      params.set('freshness', options.recencyDays <= 1 ? 'pd' : options.recencyDays <= 7 ? 'pw' : 'pm');
    }
    const response = await searchFetch(
      `${(config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '')}/web/search?${params}`,
      {
        method: 'GET',
        headers: { accept: 'application/json', 'x-subscription-token': config.apiKey ?? '' },
      },
      options.timeoutMs,
      signal,
    );
    if (!response.ok) throw new SearchHttpError(response.status);
    const body = (await response.json()) as { web?: { results?: Record<string, unknown>[] } };
    const results = (body.web?.results ?? [])
      .filter((row) => typeof row.url === 'string')
      .map((row) => {
        const url = row.url as string;
        return {
          id: resultId(this.id, url),
          title: typeof row.title === 'string' ? row.title : url,
          url,
          domain: domainOf(url),
          snippet: cleanSnippet(row.description),
          publishedAt: toIsoOrNull(row.page_age ?? row.age),
          provider: this.id,
          score: null,
        } satisfies SearchResult;
      });
    return applyPolicy(results, options);
  }

  async healthCheck(config: SearchProviderConfig, signal?: AbortSignal): Promise<SearchHealth> {
    if (!config.apiKey) return { status: 'not_configured', message: 'An API key is required.' };
    const started = Date.now();
    try {
      await this.search(
        'market data',
        {
          maxResults: 1,
          depth: 'basic',
          recencyDays: null,
          allowedDomains: [],
          blockedDomains: [],
          safeSearch: true,
          timeoutMs: config.timeoutMs,
        },
        config,
        signal,
      );
      return { status: 'ok', message: 'Search is working.', latencyMs: Date.now() - started };
    } catch (error) {
      if (error instanceof SearchHttpError) return healthFromStatus(error.status);
      return healthFromTransport(error);
    }
  }
}
