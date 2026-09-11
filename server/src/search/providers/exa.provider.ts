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

const DEFAULT_BASE_URL = 'https://api.exa.ai';

/** Exa — embedding-based retrieval, strong on "find pages like this". */
export class ExaSearchProvider implements SearchProvider {
  readonly id = 'exa';
  readonly name = 'Exa';
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
    const startPublishedDate =
      options.recencyDays !== null
        ? new Date(Date.now() - options.recencyDays * 86_400_000).toISOString()
        : undefined;

    const response = await searchFetch(
      `${(config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '')}/search`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': config.apiKey ?? '' },
        body: JSON.stringify({
          query,
          numResults: options.maxResults,
          type: options.depth === 'advanced' ? 'neural' : 'auto',
          includeDomains: options.allowedDomains.length > 0 ? options.allowedDomains : undefined,
          excludeDomains: options.blockedDomains.length > 0 ? options.blockedDomains : undefined,
          startPublishedDate,
          contents: { text: { maxCharacters: 800 } },
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
          snippet: cleanSnippet(row.text ?? row.summary),
          publishedAt: toIsoOrNull(row.publishedDate),
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
      `${(config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '')}/contents`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': config.apiKey ?? '' },
        body: JSON.stringify({ urls: [url], text: { maxCharacters: 20_000 } }),
      },
      config.timeoutMs,
      signal,
    );
    if (!response.ok) throw new SearchHttpError(response.status);
    const body = (await response.json()) as {
      results?: { title?: string; text?: string; publishedDate?: string }[];
    };
    const first = body.results?.[0];
    return {
      url,
      title: first?.title ?? null,
      siteName: domainOf(url),
      publishedAt: toIsoOrNull(first?.publishedDate),
      text: (first?.text ?? '').slice(0, 20_000),
      truncated: (first?.text ?? '').length > 20_000,
    };
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
