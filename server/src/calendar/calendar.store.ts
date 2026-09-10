import { Injectable } from '@nestjs/common';

import { hasMaterialChange, mergeEvent } from './calendar.mapper';
import type { CalendarEvent, FetchWindow, SourceName } from './calendar.types';

export type MergeReport = {
  added: number;
  updated: number;
  removed: number;
  /** Ids of events that gained an `actual` value in this merge. */
  released: string[];
  /**
   * The rows this merge actually wrote. The archive persists these and nothing
   * else, so a sync that re-read the same numbers writes nothing at all.
   */
  changed: CalendarEvent[];
};

/**
 * The in-memory projection of the calendar window.
 *
 * Keeping it separate from fetching means a failed poll can never blank the
 * app: the store only ever advances, and a source that returns a partial
 * window prunes nothing outside the range it actually covered.
 */
@Injectable()
export class CalendarStore {
  private readonly events = new Map<string, CalendarEvent>();
  private lastChangedAt: string | null = null;

  /**
   * Fold a source result into the store.
   *
   * `coveredWindow` bounds pruning: events inside it that the source no longer
   * lists were genuinely removed upstream, while everything outside is simply
   * out of that source's reach and must be left alone.
   */
  merge(incoming: CalendarEvent[], coveredWindow: FetchWindow, sourceName?: SourceName): MergeReport {
    const report: MergeReport = { added: 0, updated: 0, removed: 0, released: [], changed: [] };
    const seen = new Set<string>();

    for (const event of incoming) {
      seen.add(event.id);
      const stored = this.events.get(event.id);
      if (!stored) {
        this.events.set(event.id, event);
        report.added += 1;
        report.changed.push(event);
        if (event.released) report.released.push(event.id);
        continue;
      }

      const merged = mergeEvent(stored, event);
      if (!hasMaterialChange(stored, merged)) continue;

      this.events.set(event.id, merged);
      report.updated += 1;
      report.changed.push(merged);
      if (!stored.actual && merged.actual) report.released.push(event.id);
    }

    for (const [id, event] of this.events) {
      if (seen.has(id)) continue;
      const at = new Date(event.scheduledAt).getTime();
      const inside = at >= coveredWindow.from.getTime() && at <= coveredWindow.to.getTime();
      if (!inside) continue;
      // Only prune what this source could have listed and didn't. A row the
      // scraper produced must survive a feed-only sync, since the feed simply
      // does not carry it.
      if (sourceName && event.source !== sourceName) continue;
      this.events.delete(id);
      report.removed += 1;
    }

    if (report.added || report.updated || report.removed) {
      this.lastChangedAt = new Date().toISOString();
    }
    return report;
  }

  /** Drop everything that fell out of the retention window. */
  prune(window: FetchWindow): number {
    let removed = 0;
    for (const [id, event] of this.events) {
      const at = new Date(event.scheduledAt).getTime();
      if (at < window.from.getTime() || at > window.to.getTime()) {
        this.events.delete(id);
        removed += 1;
      }
    }
    return removed;
  }

  get(id: string): CalendarEvent | undefined {
    return this.events.get(id);
  }

  /** All events, oldest first. */
  all(): CalendarEvent[] {
    return [...this.events.values()].sort(
      (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
    );
  }

  get size(): number {
    return this.events.size;
  }

  get changedAt(): string | null {
    return this.lastChangedAt;
  }

  /** Seed the store from a persisted snapshot without reporting it as a sync. */
  hydrate(events: CalendarEvent[]): number {
    for (const event of events) {
      if (!this.events.has(event.id)) this.events.set(event.id, event);
    }
    return this.events.size;
  }
}
