import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import { NewsService } from '../../news/news.service';
import type { NewsItem } from '../../news/news.types';
import { NEWS_IMPORTANCE } from '../../news/news.types';
import { AgentError } from '../agent.errors';
import { referenceId } from '../citations/citation.service';
import type { AgentReference } from '../citations/reference.types';
import type { AnyAppTool, AppTool, AppToolProvider } from './tool-definition';
import { untrusted } from './tool-support';

/**
 * News, as first-class agent data.
 *
 * Every item an agent sees keeps its id, publisher and timestamp, and every
 * tool that returns one also returns the reference for it. That is the whole
 * mechanism behind "every referenced news item can be opened from an answer":
 * the citation the UI renders is the reference this file produced, and it
 * carries the internal id the news endpoint resolves.
 */
@Injectable()
export class NewsTools implements AppToolProvider {
  constructor(private readonly news: NewsService) {}

  tools(): AnyAppTool[] {
    return [
      this.search(),
      this.latest(),
      this.byId(),
      this.forSymbol(),
      this.between(),
      this.related(),
    ] as AnyAppTool[];
  }

  private search() {
    const parameters = z.object({
      query: z.string().describe('Words to look for in the headline or summary.'),
      symbols: z
        .array(z.string())
        .describe('Restrict to stories tagged with these symbols. Empty for all.'),
      minImportance: z
        .enum(NEWS_IMPORTANCE)
        .describe('Drop anything below this importance.')
        .nullable(),
      limit: z.number().int().min(1).max(25).describe('How many stories to return.'),
    });
    return {
      name: 'search_news',
      description:
        "Search the application's news store, which holds both its own economic releases and external wire copy.",
      domain: 'news',
      capability: 'news.read',
      level: 'READ',
      parameters,
      timeoutMs: 8_000,
      label: (input: z.infer<typeof parameters>) => `Searching news for "${input.query}"`,
      summary: summarizeItems,
      references: referencesFor,
      execute: async (input: z.infer<typeof parameters>) => {
        const page = await this.news.search({
          q: input.query,
          symbols: input.symbols.length > 0 ? input.symbols : undefined,
          minImportance: input.minImportance ?? undefined,
          limit: input.limit,
        });
        return shape(page.items, page.total);
      },
    } satisfies AppTool<typeof parameters>;
  }

  private latest() {
    const parameters = z.object({
      limit: z.number().int().min(1).max(25).describe('How many stories to return.'),
      symbols: z.array(z.string()).describe('Restrict to these symbols. Empty for all.'),
    });
    return {
      name: 'get_latest_news',
      description: 'The most recent stories in the application, newest first.',
      domain: 'news',
      capability: 'news.read',
      level: 'READ',
      parameters,
      timeoutMs: 8_000,
      label: () => 'Reading the latest news',
      summary: summarizeItems,
      references: referencesFor,
      execute: async (input: z.infer<typeof parameters>) => {
        const page = await this.news.latest(
          input.limit,
          input.symbols.length > 0 ? input.symbols : undefined,
        );
        return shape(page.items, page.total);
      },
    } satisfies AppTool<typeof parameters>;
  }

  private byId() {
    const parameters = z.object({
      id: z.string().describe('The internal news id, e.g. news_abc123.'),
    });
    return {
      name: 'get_news_item',
      description:
        'One news item in full, including its body text where the application has it. Use this after a search to read a specific story.',
      domain: 'news',
      capability: 'news.read',
      level: 'READ',
      parameters,
      timeoutMs: 8_000,
      label: () => 'Opening a news item',
      summary: (output: unknown) => (output as { title: string }).title,
      references: (output: unknown) => [referenceForItem(output as NewsItem)],
      execute: async (input: z.infer<typeof parameters>) => {
        const item = await this.news.byId(input.id);
        if (!item) throw new AgentError('news_unavailable', `No news item "${input.id}".`);
        return {
          ...describe(item),
          // The body is someone else's prose; it is quoted, never obeyed.
          body: item.body ? untrusted(item.source, item.body) : null,
        };
      },
    } satisfies AppTool<typeof parameters>;
  }

  private forSymbol() {
    const parameters = z.object({
      symbol: z.string().describe('Ticker or currency code, e.g. BTC or USD.'),
      limit: z.number().int().min(1).max(25).describe('How many stories to return.'),
    });
    return {
      name: 'get_news_for_symbol',
      description: 'Recent stories tagged with one symbol.',
      domain: 'news',
      capability: 'news.read',
      level: 'READ',
      parameters,
      timeoutMs: 8_000,
      label: (input: z.infer<typeof parameters>) => `Searching ${input.symbol.toUpperCase()} news`,
      summary: summarizeItems,
      references: referencesFor,
      execute: async (input: z.infer<typeof parameters>) => {
        const page = await this.news.forSymbol(input.symbol, input.limit);
        return shape(page.items, page.total);
      },
    } satisfies AppTool<typeof parameters>;
  }

  private between() {
    const parameters = z.object({
      from: z.string().describe('ISO timestamp, inclusive.'),
      to: z.string().describe('ISO timestamp, inclusive.'),
      limit: z.number().int().min(1).max(50).describe('How many stories to return.'),
    });
    return {
      name: 'get_news_between',
      description:
        'Stories published between two timestamps — for "what happened around the CPI print" questions.',
      domain: 'news',
      capability: 'news.read',
      level: 'READ',
      parameters,
      timeoutMs: 8_000,
      label: () => 'Reading news for that window',
      summary: summarizeItems,
      references: referencesFor,
      execute: async (input: z.infer<typeof parameters>) => {
        const page = await this.news.between(input.from, input.to, input.limit);
        return shape(page.items, page.total);
      },
    } satisfies AppTool<typeof parameters>;
  }

  private related() {
    const parameters = z.object({
      id: z.string().describe('The internal news id to find neighbours for.'),
    });
    return {
      name: 'get_related_news',
      description: 'Other stories about the same symbols, published around the same time.',
      domain: 'news',
      capability: 'news.read',
      level: 'READ',
      parameters,
      timeoutMs: 8_000,
      label: () => 'Finding related coverage',
      summary: summarizeItems,
      references: referencesFor,
      execute: async (input: z.infer<typeof parameters>) => {
        const items = await this.news.related(input.id);
        return shape(items, items.length);
      },
    } satisfies AppTool<typeof parameters>;
  }
}

/** What a story looks like to a model: enough to reason with, and its id. */
function describe(item: NewsItem) {
  return {
    id: item.id,
    title: item.title,
    summary: item.summary,
    source: item.source,
    url: item.canonicalUrl ?? item.sourceUrl,
    publishedAt: item.publishedAt,
    symbols: item.symbols,
    categories: item.categories,
    importance: item.importance,
    sentiment: item.sentiment,
    provider: item.provider,
  };
}

function shape(items: NewsItem[], total: number) {
  return { total, items: items.map(describe), _items: items };
}

function summarizeItems(output: unknown): string {
  const row = output as { items: unknown[] };
  return `${row.items.length} ${row.items.length === 1 ? 'article' : 'articles'}`;
}

export function referenceForItem(item: NewsItem): AgentReference {
  return {
    id: referenceId('news', item.id),
    type: 'news',
    title: item.title,
    url: item.canonicalUrl ?? item.sourceUrl,
    source: item.source,
    publishedAt: item.publishedAt,
    entityId: item.id,
    snippet: item.summary,
    metadata: {
      symbols: item.symbols,
      importance: item.importance,
      sentiment: item.sentiment,
      provider: item.provider,
    },
  };
}

function referencesFor(output: unknown): AgentReference[] {
  const row = output as { _items?: NewsItem[] };
  return (row._items ?? []).map(referenceForItem);
}
