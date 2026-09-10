import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  BrokenCircuitError,
  ConsecutiveBreaker,
  ExponentialBackoff,
  TaskCancelledError,
  circuitBreaker,
  handleAll,
  timeout,
  wrap,
  TimeoutStrategy,
  type IPolicy,
} from 'cockatiel';

import { calendarConfig } from '../config/configuration';
import { CalendarArchive } from './calendar.archive';
import { CalendarSnapshot } from './calendar.snapshot';
import { CalendarStore } from './calendar.store';
import type {
  CalendarEvent,
  FetchWindow,
  Impact,
  SourceName,
  SyncOutcome,
  SyncTrigger,
} from './calendar.types';
import { impactRank } from './calendar.types';
import { ForexFactoryFeed } from './sources/forex-factory.feed';
import { ForexFactoryScraper } from './sources/forex-factory.scraper';
import type { CalendarSource } from './sources/calendar-source';

export const CALENDAR_SYNCED = 'calendar.synced';
export const CALENDAR_RELEASED = 'calendar.released';

export type CalendarQuery = {
  from?: Date;
  to?: Date;
  currencies?: string[];
  minImpact?: Impact;
};

/**
 * Owns the sync pipeline: pick a window, walk the sources until one answers,
 * fold the result into the store and announce what changed.
 */
@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);
  private readonly sources: CalendarSource[];
  /** One breaker per source: a blocked scraper must not slow the feed down. */
  private readonly policies = new Map<SourceName, IPolicy>();
  private inFlight: Promise<SyncOutcome> | null = null;
  private history: SyncOutcome[] = [];
  private restoredAt: string | null = null;

  constructor(
    private readonly store: CalendarStore,
    private readonly snapshot: CalendarSnapshot,
    private readonly archive: CalendarArchive,
    private readonly events: EventEmitter2,
    scraper: ForexFactoryScraper,
    feed: ForexFactoryFeed,
    @Inject(calendarConfig.KEY)
    private readonly config: ConfigType<typeof calendarConfig>,
  ) {
    this.sources = [scraper, ...(config.feed.enabled ? [feed] : [])].sort(
      (a, b) => a.priority - b.priority,
    );

    for (const source of this.sources) {
      this.policies.set(
        source.name,
        wrap(
          circuitBreaker(handleAll, {
            halfOpenAfter: new ExponentialBackoff({
              initialDelay: config.sourcePolicy.breakerCooldownMs,
              maxDelay: config.sourcePolicy.breakerCooldownMs * 4,
            }),
            breaker: new ConsecutiveBreaker(config.sourcePolicy.breakerThreshold),
          }),
          timeout(config.sourcePolicy.timeoutMs, TimeoutStrategy.Aggressive),
        ),
      );
    }
  }

  /**
   * Seed the store so the app is populated before the first live fetch returns
   * — and stays populated if it fails.
   *
   * Both sources are read and merged rather than one being preferred: the
   * archive holds everything this service has ever seen, but a fresh database
   * holds nothing, and the file snapshot is the only thing standing between a
   * first run and an empty screen. Whichever knows about an event wins for that
   * event, and anything the file knew that the archive did not is written back,
   * so the two converge instead of drifting.
   */
  async restore(): Promise<number> {
    const window = this.window();
    const inWindow = (event: CalendarEvent): boolean => {
      const at = new Date(event.scheduledAt).getTime();
      return at >= window.from.getTime() && at <= window.to.getTime();
    };

    const stored = this.archive.enabled
      ? await this.archive.query({ from: window.from, to: window.to, limit: 5_000 }).catch((error) => {
          this.logger.warn(`archive restore failed: ${error}`);
          return [] as CalendarEvent[];
        })
      : [];

    const snapshot = await this.snapshot.load();
    const fromFile = (snapshot?.events ?? []).filter(inWindow);

    if (!stored.length && !fromFile.length) return 0;

    // The archive is hydrated first, so where both know an event the stored
    // copy — which has been through every merge rule — is the one kept.
    this.store.hydrate(stored);
    const size = this.store.hydrate(fromFile);

    const known = new Set(stored.map((event) => event.id));
    const missing = fromFile.filter((event) => !known.has(event.id));
    if (missing.length) void this.archive.persist(missing);

    this.restoredAt =
      stored.reduce<string | null>(
        (latest, event) => (!latest || event.updatedAt > latest ? event.updatedAt : latest),
        null,
      ) ?? snapshot?.capturedAt ?? null;

    this.logger.log(
      this.archive.enabled
        ? `restored ${size} events (${stored.length} archived, ${missing.length} backfilled from the snapshot)`
        : `restored ${size} events from the snapshot`,
    );
    return size;
  }

  /** History from the archive: everything that has fallen out of the window. */
  archiveHistory(query: CalendarQuery & { releasedOnly?: boolean; limit?: number } = {}) {
    return this.archive.query({
      from: query.from,
      to: query.to,
      currencies: query.currencies,
      minImpact: query.minImpact,
      releasedOnly: query.releasedOnly,
      limit: query.limit,
    });
  }

  /** Whether history is available at all, and what it holds. */
  archiveSummary() {
    return this.archive.summary();
  }

  get archiveEnabled(): boolean {
    return this.archive.enabled;
  }

  /** The rolling window the product asks for: N days back, M days forward. */
  window(): FetchWindow {
    const now = new Date();
    const from = new Date(now);
    from.setUTCDate(from.getUTCDate() - this.config.pastDays);
    from.setUTCHours(0, 0, 0, 0);
    const to = new Date(now);
    to.setUTCDate(to.getUTCDate() + this.config.futureDays);
    to.setUTCHours(23, 59, 59, 999);
    return { from, to };
  }

  /**
   * Refresh the window. Concurrent callers share one run — the release watcher
   * and the base interval regularly land at the same moment, and hammering
   * ForexFactory with duplicate scrapes is both slower and ruder.
   */
  async sync(trigger: SyncTrigger): Promise<SyncOutcome> {
    if (this.inFlight) {
      this.logger.debug(`sync(${trigger}) joined an in-flight run`);
      return this.inFlight;
    }
    this.inFlight = this.runSync(trigger).finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async runSync(trigger: SyncTrigger): Promise<SyncOutcome> {
    const startedAt = new Date();
    const window = this.window();
    const errors: string[] = [];

    for (const source of this.sources) {
      try {
        const policy = this.policies.get(source.name);
        const result = await (policy
          ? policy.execute(() => source.fetch(window))
          : source.fetch(window));
        const report = this.store.merge(result.events, window, result.source);
        this.store.prune(window);
        void this.snapshot.save({
          capturedAt: result.fetchedAt,
          source: result.source,
          events: this.store.all(),
        });
        // Only the rows that changed, so a sync that re-read the same numbers
        // touches nothing. Fire-and-forget: the archive never gates a sync.
        void this.archive
          .persist(report.changed)
          .then(() => this.archive.markReleased(report.released));

        const outcome: SyncOutcome = {
          trigger,
          source: result.source,
          startedAt: startedAt.toISOString(),
          durationMs: Date.now() - startedAt.getTime(),
          ok: true,
          error: null,
          ...report,
        };
        this.record(outcome);
        this.logger.log(
          `sync(${trigger}) via ${result.source}: +${report.added} ~${report.updated} -${report.removed} in ${outcome.durationMs}ms`,
        );

        this.events.emit(CALENDAR_SYNCED, outcome);
        for (const id of report.released) {
          const event = this.store.get(id);
          if (event) this.events.emit(CALENDAR_RELEASED, event);
        }
        return outcome;
      } catch (error) {
        const message = this.describeSourceFailure(error);
        errors.push(`${source.name}: ${message}`);
        this.logger.warn(`source ${source.name} failed: ${message}`);
      }
    }

    const outcome: SyncOutcome = {
      trigger,
      source: null,
      startedAt: startedAt.toISOString(),
      durationMs: Date.now() - startedAt.getTime(),
      ok: false,
      error: errors.join(' | ') || 'no sources configured',
      added: 0,
      updated: 0,
      removed: 0,
      released: [],
    };
    this.record(outcome);
    this.events.emit(CALENDAR_SYNCED, outcome);
    return outcome;
  }

  /** Turn cockatiel's control-flow errors into something a log reader can act on. */
  private describeSourceFailure(error: unknown): string {
    if (error instanceof BrokenCircuitError) {
      return 'circuit open after repeated failures; skipping until cooldown elapses';
    }
    if (error instanceof TaskCancelledError) {
      return `exceeded the ${this.config.sourcePolicy.timeoutMs}ms source timeout`;
    }
    return error instanceof Error ? error.message : String(error);
  }

  private record(outcome: SyncOutcome): void {
    this.history = [outcome, ...this.history].slice(0, 20);
  }

  query(filter: CalendarQuery = {}): CalendarEvent[] {
    const minRank = filter.minImpact ? impactRank(filter.minImpact) : -1;
    const currencies = filter.currencies?.map((code) => code.toUpperCase());

    return this.store.all().filter((event) => {
      const at = new Date(event.scheduledAt).getTime();
      if (filter.from && at < filter.from.getTime()) return false;
      if (filter.to && at > filter.to.getTime()) return false;
      if (minRank >= 0 && impactRank(event.impact) < minRank) return false;
      if (currencies?.length && !currencies.includes(event.currency)) return false;
      return true;
    });
  }

  /** The next event that has not printed yet. */
  nextRelease(minImpact?: Impact): CalendarEvent | null {
    const now = Date.now();
    const minRank = minImpact ? impactRank(minImpact) : -1;
    return (
      this.store
        .all()
        .find(
          (event) =>
            !event.released &&
            event.timePrecision === 'exact' &&
            new Date(event.scheduledAt).getTime() >= now &&
            impactRank(event.impact) >= minRank,
        ) ?? null
    );
  }

  /** Upcoming events that still need an `actual`, inside the watcher horizon. */
  pendingReleases(horizonMs: number, minImpact: Impact): CalendarEvent[] {
    const now = Date.now();
    const minRank = impactRank(minImpact);
    return this.store
      .all()
      .filter(
        (event) =>
          !event.released &&
          event.timePrecision === 'exact' &&
          impactRank(event.impact) >= minRank &&
          new Date(event.scheduledAt).getTime() > now &&
          new Date(event.scheduledAt).getTime() - now <= horizonMs,
      );
  }

  get lastSync(): SyncOutcome | null {
    return this.history[0] ?? null;
  }

  get recentSyncs(): SyncOutcome[] {
    return this.history;
  }

  get sourceNames(): SourceName[] {
    return this.sources.map((source) => source.name);
  }

  get count(): number {
    return this.store.size;
  }

  get changedAt(): string | null {
    return this.store.changedAt;
  }

  /** When the snapshot that seeded this process was captured, if one was used. */
  get snapshotCapturedAt(): string | null {
    return this.restoredAt;
  }
}
