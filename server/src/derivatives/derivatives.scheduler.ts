import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';

import { derivativesConfig } from '../config/configuration';
import { DerivativesService } from './derivatives.service';

const BASE_INTERVAL = 'derivatives:base-refresh';
const PRUNE_INTERVAL = 'derivatives:archive-prune';
const PRUNE_EVERY_MS = 24 * 60 * 60_000;

/**
 * The refresh loop.
 *
 * Unlike the calendar there is nothing to burst around — derivatives have no
 * scheduled prints — so one steady interval is the whole story. It is
 * registered with Nest's SchedulerRegistry so it shows up in /status and is
 * torn down cleanly on shutdown.
 */
@Injectable()
export class DerivativesScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(DerivativesScheduler.name);

  constructor(
    private readonly derivatives: DerivativesService,
    private readonly registry: SchedulerRegistry,
    @Inject(derivativesConfig.KEY)
    private readonly config: ConfigType<typeof derivativesConfig>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.derivatives.restore().catch((error) => {
      this.logger.warn(`snapshot restore failed: ${error}`);
      return 0;
    });
    this.startBaseLoop();
    this.startPruneLoop();
    if (this.config.refreshOnBoot) {
      await this.derivatives.sync('boot').catch((error) => {
        this.logger.error(`boot sync failed: ${error}`);
      });
    }
  }

  onModuleDestroy(): void {
    this.clearBaseLoop();
    this.clearInterval(PRUNE_INTERVAL);
  }

  /**
   * Retention. Sampled rows accumulate forever otherwise — the liquidation feed
   * alone is tens of thousands of rows a day — so anything past the horizon is
   * dropped once a day. Series with a natural key (funding intervals, the price
   * series) are left alone: they are the history worth keeping.
   */
  private startPruneLoop(): void {
    if (!this.derivatives.archiveEnabled) return;
    this.clearInterval(PRUNE_INTERVAL);
    const interval = setInterval(() => {
      void this.derivatives.pruneArchive().catch((error) => {
        this.logger.warn(`archive prune failed: ${error}`);
      });
    }, PRUNE_EVERY_MS);
    interval.unref?.();
    this.registry.addInterval(PRUNE_INTERVAL, interval);
  }

  private clearInterval(name: string): void {
    if (!this.registry.doesExist('interval', name)) return;
    clearInterval(this.registry.getInterval(name));
    this.registry.deleteInterval(name);
  }

  private startBaseLoop(): void {
    this.clearBaseLoop();
    const interval = setInterval(() => {
      void this.derivatives.sync('interval').catch((error) => {
        this.logger.error(`interval sync failed: ${error}`);
      });
    }, this.config.refreshIntervalMs);
    this.registry.addInterval(BASE_INTERVAL, interval);
    this.logger.log(`base refresh every ${this.config.refreshIntervalMs}ms`);
  }

  private clearBaseLoop(): void {
    this.clearInterval(BASE_INTERVAL);
  }

  /** Change the cadence at runtime; used by the admin endpoint. */
  setRefreshInterval(ms: number): void {
    this.config.refreshIntervalMs = ms;
    this.startBaseLoop();
  }

  get refreshIntervalMs(): number {
    return this.config.refreshIntervalMs;
  }
}
