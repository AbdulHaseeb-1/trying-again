/**
 * Wire types for the calendar API, mirrored from the NestJS service.
 * Kept in one place so the screen never reaches into raw JSON.
 */

export const IMPACT_ORDER = ['holiday', 'low', 'medium', 'high'] as const;
export type Impact = (typeof IMPACT_ORDER)[number];

export type ActualOutcome = 'better' | 'worse' | 'inline' | 'pending';
export type TimePrecision = 'exact' | 'all-day' | 'tentative';

export type CalendarEvent = {
  id: string;
  sourceId: number | null;
  title: string;
  currency: string;
  country: string;
  impact: Impact;
  /** ISO-8601 UTC. */
  scheduledAt: string;
  timePrecision: TimePrecision;
  actual: string | null;
  forecast: string | null;
  previous: string | null;
  revision: string | null;
  outcome: ActualOutcome;
  released: boolean;
  leaked: boolean;
  source: string;
  updatedAt: string;
  detailUrl: string | null;
};

export type SyncOutcome = {
  trigger: string;
  source: string | null;
  startedAt: string;
  durationMs: number;
  ok: boolean;
  error: string | null;
  added: number;
  updated: number;
  removed: number;
  released: string[];
};

export type CalendarHistoryResponse = {
  range: { from: string | null; to: string | null };
  count: number;
  events: CalendarEvent[];
};

export type CalendarResponse = {
  window: { from: string; to: string };
  generatedAt: string;
  lastSync: SyncOutcome | null;
  lastChangedAt: string | null;
  snapshotCapturedAt: string | null;
  refreshIntervalMs: number;
  /** False when the service is running without its Postgres archive. */
  archiveEnabled?: boolean;
  nextRelease: CalendarEvent | null;
  count: number;
  days: { date: string; events: CalendarEvent[] }[];
  events: CalendarEvent[];
};

export const impactRank = (impact: Impact): number => IMPACT_ORDER.indexOf(impact);

/** Currencies the filter row offers, in the order traders scan them. */
export const CURRENCY_FILTERS = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD', 'CNY'] as const;

export const CURRENCY_NAMES: Record<string, string> = {
  USD: 'US Dollar',
  EUR: 'Euro',
  GBP: 'British Pound',
  JPY: 'Japanese Yen',
  AUD: 'Australian Dollar',
  NZD: 'New Zealand Dollar',
  CAD: 'Canadian Dollar',
  CHF: 'Swiss Franc',
  CNY: 'Chinese Yuan',
  ALL: 'All currencies',
};

export const IMPACT_FILTERS = [
  { label: 'All', value: null },
  { label: 'Medium+', value: 'medium' as Impact },
  { label: 'High', value: 'high' as Impact },
] as const;

/** Local-day key (not UTC) so "Today" means the user's today. */
export function dayKey(iso: string): string {
  const date = new Date(iso);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function todayKey(now = new Date()): string {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

/** "Today" / "Tomorrow" / "Yesterday", else "Thu 10 Sep". */
export function formatDayLabel(key: string, now = new Date()): string {
  const today = todayKey(now);
  if (key === today) return 'Today';

  const shift = (days: number) => {
    const date = new Date(`${today}T00:00:00`);
    date.setDate(date.getDate() + days);
    return todayKey(date);
  };
  if (key === shift(1)) return 'Tomorrow';
  if (key === shift(-1)) return 'Yesterday';

  return new Date(`${key}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export function formatTime(event: CalendarEvent): string {
  if (event.timePrecision === 'all-day') return 'All day';
  if (event.timePrecision === 'tentative') return 'Tentative';
  return new Date(event.scheduledAt).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/** Compact countdown: "2d 4h", "3h 12m", "42m 09s", "now". */
export function formatCountdown(target: string, now = Date.now()): string {
  const delta = new Date(target).getTime() - now;
  if (delta <= 0) return 'now';

  const seconds = Math.floor(delta / 1000);
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const rest = seconds % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  return `${minutes}m ${String(rest).padStart(2, '0')}s`;
}

/** "2 min ago" — used for the freshness line. */
export function formatRelative(iso: string | null, now = Date.now()): string {
  if (!iso) return 'never';
  const seconds = Math.round((now - new Date(iso).getTime()) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
