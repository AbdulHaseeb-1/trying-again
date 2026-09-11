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
 * A generic JSON search endpoint: `GET {base}?q=…&limit=…`, answering either a
 * bare array or `{ results: [...] }` of objects carrying a url and a title.
 *
 * The escape hatch that makes "add your own engine" true without shipping code
 * for it — an in-house index, a vendor we have not written an adapter for, a
 * proxy in front of something else. Field names are probed across the handful
 * of spellings these endpoints actually use rather than being configurable,
 * which keeps the settings form to a URL and a key.
 */
export class RestSearchProvider implements SearchProvider {
  readonly capabilities: SearchProviderCapabilities = {
    fullTextFetch: false,
    domainFilter: false,
    recencyFilter: false,
    safeSearch: false,
    scores: false,
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

    const url = new URL(base);
    url.searchParams.set('q', query);
    url.searchParams.set('limit', String(options.maxResults));

    const headers: Record<string, string> = { accept: 'application/json' };
    if (config.apiKey) headers.authorization = `Bearer ${config.apiKey}`;

    const response = await searchFetch(
      url.toString(),
      { method: 'GET', headers },
      options.timeoutMs,
      signal,
    );
    if (!response.ok) throw new SearchHttpError(response.status);

    const body = (await response.json()) as unknown;
    const rows: Record<string, unknown>[] = Array.isArray(body)
      ? (body as Record<string, unknown>[])
      : (((body as { results?: unknown[] }).results ?? []) as Record<string, unknown>[]);

    const results = rows
      .filter((row) => typeof (row.url ?? row.link ?? row.href) === 'string')
      .map((row) => {
        const link = (row.url ?? row.link ?? row.href) as string;
        return {
          id: resultId(this.id, link),
          title: typeof (row.title ?? row.name) === 'string' ? ((row.title ?? row.name) as string) : link,
          url: link,
          domain: domainOf(link),
          snippet: cleanSnippet(row.snippet ?? row.description ?? row.content ?? row.summary),
          publishedAt: toIsoOrNull(row.publishedAt ?? row.published_date ?? row.date),
          provider: this.id,
          score: typeof row.score === 'number' ? (row.score as number) : null,
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
