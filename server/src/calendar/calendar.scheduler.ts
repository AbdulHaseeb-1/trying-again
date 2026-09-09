import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { SchedulerRegistry } from '@nestjs/schedule';

import { calendarConfig } from '../config/configuration';
import { CALENDAR_SYNCED, CalendarService } from './calendar.service';
import type { CalendarEvent, SyncOutcome, WatchState } from './calendar.types';

const BASE_INTERVAL = 'calendar:base-refresh';
const watchTimer = (eventId: string) => `calendar:watch:${eventId}`;

/**
 * Drives every refresh in the system.
 *
 * Two loops run side by side:
 *
 * - a base interval (default five minutes) that keeps the whole window fresh;
 * - a release watcher that arms a timer for each upcoming event's exact
 *   scheduled moment, then polls every ten seconds until the actual number
 *   lands. That burst is what turns "eventually correct" into "correct within
 *   seconds of the print", without polling hard the other 99% of the time.
 *
 * Crucially there is only ever *one* burst loop. Releases cluster — four US
 * numbers routinely drop on the same 12:30 tick — and giving each watch its own
 * poller multiplies the request rate by the size of the cluster, which is a
 * good way to earn an HTTP 429 exactly when the data matters most. One sync
 * serves every watch waiting on that tick.
 *
 * Timers are registered with Nest's SchedulerRegistry so they are
 * introspectable via /status and torn down cleanly on shutdown.
 */
@Injectable()
export class CalendarScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(CalendarScheduler.name);
  private readonly watches = new Map<string, WatchState>();
  private burstRunning = false;
  private stopped = false;

  constructor(
    private readonly calendar: CalendarService,
    private readonly registry: SchedulerRegistry,
    @Inject(calendarConfig.KEY)
    private readonly config: ConfigType<typeof calendarConfig>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // Warm start: the app should never show an empty calendar while the first
    // scrape (which has to clear Cloudflare) is still in flight.
    await this.calendar.restore().catch((error) => {
      this.logger.warn(`snapshot restore failed: ${error}`);
      return 0;
    });
    this.startBaseLoop();
    if (this.config.refreshOnBoot) {
      await this.calendar.sync('boot').catch((error) => {
        this.logger.error(`boot sync failed: ${error}`);
      });
    }
  }

  onModuleDestroy(): void {
    this.stopped = true;
    this.clearBaseLoop();
    for (const eventId of [...this.watches.keys()]) this.clearWatch(eventId);
  }

  // ---------------------------------------------------------------- base loop

  private startBaseLoop(): void {
    this.clearBaseLoop();
    const interval = setInterval(() => {
      void this.calendar.sync('interval').catch((error) => {
        this.logger.error(`interval sync failed: ${error}`);
      });
    }, this.config.refreshIntervalMs);
    this.registry.addInterval(BASE_INTERVAL, interval);
    this.logger.log(`base refresh every ${this.config.refreshIntervalMs}ms`);
  }

  private clearBaseLoop(): void {
    if (!this.registry.doesExist('interval', BASE_INTERVAL)) return;
    clearInterval(this.registry.getInterval(BASE_INTERVAL));
    this.registry.deleteInterval(BASE_INTERVAL);
  }

  /** Change the base cadence at runtime; used by the admin endpoint. */
  setRefreshInterval(ms: number): void {
    this.config.refreshIntervalMs = ms;
    this.startBaseLoop();
  }

  // ------------------------------------------------------------ release watch

  /** After every sync, re-arm timers so newly discovered events get watched. */
  @OnEvent(CALENDAR_SYNCED)
  onSynced(outcome: SyncOutcome): void {
    if (!outcome.ok || this.stopped || !this.config.watch.enabled) return;
    this.armWatches();
  }

  private armWatches(): void {
    const { horizonMs, minImpact } = this.config.watch;
    const pending = this.calendar.pendingReleases(horizonMs, minImpact);
    const wanted = new Set(pending.map((event) => event.id));

    // Drop timers for events that released, moved out of the horizon or vanished.
    for (const [eventId, state] of this.watches) {
      if (state.phase !== 'armed') continue;
      if (!wanted.has(eventId)) this.clearWatch(eventId);
    }

    for (const event of pending) {
      if (this.watches.has(event.id)) continue;
      this.armWatch(event);
    }
  }

  private armWatch(event: CalendarEvent): void {
    const fireAt = new Date(event.scheduledAt).getTime() - this.config.watch.leadMs;
    const delay = fireAt - Date.now();
    if (delay <= 0) return;

    const timeout = setTimeout(() => this.beginBurst(event.id), delay);
    timeout.unref?.();

    this.registry.addTimeout(watchTimer(event.id), timeout);
    this.watches.set(event.id, {
      eventId: event.id,
      title: event.title,
      currency: event.currency,
      scheduledAt: event.scheduledAt,
      phase: 'armed',
      attempts: 0,
      startedAt: null,
      expiresAt: null,
      resolvedAt: null,
    });
    this.logger.debug(
      `armed ${event.currency} ${event.title} for ${event.scheduledAt} (in ${Math.round(delay / 1000)}s)`,
    );
  }

  /** A watch came due: move it to polling and make sure the shared loop is running. */
  private beginBurst(eventId: string): void {
    const state = this.watches.get(eventId);
    if (!state || this.stopped) return;

    if (this.registry.doesExist('timeout', watchTimer(eventId))) {
      this.registry.deleteTimeout(watchTimer(eventId));
    }

    state.phase = 'polling';
    state.startedAt = new Date().toISOString();
    state.expiresAt = new Date(Date.now() + this.config.watch.maxDurationMs).toISOString();
    this.logger.log(`release watch started: ${state.currency} ${state.title}`);

    void this.runBurstLoop();
  }

  /**
   * The single burst loop. One sync per tick, however many watches are waiting.
   * It runs only while at least one watch is still polling.
   */
  private async runBurstLoop(): Promise<void> {
    if (this.burstRunning) return;
    this.burstRunning = true;
    try {
      while (!this.stopped && this.pollingWatches().length > 0) {
        try {
          await this.calendar.sync('release-watch');
        } catch (error) {
          this.logger.warn(`release-watch sync failed: ${error}`);
        }

        this.settlePollingWatches();
        if (this.pollingWatches().length === 0) break;
        await this.sleep(this.config.watch.pollIntervalMs);
      }
    } finally {
      this.burstRunning = false;
    }
  }

  private pollingWatches(): WatchState[] {
    return [...this.watches.values()].filter((state) => state.phase === 'polling');
  }

  /** Resolve every watch whose number has printed, and expire the rest on time. */
  private settlePollingWatches(): void {
    const events = new Map(this.calendar.query().map((event) => [event.id, event]));
    const now = Date.now();

    for (const state of this.pollingWatches()) {
      state.attempts += 1;
      const current = events.get(state.eventId);

      if (current?.released) {
        state.phase = 'resolved';
        state.resolvedAt = new Date().toISOString();
        this.logger.log(
          `release captured after ${state.attempts} poll(s): ${current.currency} ${current.title} = ${current.actual}`,
        );
        this.scheduleWatchCleanup(state.eventId);
        continue;
      }

      // The event vanished upstream, or we have waited long enough.
      const expired = !current || (state.expiresAt !== null && now >= Date.parse(state.expiresAt));
      if (expired) {
        state.phase = 'expired';
        state.resolvedAt = new Date().toISOString();
        this.logger.warn(
          `release watch expired after ${state.attempts} poll(s): ${state.currency} ${state.title}`,
        );
        this.scheduleWatchCleanup(state.eventId);
      }
    }
  }

  /** Keep finished watches visible in /status briefly, then forget them. */
  private scheduleWatchCleanup(eventId: string): void {
    const timeout = setTimeout(() => this.watches.delete(eventId), 5 * 60_000);
    timeout.unref?.();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      timer.unref?.();
    });
  }

  private clearWatch(eventId: string): void {
    const name = watchTimer(eventId);
    if (this.registry.doesExist('timeout', name)) {
      clearTimeout(this.registry.getTimeout(name));
      this.registry.deleteTimeout(name);
    }
    this.watches.delete(eventId);
  }

  get watchStates(): WatchState[] {
    return [...this.watches.values()].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  }

  get refreshIntervalMs(): number {
    return this.config.refreshIntervalMs;
  }
}
