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

/**
 * SearXNG — a self-hosted metasearch instance.
 *
 * The privacy-preserving option: no third-party key, no query leaving the
 * operator's own infrastructure. Constructed with an id and name so several
 * instances can be registered at once.
 */
export class SearxngSearchProvider implements SearchProvider {
  readonly capabilities: SearchProviderCapabilities = {
    fullTextFetch: false,
    domainFilter: false,
    recencyFilter: true,
    safeSearch: true,
    scores: true,
    requiresApiKey: false,
    requiresBaseUrl: true,
  };

  constructor(
    readonly id: string,
    readonly name: string,
    private readonly defaultBaseUrl: string | null = null,
  ) {}

  async search(
    query: string,
    options: SearchQueryOptions,
    config: SearchProviderConfig,
    signal?: AbortSignal,
  ): Promise<SearchResult[]> {
    const base = config.baseUrl ?? this.defaultBaseUrl;
    if (!base) throw new SearchHttpError(400);

    const params = new URLSearchParams({
      q: query,
      format: 'json',
      safesearch: options.safeSearch ? '1' : '0',
    });
    if (options.recencyDays !== null) {
      params.set(
        'time_range',
        options.recencyDays <= 1 ? 'day' : options.recencyDays <= 7 ? 'week' : 'month',
      );
    }

    const response = await searchFetch(
      `${base.replace(/\/$/, '')}/search?${params}`,
      { method: 'GET', headers: { accept: 'application/json' } },
      options.timeoutMs,
      signal,
    );
    if (!response.ok) throw new SearchHttpError(response.status);
    const body = (await response.json()) as { results?: Record<string, unknown>[] };
    const results = (body.results ?? [])
      .filter((row) => typeof row.url === 'string')
      .map((row) => {
        const url = row.url as string;
        return {
          id: resultId(this.id, url),
          title: typeof row.title === 'string' ? row.title : url,
          url,
          domain: domainOf(url),
          snippet: cleanSnippet(row.content),
          publishedAt: toIsoOrNull(row.publishedDate),
          provider: this.id,
          score: typeof row.score === 'number' ? row.score : null,
        } satisfies SearchResult;
      });
    return applyPolicy(results, options);
  }

  async healthCheck(config: SearchProviderConfig, signal?: AbortSignal): Promise<SearchHealth> {
    if (!(config.baseUrl ?? this.defaultBaseUrl)) {
      return { status: 'not_configured', message: 'A base URL is required.' };
    }
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
