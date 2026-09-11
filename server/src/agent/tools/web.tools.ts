import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import { SearchService } from '../../search/search.service';
import type { SearchResult } from '../../search/search-provider';
import { AgentError } from '../agent.errors';
import { referenceId } from '../citations/citation.service';
import type { AgentReference } from '../citations/reference.types';
import type { AnyAppTool, AppTool, AppToolProvider } from './tool-definition';
import { untrusted } from './tool-support';

/**
 * The internet, behind one stable tool.
 *
 * An agent calls `web_search`. Whether that reaches Tavily, Exa, Brave, a
 * SearXNG instance or OpenAI's hosted index is a settings decision it never
 * sees — which is the point: internet access must not be a feature of one
 * vendor's model.
 *
 * Both tools are marked EXTERNAL_NETWORK rather than READ. They leave the
 * building, they are the slowest thing an agent can do, and they are the
 * capability an operator is most likely to want to withhold.
 */
@Injectable()
export class WebTools implements AppToolProvider {
  constructor(private readonly search: SearchService) {}

  tools(): AnyAppTool[] {
    return [this.webSearch(), this.webFetch()] as AnyAppTool[];
  }

  private webSearch() {
    const parameters = z.object({
      query: z.string().describe('What to search for. Write it as a search query, not a sentence.'),
      maxResults: z.number().int().min(1).max(10).describe('How many results to return.'),
      recencyDays: z
        .number()
        .int()
        .min(1)
        .max(365)
        .describe('Only results newer than this many days.')
        .nullable(),
      domains: z
        .array(z.string())
        .describe('Narrow to these domains, e.g. ["reuters.com"]. Empty for no restriction.'),
    });
    return {
      name: 'web_search',
      description:
        'Search the public internet. Returns titles, URLs, publishers and snippets, each of which can be cited.',
      domain: 'web',
      capability: 'web.search',
      level: 'EXTERNAL_NETWORK',
      parameters,
      timeoutMs: 25_000,
      label: (input: z.infer<typeof parameters>) => `Searching the web for "${input.query}"`,
      summary: (output: unknown) => {
        const row = output as { results: unknown[]; provider: string };
        return `${row.results.length} results via ${row.provider}`;
      },
      references: (output: unknown) => {
        const row = output as { _results?: SearchResult[] };
        return (row._results ?? []).map(referenceForResult);
      },
      execute: async (input: z.infer<typeof parameters>, { signal }) => {
        const outcome = await this.search.search(
          input.query,
          {
            maxResults: input.maxResults,
            recencyDays: input.recencyDays ?? undefined,
            allowedDomains: input.domains,
          },
          signal,
        );
        return {
          provider: outcome.providerName,
          fellBackFrom: outcome.fellBackFrom,
          results: outcome.results.map((result) => ({
            title: result.title,
            url: result.url,
            domain: result.domain,
            snippet: result.snippet,
            publishedAt: result.publishedAt,
          })),
          _results: outcome.results,
        };
      },
    } satisfies AppTool<typeof parameters>;
  }

  private webFetch() {
    const parameters = z.object({
      url: z.string().describe('The https URL to open. Must be one a search returned.'),
    });
    return {
      name: 'web_fetch',
      description:
        'Open one web page and read its article text. Use it when a snippet is not enough to answer accurately.',
      domain: 'web',
      capability: 'web.fetch',
      level: 'EXTERNAL_NETWORK',
      parameters,
      timeoutMs: 30_000,
      label: (input: z.infer<typeof parameters>) => `Reading ${hostOf(input.url)}`,
      summary: (output: unknown) => {
        const row = output as { characters: number };
        return `${row.characters.toLocaleString()} characters`;
      },
      references: (output: unknown) => {
        const row = output as { url: string; title: string | null; publishedAt: string | null };
        return [
          {
            id: referenceId('web', row.url),
            type: 'web' as const,
            title: row.title ?? hostOf(row.url),
            url: row.url,
            source: hostOf(row.url),
            publishedAt: row.publishedAt,
          },
        ];
      },
      execute: async (input: z.infer<typeof parameters>, { signal }) => {
        const page = await this.search.fetchPage(input.url, signal);
        if (!page.text) {
          throw new AgentError('tool_failed', 'That page had no readable article text.');
        }
        return {
          url: page.url,
          title: page.title,
          publishedAt: page.publishedAt,
          characters: page.text.length,
          truncated: page.truncated,
          // Someone else's page. Quoted as material, never followed as instruction.
          content: untrusted(hostOf(page.url), page.text),
        };
      },
    } satisfies AppTool<typeof parameters>;
  }
}

export function referenceForResult(result: SearchResult): AgentReference {
  return {
    id: referenceId('web', result.url),
    type: 'web',
    title: result.title,
    url: result.url,
    source: result.domain,
    publishedAt: result.publishedAt,
    snippet: result.snippet,
    metadata: { provider: result.provider, score: result.score },
  };
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url.slice(0, 40);
  }
}
