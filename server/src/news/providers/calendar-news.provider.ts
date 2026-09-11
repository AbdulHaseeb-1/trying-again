import { Injectable } from '@nestjs/common';

import { CalendarService } from '../../calendar/calendar.service';
import type { CalendarEvent } from '../../calendar/calendar.types';
import type { RawNewsItem } from '../normalization/news.normalize';
import type { NewsProvider } from './news-provider';

/**
 * The application's own news: economic releases, the moment they print.
 *
 * This is the provider that makes "all news available inside the application"
 * true rather than aspirational. The calendar pipeline already burst-polls
 * every release until the number lands; a printed number *is* the story, and it
 * is better than any wire copy about it — it has the forecast, the previous
 * value, the revision and the source's own verdict attached.
 *
 * Only released events become news. A scheduled event is a calendar entry, and
 * the agent reads those through the calendar tools instead.
 */
@Injectable()
export class CalendarNewsProvider implements NewsProvider {
  readonly id = 'app-calendar';
  readonly name = 'MarketPulse Calendar';

  constructor(private readonly calendar: CalendarService) {}

  isConfigured(): boolean {
    return true;
  }

  async poll(): Promise<RawNewsItem[]> {
    return this.calendar
      .query({})
      .filter((event) => event.released && event.actual !== null)
      .map((event) => this.toRaw(event));
  }

  private toRaw(event: CalendarEvent): RawNewsItem {
    const parts = [
      event.forecast ? `forecast ${event.forecast}` : null,
      event.previous ? `previous ${event.previous}` : null,
      event.revision ? `revised from ${event.revision}` : null,
    ].filter(Boolean);

    return {
      provider: this.id,
      // The calendar's own id is already stable across sources and refreshes.
      providerItemId: event.id,
      title: `${event.currency} ${event.title}: ${event.actual}`,
      summary: parts.length > 0 ? `${event.actual} against ${parts.join(', ')}.` : null,
      body: null,
      source: this.name,
      sourceUrl: event.detailUrl,
      canonicalUrl: event.detailUrl,
      publishedAt: event.updatedAt,
      symbols: [event.currency],
      categories: ['macro', 'economic-calendar', event.country],
      importance: importanceOf(event),
      sentiment: sentimentOf(event),
      metadata: {
        eventId: event.id,
        impact: event.impact,
        outcome: event.outcome,
        actual: event.actual,
        forecast: event.forecast,
        previous: event.previous,
        revision: event.revision,
        scheduledAt: event.scheduledAt,
        leaked: event.leaked,
      },
    };
  }
}

function importanceOf(event: CalendarEvent): string {
  if (event.impact === 'high') {
    // A high-impact release that missed its forecast is the one a trader wants
    // at the top of the list.
    return event.outcome === 'inline' ? 'high' : 'critical';
  }
  if (event.impact === 'medium') return 'medium';
  return 'low';
}

function sentimentOf(event: CalendarEvent): string | null {
  // ForexFactory scores the print for the *currency*, which is the frame a
  // reader of a USD release expects.
  if (event.outcome === 'better') return 'bullish';
  if (event.outcome === 'worse') return 'bearish';
  if (event.outcome === 'inline') return 'neutral';
  return null;
}
