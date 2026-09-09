import { registerAs } from '@nestjs/config';

const int = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const bool = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
};

/**
 * Every knob the calendar pipeline exposes. Defaults match the product brief:
 * two days of history, seven days ahead, a five minute base refresh and a ten
 * second burst around each release.
 */
export const calendarConfig = registerAs('calendar', () => ({
  /** Days of already-released history to keep in the window. */
  pastDays: int(process.env.CALENDAR_PAST_DAYS, 2),
  /** Days of upcoming events to keep in the window. */
  futureDays: int(process.env.CALENDAR_FUTURE_DAYS, 7),

  /** Base polling loop. */
  refreshIntervalMs: int(process.env.CALENDAR_REFRESH_INTERVAL_MS, 5 * 60_000),
  /** Refresh once on boot rather than waiting a full interval. */
  refreshOnBoot: bool(process.env.CALENDAR_REFRESH_ON_BOOT, true),

  /** Release watcher: how early to arm, how fast to poll, how long to persist. */
  watch: {
    enabled: bool(process.env.CALENDAR_WATCH_ENABLED, true),
    /** Fire the first burst poll this long before the scheduled release. */
    leadMs: int(process.env.CALENDAR_WATCH_LEAD_MS, 2_000),
    /** Gap between burst polls while waiting for the actual value. */
    pollIntervalMs: int(process.env.CALENDAR_WATCH_POLL_INTERVAL_MS, 10_000),
    /** Give up on a release after this long and fall back to the base loop. */
    maxDurationMs: int(process.env.CALENDAR_WATCH_MAX_DURATION_MS, 10 * 60_000),
    /** Only watch releases at or above this impact. */
    minImpact: (process.env.CALENDAR_WATCH_MIN_IMPACT ?? 'low') as
      | 'holiday'
      | 'low'
      | 'medium'
      | 'high',
    /** Arm timers only for releases inside this horizon (keeps the timer table small). */
    horizonMs: int(process.env.CALENDAR_WATCH_HORIZON_MS, 26 * 60 * 60_000),
  },

  /** Bounds and trips per-source failures so one blocked source cannot stall the pipeline. */
  sourcePolicy: {
    /** Hard deadline for a single source attempt. */
    timeoutMs: int(process.env.CALENDAR_SOURCE_TIMEOUT_MS, 60_000),
    /** Consecutive failures before a source is taken out of rotation. */
    breakerThreshold: int(process.env.CALENDAR_SOURCE_BREAKER_THRESHOLD, 3),
    /** How long a tripped source stays out before one probe attempt. */
    breakerCooldownMs: int(process.env.CALENDAR_SOURCE_BREAKER_COOLDOWN_MS, 5 * 60_000),
  },

  scraper: {
    baseUrl: process.env.FOREX_FACTORY_URL ?? 'https://www.forexfactory.com',
    /** Playwright needs a real (non-headless) Chromium to clear the Cloudflare check. */
    headless: bool(process.env.SCRAPER_HEADLESS, false),
    executablePath: process.env.SCRAPER_CHROMIUM_PATH || undefined,
    navigationTimeoutMs: int(process.env.SCRAPER_NAVIGATION_TIMEOUT_MS, 90_000),
    /** Keep the browser warm between polls; close it after this much idle time. */
    idleShutdownMs: int(process.env.SCRAPER_IDLE_SHUTDOWN_MS, 15 * 60_000),
    /** Reuse the Cloudflare clearance cookie across polls. */
    userDataDir: process.env.SCRAPER_USER_DATA_DIR ?? '.browser-profile',
    proxyServer: process.env.SCRAPER_PROXY_SERVER || process.env.HTTPS_PROXY || undefined,
    retries: int(process.env.SCRAPER_RETRIES, 2),
  },

  /** Last-known-good scrape persisted to disk so restarts come up warm. */
  snapshot: {
    enabled: bool(process.env.CALENDAR_SNAPSHOT_ENABLED, true),
    /** Runtime cache, rewritten after every successful fetch. */
    path: process.env.CALENDAR_SNAPSHOT_PATH ?? 'data/calendar-snapshot.json',
    /** Checked-in fixture used on a first run, before any fetch has succeeded. */
    seedPath: process.env.CALENDAR_SNAPSHOT_SEED_PATH ?? 'seed/calendar-snapshot.json',
  },

  /** faireconomy publishes ForexFactory's weekly feed as JSON — used when the scrape fails. */
  feed: {
    enabled: bool(process.env.CALENDAR_FEED_ENABLED, true),
    url: process.env.CALENDAR_FEED_URL ?? 'https://nfs.faireconomy.media/ff_calendar_thisweek.json',
    timeoutMs: int(process.env.CALENDAR_FEED_TIMEOUT_MS, 20_000),
  },

  http: {
    port: int(process.env.PORT, 4000),
    corsOrigin: process.env.CORS_ORIGIN ?? '*',
  },
}));

export type CalendarConfig = ReturnType<typeof calendarConfig>;
