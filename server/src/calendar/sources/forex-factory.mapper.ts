import { buildEventId, cleanValue, normalizeImpact, normalizeOutcome } from '../calendar.mapper';
import type { CalendarEvent, TimePrecision } from '../calendar.types';

/** The shape ForexFactory hangs off `window.calendarComponentStates`. */
export type RawForexFactoryEvent = {
  id: number;
  name: string;
  country: string;
  currency: string;
  /** Unix seconds — timezone independent, unlike the rendered `timeLabel`. */
  dateline: number;
  impactTitle: string;
  impactName: string;
  timeLabel: string;
  timeMasked: boolean;
  actual: string;
  forecast: string;
  previous: string;
  revision: string;
  actualBetterWorse: number;
  leaked: boolean;
  url: string;
};

export type RawForexFactoryDay = { dateline: number; events: RawForexFactoryEvent[] };

/**
 * The single definition of how a ForexFactory row becomes a domain event.
 * Shared by the live scraper and by the snapshot tooling so the two can never
 * drift apart.
 */
export function toCalendarEvent(
  raw: RawForexFactoryEvent,
  options: { baseUrl: string; observedAt?: string },
): CalendarEvent | null {
  if (!raw?.name || !raw.dateline) return null;

  const scheduledAt = new Date(raw.dateline * 1000);
  const actual = cleanValue(raw.actual);
  const label = (raw.timeLabel ?? '').toLowerCase();
  const timePrecision: TimePrecision = label.includes('all day')
    ? 'all-day'
    : raw.timeMasked || label.includes('tentative')
      ? 'tentative'
      : 'exact';

  return {
    id: buildEventId({ title: raw.name, currency: raw.currency, scheduledAt }),
    sourceId: raw.id ?? null,
    title: raw.name.trim(),
    currency: (raw.currency ?? '').toUpperCase(),
    country: (raw.country ?? '').toUpperCase(),
    impact: normalizeImpact(raw.impactTitle || raw.impactName),
    scheduledAt: scheduledAt.toISOString(),
    timePrecision,
    actual,
    forecast: cleanValue(raw.forecast),
    previous: cleanValue(raw.previous),
    revision: cleanValue(raw.revision),
    outcome: normalizeOutcome(raw.actualBetterWorse, actual),
    released: actual !== null,
    leaked: Boolean(raw.leaked),
    source: 'forex-factory-scrape',
    updatedAt: options.observedAt ?? new Date().toISOString(),
    detailUrl: raw.url ? `${options.baseUrl}${raw.url}` : null,
  };
}
