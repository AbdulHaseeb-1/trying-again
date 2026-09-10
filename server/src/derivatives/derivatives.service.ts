import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  BrokenCircuitError,
  ConsecutiveBreaker,
  ExponentialBackoff,
  TaskCancelledError,
  TimeoutStrategy,
  circuitBreaker,
  handleAll,
  timeout,
  wrap,
  type IPolicy,
} from 'cockatiel';

import { derivativesConfig } from '../config/configuration';
import { DerivativesArchive, type ArchiveReport } from './derivatives.archive';
import { DerivativesSnapshotStore } from './derivatives.snapshot';
import { DerivativesStore } from './derivatives.store';
import type {
  AssetDerivatives,
  DerivativesSnapshot,
  MarketOverview,
  SyncOutcome,
  SyncTrigger,
} from './derivatives.types';
import { CoinglassScraper } from './sources/coinglass.scraper';

export const DERIVATIVES_SYNCED = 'derivatives.synced';

/**
 * Owns the sync pipeline: run the scrape, fold it into the store, announce it.
 *
 * The scrape is expensive — a browser session across several pages — so
 * concurrent callers share one run and a repeatedly failing source is taken
 * out of rotation by a circuit breaker instead of tying up the browser.
 */
@Injectable()
export class DerivativesService {
  private readonly logger = new Logger(DerivativesService.name);
  private readonly policy: IPolicy;
  private inFlight: Promise<SyncOutcome> | null = null;
  private syncs: SyncOutcome[] = [];
  private restoredAt: string | null = null;
  private lastArchive: ArchiveReport | null = null;

  constructor(
    private readonly store: DerivativesStore,
    private readonly snapshot: DerivativesSnapshotStore,
    private readonly archive: DerivativesArchive,
    private readonly scraper: CoinglassScraper,
    private readonly events: EventEmitter2,
    @Inject(derivativesConfig.KEY)
    private readonly config: ConfigType<typeof derivativesConfig>,
  ) {
    this.policy = wrap(
      circuitBreaker(handleAll, {
        halfOpenAfter: new ExponentialBackoff({
          initialDelay: config.sourcePolicy.breakerCooldownMs,
          maxDelay: config.sourcePolicy.breakerCooldownMs * 4,
        }),
        breaker: new ConsecutiveBreaker(config.sourcePolicy.breakerThreshold),
      }),
      timeout(config.sourcePolicy.timeoutMs, TimeoutStrategy.Aggressive),
    );
  }

  /** Seed the store from the last persisted scrape so the app comes up warm. */
  async restore(): Promise<number> {
    const snapshot = await this.snapshot.load();
    if (!snapshot) return 0;
    this.restoredAt = snapshot.capturedAt;
    return this.store.hydrate(snapshot);
  }

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
    const assets = this.config.assets;

    try {
      const snapshot = await this.policy.execute(() => this.scraper.fetch(assets));
      const report = this.store.merge(snapshot);
      void this.snapshot.save(this.store.toSnapshot());
      // Fire-and-forget: the archive is history, and history can wait. What it
      // writes is only what this scrape had not already stored.
      void this.archive.persist(snapshot).then((written) => this.recordArchive(written));

      const outcome: SyncOutcome = {
        trigger,
        source: this.scraper.name,
        startedAt: startedAt.toISOString(),
        durationMs: Date.now() - startedAt.getTime(),
        ok: true,
        error: null,
        assets: report.updated,
        pagesOk: snapshot.pages.filter((page) => page.ok).length,
        pagesAttempted: snapshot.pages.length,
      };
      this.record(outcome);
      this.logger.log(
        `sync(${trigger}): ${outcome.assets.join(', ') || 'no assets'} · ${outcome.pagesOk}/${outcome.pagesAttempted} pages in ${outcome.durationMs}ms`,
      );
      this.events.emit(DERIVATIVES_SYNCED, outcome);
      return outcome;
    } catch (error) {
      const outcome: SyncOutcome = {
        trigger,
        source: null,
        startedAt: startedAt.toISOString(),
        durationMs: Date.now() - startedAt.getTime(),
        ok: false,
        error: this.describeFailure(error),
        assets: [],
        pagesOk: 0,
        pagesAttempted: 0,
      };
      this.record(outcome);
      this.logger.warn(`sync(${trigger}) failed: ${outcome.error}`);
      this.events.emit(DERIVATIVES_SYNCED, outcome);
      return outcome;
    }
  }

  /** Turn cockatiel's control-flow errors into something a log reader can act on. */
  private describeFailure(error: unknown): string {
    if (error instanceof BrokenCircuitError) {
      return 'circuit open after repeated failures; skipping until cooldown elapses';
    }
    if (error instanceof TaskCancelledError) {
      return `exceeded the ${this.config.sourcePolicy.timeoutMs}ms source timeout`;
    }
    return error instanceof Error ? error.message : String(error);
  }

  private record(outcome: SyncOutcome): void {
    this.syncs = [outcome, ...this.syncs].slice(0, 20);
  }

  private recordArchive(report: ArchiveReport): void {
    this.lastArchive = report;
    const written = Object.values(report).reduce((total, count) => total + count, 0);
    if (written > 0) {
      this.logger.debug(
        `archived ${written} rows (${Object.entries(report)
          .filter(([, count]) => count > 0)
          .map(([table, count]) => `${table}: ${count}`)
          .join(', ')})`,
      );
    }
  }

  /** History from the archive, one series at a time. */
  history(series: Parameters<DerivativesArchive['history']>[0], query: Parameters<DerivativesArchive['history']>[1]) {
    return this.archive.history(series, query);
  }

  archiveSummary() {
    return this.archive.summary();
  }

  pruneArchive() {
    return this.archive.prune();
  }

  get archiveEnabled(): boolean {
    return this.archive.enabled;
  }

  /** What the last sync actually wrote to the archive. */
  get lastArchived(): ArchiveReport | null {
    return this.lastArchive;
  }

  asset(symbol: string): AssetDerivatives | null {
    return this.store.asset(symbol);
  }

  get assets(): AssetDerivatives[] {
    return this.store.all();
  }

  /** Symbols the app can select: everything the store holds, in config order. */
  get available(): string[] {
    const held = new Set(this.store.symbols);
    const ordered = this.config.assets.filter((symbol) => held.has(symbol));
    const extra = [...held].filter((symbol) => !ordered.includes(symbol));
    return [...ordered, ...extra];
  }

  get market(): MarketOverview | null {
    return this.store.market;
  }

  get pages(): DerivativesSnapshot['pages'] {
    return this.store.pageReports;
  }

  get lastSync(): SyncOutcome | null {
    return this.syncs[0] ?? null;
  }

  get recentSyncs(): SyncOutcome[] {
    return this.syncs;
  }

  get capturedAt(): string | null {
    return this.store.capturedAtIso;
  }

  get changedAt(): string | null {
    return this.store.changedAt;
  }

  /** When the snapshot that seeded this process was captured, if one was used. */
  get snapshotCapturedAt(): string | null {
    return this.restoredAt;
  }
}
