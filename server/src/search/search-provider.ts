/**
 * The seam that keeps internet research off any single search engine.
 *
 * Agents call one application tool, `web_search`. Which engine answers it is a
 * configuration decision, and a new engine is a class plus a registration.
 * Adapters normalize to `SearchResult`; nothing above sees a Tavily payload or
 * a SearXNG payload.
 */

export type SearchDepth = 'basic' | 'advanced';

export type SearchQueryOptions = {
  maxResults: number;
  depth: SearchDepth;
  /** Drop results older than this many days. null keeps everything. */
  recencyDays: number | null;
  /** When non-empty, results outside these domains are discarded. */
  allowedDomains: string[];
  blockedDomains: string[];
  safeSearch: boolean;
  timeoutMs: number;
};

export type SearchResult = {
  /** Stable for a (provider, url) pair, so the same page cited twice is one id. */
  id: string;
  title: string;
  url: string;
  domain: string;
  snippet: string;
  publishedAt: string | null;
  provider: string;
  score: number | null;
};

export type FetchedPage = {
  url: string;
  title: string | null;
  siteName: string | null;
  publishedAt: string | null;
  /**
   * Extracted article text. **Untrusted**: it is whatever a stranger published.
   * It is passed to a model as data inside a quoted envelope, never as
   * instructions, and never interpolated into a system prompt.
   */
  text: string;
  truncated: boolean;
};

export type SearchProviderCapabilities = {
  /** The provider can return page contents, not just snippets. */
  fullTextFetch: boolean;
  domainFilter: boolean;
  recencyFilter: boolean;
  safeSearch: boolean;
  scores: boolean;
  requiresApiKey: boolean;
  requiresBaseUrl: boolean;
};

export type SearchProviderConfig = {
  providerId: string;
  apiKey: string | null;
  baseUrl: string | null;
  timeoutMs: number;
};

export type SearchHealth = {
  status: 'ok' | 'not_configured' | 'auth_failed' | 'unreachable' | 'rate_limited' | 'error';
  message: string;
  latencyMs?: number;
};

export interface SearchProvider {
  readonly id: string;
  readonly name: string;
  readonly capabilities: SearchProviderCapabilities;

  search(
    query: string,
    options: SearchQueryOptions,
    config: SearchProviderConfig,
    signal?: AbortSignal,
  ): Promise<SearchResult[]>;

  /** Only when the provider fetches pages itself; otherwise the service does. */
  fetch?(
    url: string,
    config: SearchProviderConfig,
    signal?: AbortSignal,
  ): Promise<FetchedPage>;

  healthCheck(config: SearchProviderConfig, signal?: AbortSignal): Promise<SearchHealth>;
}

export type SearchProviderSummary = {
  id: string;
  name: string;
  configured: boolean;
  enabled: boolean;
  apiKeyPreview: string | null;
  baseUrl: string | null;
  capabilities: SearchProviderCapabilities;
};
