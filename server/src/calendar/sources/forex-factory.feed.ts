import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';

import { calendarConfig } from '../../config/configuration';
import { buildEventId, cleanValue, normalizeImpact, normalizeOutcome } from '../calendar.mapper';
import type { CalendarEvent, SourceName } from '../calendar.types';
import type { CalendarSource, FetchWindow, SourceResult } from './calendar-source';

/** faireconomy's weekly mirror of the ForexFactory calendar. */
type FeedEntry = {
  title: string;
  country: string;
  date: string;
  impact: string;
  forecast: string;
  previous: string;
};

/**
 * Fallback source. It needs no browser, so it keeps the app populated when the
 * scrape is blocked — but it only publishes the current week and carries no
 * `actual` values, which is exactly why the scraper stays primary.
 */
@Injectable()
export class ForexFactoryFeed implements CalendarSource {
  readonly name: SourceName = 'forex-factory-feed';
  readonly priority = 1;

  private readonly logger = new Logger(ForexFactoryFeed.name);

  constructor(
    @Inject(calendarConfig.KEY)
    private readonly config: ConfigType<typeof calendarConfig>,
  ) {}

  async fetch(window: FetchWindow): Promise<SourceResult> {
    const startedAt = Date.now();
    const response = await fetch(this.config.feed.url, {
      signal: AbortSignal.timeout(this.config.feed.timeoutMs),
      headers: { accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`feed responded ${response.status}`);

    const entries = (await response.json()) as FeedEntry[];
    const events = entries
      .map((entry) => this.toCalendarEvent(entry))
      .filter((event): event is CalendarEvent => event !== null)
      .filter((event) => {
        const at = new Date(event.scheduledAt).getTime();
        return at >= window.from.getTime() && at <= window.to.getTime();
      });

    this.logger.log(`feed returned ${events.length} events inside the window`);
    return {
      source: this.name,
      events,
      fetchedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
    };
  }

  private toCalendarEvent(entry: FeedEntry): CalendarEvent | null {
    if (!entry?.title || !entry.date) return null;
    const scheduledAt = new Date(entry.date);
    if (Number.isNaN(scheduledAt.getTime())) return null;

    // The feed labels rows by currency; there is no separate country code.
    const currency = (entry.country ?? '').toUpperCase();
    return {
      id: buildEventId({ title: entry.title, currency, scheduledAt }),
      sourceId: null,
      title: entry.title.trim(),
      currency,
      country: currency.slice(0, 2),
      impact: normalizeImpact(entry.impact),
      scheduledAt: scheduledAt.toISOString(),
      timePrecision: 'exact',
      actual: null,
      forecast: cleanValue(entry.forecast),
      previous: cleanValue(entry.previous),
      revision: null,
      outcome: normalizeOutcome(0, null),
      released: false,
      leaked: false,
      source: this.name,
      updatedAt: new Date().toISOString(),
      detailUrl: null,
    };
  }
}
