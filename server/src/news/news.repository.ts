import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';
import { JsonFileStore } from '../agent/settings/json-file-store';
import { importanceRank, type NewsItem, type NewsPage, type NewsQuery } from './news.types';

const FILE_PATH = process.env.NEWS_STORE_PATH ?? 'data/news-store.json';
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
/** Beyond this the file backend starts costing more than it saves. */
const FILE_CAPACITY = 5_000;

/**
 * Where news lives.
 *
 * Postgres when there is one; a durable JSON document when there is not, on the
 * same reasoning as the rest of the service — a missing `DATABASE_URL` means
 * "no SQL", not "agents lose their citations on restart". Both paths return the
 * same page shape, and the filtering rules are shared so they cannot drift.
 */
@Injectable()
export class NewsRepository {
  private readonly logger = new Logger(NewsRepository.name);
  private readonly file = new JsonFileStore<{ items: NewsItem[] }>(FILE_PATH, () => ({ items: [] }));

  constructor(private readonly prisma: PrismaService) {}

  get durable(): boolean {
    return true;
  }

  get backend(): 'postgres' | 'file' {
    return this.prisma.db ? 'postgres' : 'file';
  }

  /**
   * Insert what is new, update what changed, touch nothing else — the same
   * incremental contract the calendar and derivatives archives keep.
   */
  async upsertMany(items: NewsItem[]): Promise<{ added: number; updated: number }> {
    if (items.length === 0) return { added: 0, updated: 0 };

    const database = this.prisma.db;
    if (!database) {
      let added = 0;
      let updated = 0;
      await this.file.update((current) => {
        const byId = new Map(current.items.map((item) => [item.id, item]));
        for (const item of items) {
          if (byId.has(item.id)) {
            const existing = byId.get(item.id)!;
            // Keep the original receipt time: it is when *we* first saw it.
            byId.set(item.id, { ...item, receivedAt: existing.receivedAt });
            updated += 1;
          } else {
            byId.set(item.id, item);
            added += 1;
          }
        }
        const next = [...byId.values()]
          .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
          .slice(0, FILE_CAPACITY);
        return { items: next };
      });
      return { added, updated };
    }

    let added = 0;
    let updated = 0;
    for (const item of items) {
      const existing = await database.newsItem.findUnique({ where: { id: item.id } });
      const row = {
        title: item.title,
        summary: item.summary,
        body: item.body,
        source: item.source,
        sourceUrl: item.sourceUrl,
        canonicalUrl: item.canonicalUrl,
        publishedAt: new Date(item.publishedAt),
        symbols: item.symbols,
        categories: item.categories,
        importance: item.importance,
        sentiment: item.sentiment,
        provider: item.provider,
        providerItemId: item.providerItemId,
        metadata: item.metadata as never,
      };
      if (existing) {
        const unchanged =
          existing.title === item.title &&
          existing.summary === item.summary &&
          existing.importance === item.importance;
        if (unchanged) continue;
        await database.newsItem.update({ where: { id: item.id }, data: row });
        updated += 1;
      } else {
        await database.newsItem.create({ data: { id: item.id, ...row } });
        added += 1;
      }
    }
    return { added, updated };
  }

  async byId(id: string): Promise<NewsItem | null> {
    const database = this.prisma.db;
    if (!database) {
      const { items } = await this.file.read();
      return items.find((item) => item.id === id) ?? null;
    }
    const row = await database.newsItem.findUnique({ where: { id } });
    return row ? fromRow(row) : null;
  }

  async byIds(ids: string[]): Promise<NewsItem[]> {
    if (ids.length === 0) return [];
    const database = this.prisma.db;
    if (!database) {
      const { items } = await this.file.read();
      const wanted = new Set(ids);
      return items.filter((item) => wanted.has(item.id));
    }
    const rows = await database.newsItem.findMany({ where: { id: { in: ids } } });
    return rows.map(fromRow);
  }

  async query(query: NewsQuery): Promise<NewsPage> {
    const limit = Math.min(MAX_LIMIT, Math.max(1, query.limit ?? DEFAULT_LIMIT));
    const database = this.prisma.db;

    if (!database) {
      const { items } = await this.file.read();
      return pageInMemory(items, query, limit);
    }

    const cursor = decodeCursor(query.cursor);
    const where: Record<string, unknown> = {};
    if (query.symbols?.length) where.symbols = { hasSome: query.symbols };
    if (query.categories?.length) where.categories = { hasSome: query.categories };
    if (query.providers?.length) where.provider = { in: query.providers };
    if (query.minImportance) {
      where.importance = {
        in: ['low', 'medium', 'high', 'critical'].filter(
          (level) => importanceRank(level as never) >= importanceRank(query.minImportance!),
        ),
      };
    }
    const published: Record<string, Date> = {};
    if (query.from) published.gte = new Date(query.from);
    if (query.to) published.lte = new Date(query.to);
    if (cursor) published.lt = new Date(cursor.publishedAt);
    if (Object.keys(published).length > 0) where.publishedAt = published;
    if (query.q) {
      where.OR = [
        { title: { contains: query.q, mode: 'insensitive' } },
        { summary: { contains: query.q, mode: 'insensitive' } },
      ];
    }

    const [rows, total] = await Promise.all([
      database.newsItem.findMany({
        where: where as never,
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
      }),
      database.newsItem.count({ where: where as never }),
    ]);

    const items = rows.slice(0, limit).map(fromRow);
    const hasMore = rows.length > limit;
    return {
      items,
      total,
      nextCursor: hasMore && items.length > 0 ? encodeCursor(items[items.length - 1]) : null,
    };
  }

  /** Stories about the same symbols, around the same time — never the item itself. */
  async related(item: NewsItem, limit = 5): Promise<NewsItem[]> {
    const windowMs = 3 * 86_400_000;
    const published = Date.parse(item.publishedAt);
    const page = await this.query({
      symbols: item.symbols.length > 0 ? item.symbols : undefined,
      categories: item.symbols.length === 0 ? item.categories : undefined,
      from: new Date(published - windowMs).toISOString(),
      to: new Date(published + windowMs).toISOString(),
      limit: limit + 1,
    });
    return page.items.filter((candidate) => candidate.id !== item.id).slice(0, limit);
  }

  async count(): Promise<number> {
    const database = this.prisma.db;
    if (!database) return (await this.file.read()).items.length;
    return database.newsItem.count();
  }
}

/** Shared with the file backend and with the tests, so the rules cannot drift. */
export function pageInMemory(all: NewsItem[], query: NewsQuery, limit: number): NewsPage {
  const cursor = decodeCursor(query.cursor);
  const needle = query.q?.toLowerCase().trim();

  const matched = all.filter((item) => {
    if (query.providers?.length && !query.providers.includes(item.provider)) return false;
    if (query.symbols?.length && !item.symbols.some((symbol) => query.symbols!.includes(symbol))) {
      return false;
    }
    if (
      query.categories?.length &&
      !item.categories.some((category) => query.categories!.includes(category))
    ) {
      return false;
    }
    if (
      query.minImportance &&
      importanceRank(item.importance) < importanceRank(query.minImportance)
    ) {
      return false;
    }
    if (query.from && item.publishedAt < query.from) return false;
    if (query.to && item.publishedAt > query.to) return false;
    if (needle) {
      const haystack = `${item.title} ${item.summary ?? ''}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });

  const sorted = [...matched].sort(
    (a, b) => b.publishedAt.localeCompare(a.publishedAt) || b.id.localeCompare(a.id),
  );
  const started = cursor ? sorted.filter((item) => item.publishedAt < cursor.publishedAt) : sorted;
  const items = started.slice(0, limit);
  const hasMore = started.length > limit;

  return {
    items,
    total: matched.length,
    nextCursor: hasMore && items.length > 0 ? encodeCursor(items[items.length - 1]) : null,
  };
}

export function encodeCursor(item: NewsItem): string {
  return Buffer.from(`${item.publishedAt}|${item.id}`).toString('base64url');
}

export function decodeCursor(
  cursor: string | undefined,
): { publishedAt: string; id: string } | null {
  if (!cursor) return null;
  try {
    const [publishedAt, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
    if (!publishedAt || !id) return null;
    return { publishedAt, id };
  } catch {
    return null;
  }
}

type NewsRow = {
  id: string;
  title: string;
  summary: string | null;
  body: string | null;
  source: string;
  sourceUrl: string | null;
  canonicalUrl: string | null;
  publishedAt: Date;
  receivedAt: Date;
  symbols: string[];
  categories: string[];
  importance: string;
  sentiment: string | null;
  provider: string;
  providerItemId: string | null;
  metadata: unknown;
};

function fromRow(row: NewsRow): NewsItem {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    body: row.body,
    source: row.source,
    sourceUrl: row.sourceUrl,
    canonicalUrl: row.canonicalUrl,
    publishedAt: row.publishedAt.toISOString(),
    receivedAt: row.receivedAt.toISOString(),
    symbols: row.symbols,
    categories: row.categories,
    importance: row.importance as NewsItem['importance'],
    sentiment: row.sentiment as NewsItem['sentiment'],
    provider: row.provider,
    providerItemId: row.providerItemId,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
  };
}
