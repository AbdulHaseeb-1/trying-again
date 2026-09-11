import {
  applyPolicy,
  cleanSnippet,
  domainOf,
  resultId,
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

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

/**
 * OpenAI's hosted web search, reached as an ordinary search provider.
 *
 * The Agents SDK can attach `webSearchTool()` directly to an agent, and the
 * factory does exactly that when the model supports it — but only then. This
 * adapter exists so the same engine is available to *every* agent on *every*
 * provider, through the one `web_search` tool: a Claude-backed agent can use
 * OpenAI's index without the application's internet access becoming an
 * OpenAI-only feature.
 *
 * Results come from the answer's URL citations, which is what the hosted tool
 * actually exposes; the search call itself returns no result list.
 */
export class OpenAiHostedSearchProvider implements SearchProvider {
  readonly id = 'openai-hosted';
  readonly name = 'OpenAI hosted search';
  readonly capabilities: SearchProviderCapabilities = {
    fullTextFetch: false,
    domainFilter: true,
    recencyFilter: false,
    safeSearch: false,
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
    const model = process.env.OPENAI_SEARCH_MODEL ?? 'gpt-4.1-mini';
    const response = await searchFetch(
      `${(config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '')}/responses`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${config.apiKey ?? ''}`,
        },
        body: JSON.stringify({
          model,
          tools: [
            {
              type: 'web_search',
              ...(options.allowedDomains.length > 0
                ? { filters: { allowed_domains: options.allowedDomains } }
                : {}),
            },
          ],
          tool_choice: 'required',
          input: `Search the web for: ${query}. Summarise the findings in two sentences and cite the sources.`,
        }),
      },
      options.timeoutMs,
      signal,
    );
    if (!response.ok) throw new SearchHttpError(response.status);

    const body = (await response.json()) as {
      output?: {
        type?: string;
        content?: { type?: string; text?: string; annotations?: Record<string, unknown>[] }[];
      }[];
    };

    const results: SearchResult[] = [];
    for (const item of body.output ?? []) {
      for (const part of item.content ?? []) {
        for (const annotation of part.annotations ?? []) {
          if (annotation.type !== 'url_citation') continue;
          const url = typeof annotation.url === 'string' ? annotation.url : null;
          if (!url) continue;
          results.push({
            id: resultId(this.id, url),
            title: typeof annotation.title === 'string' ? annotation.title : url,
            url,
            domain: domainOf(url),
            snippet: cleanSnippet(part.text),
            publishedAt: null,
            provider: this.id,
            score: null,
          });
        }
      }
    }
    return applyPolicy(results, options);
  }

  async healthCheck(config: SearchProviderConfig, signal?: AbortSignal): Promise<SearchHealth> {
    if (!config.apiKey) return { status: 'not_configured', message: 'An API key is required.' };
    const started = Date.now();
    try {
      const results = await this.search(
        'current market conditions',
        {
          maxResults: 2,
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
      return {
        status: 'ok',
        message: `Search is working. ${results.length} sources cited.`,
        latencyMs: Date.now() - started,
      };
    } catch (error) {
      if (error instanceof SearchHttpError) return healthFromStatus(error.status);
      return healthFromTransport(error);
    }
  }
}
