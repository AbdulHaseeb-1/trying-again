import { Inject, Injectable, Logger } from '@nestjs/common';

import { normalizeNewsItem } from './normalization/news.normalize';
import { NEWS_PROVIDERS, type NewsProvider } from './providers/news-provider';
import { NewsRepository } from './news.repository';
import type { NewsItem, NewsPage, NewsQuery } from './news.types';

export type NewsSyncOutcome = {
  startedAt: string;
  durationMs: number;
  providers: { id: string; ok: boolean; fetched: number; added: number; updated: number; error: string | null }[];
  added: number;
  updated: number;
};

/**
 * News as an application capability rather than a screen.
 *
 * Sync is per-provider and failure-isolated, on the same reasoning as the
 * calendar's source rotation: one blocked feed must not stop the rest, and a
 * partial sync should be visible rather than silently thin.
 */
@Injectable()
export class NewsService {
  private readonly logger = new Logger(NewsService.name);
  private lastSync: NewsSyncOutcome | null = null;
  private syncing: Promise<NewsSyncOutcome> | null = null;

  constructor(
    @Inject(NEWS_PROVIDERS) private readonly providers: NewsProvider[],
    private readonly repository: NewsRepository,
  ) {}

  get providerIds(): string[] {
    return this.providers.filter((provider) => provider.isConfigured()).map((p) => p.id);
  }

  get lastOutcome(): NewsSyncOutcome | null {
    return this.lastSync;
  }

  get backend(): string {
    return this.repository.backend;
  }

  /** Concurrent callers share one pass, exactly as the calendar pipeline does. */
  async sync(signal?: AbortSignal): Promise<NewsSyncOutcome> {
    if (this.syncing) return this.syncing;
    this.syncing = this.runSync(signal).finally(() => {
      this.syncing = null;
    });
    return this.syncing;
  }

  private async runSync(signal?: AbortSignal): Promise<NewsSyncOutcome> {
    const startedAt = new Date();
    const rows: NewsSyncOutcome['providers'] = [];
    let added = 0;
    let updated = 0;

    for (const provider of this.providers) {
      if (!provider.isConfigured()) continue;
      try {
        const raw = await provider.poll(signal);
        const items = raw
          .map((entry) => normalizeNewsItem(entry, startedAt))
          .filter((item): item is NewsItem => item !== null);
        const result = await this.repository.upsertMany(items);
        added += result.added;
        updated += result.updated;
        rows.push({
          id: provider.id,
          ok: true,
          fetched: items.length,
          added: result.added,
          updated: result.updated,
          error: null,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`news provider "${provider.id}" failed: ${message}`);
        rows.push({ id: provider.id, ok: false, fetched: 0, added: 0, updated: 0, error: message });
      }
    }

    const outcome: NewsSyncOutcome = {
      startedAt: startedAt.toISOString(),
      durationMs: Date.now() - startedAt.getTime(),
      providers: rows,
      added,
      updated,
    };
    this.lastSync = outcome;
    if (added > 0 || updated > 0) {
      this.logger.log(`news sync: +${added} new, ${updated} updated`);
    }
    return outcome;
  }

  search(query: NewsQuery): Promise<NewsPage> {
    return this.repository.query(query);
  }

  latest(limit = 20, symbols?: string[]): Promise<NewsPage> {
    return this.repository.query({ limit, symbols });
  }

  byId(id: string): Promise<NewsItem | null> {
    return this.repository.byId(id);
  }

  byIds(ids: string[]): Promise<NewsItem[]> {
    return this.repository.byIds(ids);
  }

  forSymbol(symbol: string, limit = 10): Promise<NewsPage> {
    return this.repository.query({ symbols: [symbol.toUpperCase()], limit });
  }

  between(from: string, to: string, limit = 50): Promise<NewsPage> {
    return this.repository.query({ from, to, limit });
  }

  async related(id: string, limit = 5): Promise<NewsItem[]> {
    const item = await this.repository.byId(id);
    if (!item) return [];
    return this.repository.related(item, limit);
  }

  count(): Promise<number> {
    return this.repository.count();
  }
}
