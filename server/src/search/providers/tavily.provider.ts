import {
  applyPolicy,
  cleanSnippet,
  domainOf,
  resultId,
  toIsoOrNull,
} from '../normalization/normalize';
import type {
  FetchedPage,
  SearchHealth,
  SearchProvider,
  SearchProviderCapabilities,
  SearchProviderConfig,
  SearchQueryOptions,
  SearchResult,
} from '../search-provider';
import { healthFromStatus, healthFromTransport, SearchHttpError, searchFetch } from './http-support';

const DEFAULT_BASE_URL = 'https://api.tavily.com';

/** Tavily — a search API built for agents, with its own extraction endpoint. */
export class TavilySearchProvider implements SearchProvider {
  readonly id = 'tavily';
  readonly name = 'Tavily';
  readonly capabilities: SearchProviderCapabilities = {
    fullTextFetch: true,
    domainFilter: true,
    recencyFilter: true,
    safeSearch: false,
    scores: true,
    requiresApiKey: true,
    requiresBaseUrl: false,
  };

  async search(
    query: string,
    options: SearchQueryOptions,
    config: SearchProviderConfig,
    signal?: AbortSignal,
  ): Promise<SearchResult[]> {
    const response = await searchFetch(
      `${(config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '')}/search`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${config.apiKey ?? ''}`,
        },
        body: JSON.stringify({
          query,
          search_depth: options.depth === 'advanced' ? 'advanced' : 'basic',
          max_results: options.maxResults,
          include_domains: options.allowedDomains,
          exclude_domains: options.blockedDomains,
          days: options.recencyDays ?? undefined,
        }),
      },
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
          publishedAt: toIsoOrNull(row.published_date),
          provider: this.id,
          score: typeof row.score === 'number' ? row.score : null,
        } satisfies SearchResult;
      });
    return applyPolicy(results, options);
  }

  async fetch(
    url: string,
    config: SearchProviderConfig,
    signal?: AbortSignal,
  ): Promise<FetchedPage> {
    const response = await searchFetch(
      `${(config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '')}/extract`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${config.apiKey ?? ''}`,
        },
        body: JSON.stringify({ urls: [url] }),
      },
      config.timeoutMs,
      signal,
    );
    if (!response.ok) throw new SearchHttpError(response.status);
    const body = (await response.json()) as { results?: { raw_content?: string }[] };
    const text = body.results?.[0]?.raw_content ?? '';
    return {
      url,
      title: null,
      siteName: domainOf(url),
      publishedAt: null,
      text: text.slice(0, 20_000),
      truncated: text.length > 20_000,
    };
  }

  async healthCheck(config: SearchProviderConfig, signal?: AbortSignal): Promise<SearchHealth> {
    if (!config.apiKey) {
      return { status: 'not_configured', message: 'An API key is required.' };
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
