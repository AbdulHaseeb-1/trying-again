import { createHash } from 'node:crypto';

import { IMPACT_ORDER, type ActualOutcome, type CalendarEvent, type Impact } from './calendar.types';

/**
 * A source-independent identity for an event.
 *
 * ForexFactory's numeric ids are stable, but the JSON feed does not carry them,
 * so both adapters hash the tuple that actually identifies a release. The two
 * sources then merge cleanly instead of duplicating every row.
 */
export function buildEventId(input: {
  title: string;
  currency: string;
  scheduledAt: Date;
}): string {
  const day = input.scheduledAt.toISOString().slice(0, 10);
  const slug = input.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const digest = createHash('sha1')
    .update(`${day}|${input.currency}|${slug}`)
    .digest('hex')
    .slice(0, 8);
  return `${day}-${input.currency.toLowerCase()}-${digest}`;
}

/** FF writes impact as "High Impact Expected" / "Non-Economic" / a bare word. */
export function normalizeImpact(raw: string | null | undefined): Impact {
  const value = (raw ?? '').toLowerCase();
  if (value.includes('high')) return 'high';
  if (value.includes('medium') || value.includes('moderate')) return 'medium';
  if (value.includes('non-economic') || value.includes('holiday')) return 'holiday';
  if (value.includes('low')) return 'low';
  return IMPACT_ORDER.includes(value as Impact) ? (value as Impact) : 'low';
}

/** FF's actualBetterWorse: 0 = no verdict, 1 = better than forecast, 2 = worse. */
export function normalizeOutcome(
  betterWorse: number | null | undefined,
  actual: string | null,
): ActualOutcome {
  if (!actual) return 'pending';
  if (betterWorse === 1) return 'better';
  if (betterWorse === 2) return 'worse';
  return 'inline';
}

/** Blank strings, "&nbsp;" and lone dashes all mean "no value" on ForexFactory. */
export function cleanValue(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const value = raw.replace(/ /g, ' ').trim();
  if (!value || value === '-' || value === '—') return null;
  return value;
}

/** True when `next` carries information that `previous` did not. */
export function hasMaterialChange(previous: CalendarEvent, next: CalendarEvent): boolean {
  const fields = [
    'title',
    'currency',
    'country',
    'impact',
    'scheduledAt',
    'timePrecision',
    'actual',
    'forecast',
    'previous',
    'revision',
    'outcome',
    'leaked',
  ] as const;
  return fields.some((field) => previous[field] !== next[field]);
}

/**
 * Merge a freshly scraped event over the stored one.
 *
 * The scrape is authoritative for everything except an `actual` that has
 * already printed: ForexFactory briefly blanks the cell while it revises, and
 * we must not let the UI flip a released event back to "pending".
 */
export function mergeEvent(stored: CalendarEvent, incoming: CalendarEvent): CalendarEvent {
  const merged: CalendarEvent = { ...stored, ...incoming };
  if (stored.actual && !incoming.actual) {
    merged.actual = stored.actual;
    merged.outcome = stored.outcome;
    merged.released = true;
  }
  merged.updatedAt = hasMaterialChange(stored, merged) ? incoming.updatedAt : stored.updatedAt;
  return merged;
}
