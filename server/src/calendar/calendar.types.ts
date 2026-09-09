/** Impact ladder, ordered so comparisons are just index lookups. */
export const IMPACT_ORDER = ['holiday', 'low', 'medium', 'high'] as const;
export type Impact = (typeof IMPACT_ORDER)[number];

export const impactRank = (impact: Impact): number => IMPACT_ORDER.indexOf(impact);

/** How ForexFactory scores a printed number against its forecast. */
export type ActualOutcome = 'better' | 'worse' | 'inline' | 'pending';

/** Precision of the scheduled time — FF publishes some events without a clock time. */
export type TimePrecision = 'exact' | 'all-day' | 'tentative';

export type CalendarEvent = {
  /** Stable across refreshes and across sources. */
  id: string;
  /** ForexFactory's own numeric id, when the scrape provided it. */
  sourceId: number | null;
  title: string;
  currency: string;
  /** Two-letter country code FF uses for the flag, e.g. "US". */
  country: string;
  impact: Impact;
  /** Scheduled release, ISO-8601 UTC. */
  scheduledAt: string;
  timePrecision: TimePrecision;
  actual: string | null;
  forecast: string | null;
  previous: string | null;
  /** Set when FF revised the previous print. */
  revision: string | null;
  outcome: ActualOutcome;
  /** True once a number has printed. */
  released: boolean;
  /** FF flags a small number of prints as leaked ahead of schedule. */
  leaked: boolean;
  /** Which adapter produced this record. */
  source: SourceName;
  /** When the value last changed (not merely when it was re-read). */
  updatedAt: string;
  detailUrl: string | null;
};

export type SourceName = 'forex-factory-scrape' | 'forex-factory-feed';

export type SourceResult = {
  source: SourceName;
  events: CalendarEvent[];
  fetchedAt: string;
  durationMs: number;
};

export type FetchWindow = {
  /** Inclusive UTC start of the requested window. */
  from: Date;
  /** Inclusive UTC end of the requested window. */
  to: Date;
};

export type SyncTrigger = 'boot' | 'interval' | 'manual' | 'release-watch';

export type SyncOutcome = {
  trigger: SyncTrigger;
  source: SourceName | null;
  startedAt: string;
  durationMs: number;
  ok: boolean;
  error: string | null;
  /** Counts of what the merge actually changed. */
  added: number;
  updated: number;
  removed: number;
  /** Events that gained an `actual` value during this sync. */
  released: string[];
};

export type WatchState = {
  eventId: string;
  title: string;
  currency: string;
  scheduledAt: string;
  /** 'armed' = timer set, 'polling' = burst running, 'resolved'/'expired' = finished. */
  phase: 'armed' | 'polling' | 'resolved' | 'expired';
  attempts: number;
  startedAt: string | null;
  /** When the burst will give up on this release. */
  expiresAt: string | null;
  resolvedAt: string | null;
};
