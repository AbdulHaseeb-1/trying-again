import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { ConstantBackoff, handleAll, retry } from 'cockatiel';

import { BrowserService, type BrowserProfile } from '../../browser/browser.service';
import { derivativesConfig } from '../../config/configuration';
import type { DerivativesSnapshot, PageReport, SourceName } from '../derivatives.types';
import { classify } from './coinglass.classify';
import { harvestPage } from './coinglass.harvest';
import { buildSnapshot, type HarvestBundle, type MapperLimits } from './coinglass.mapper';

type PagePlan = { page: string; url: string; symbol: string | null };

/**
 * The CoinGlass source.
 *
 * A run visits a small set of pages, lets each one decode its own payloads
 * (see `coinglass.harvest.ts`) and folds everything into one snapshot. Pages
 * are independent: the market pages still produce a usable snapshot when a
 * coin page fails, and each page's outcome is reported so a partial run is
 * visible rather than silently thin.
 */
@Injectable()
export class CoinglassScraper {
  readonly name: SourceName = 'coinglass-scrape';

  private readonly logger = new Logger(CoinglassScraper.name);
  private readonly profile: BrowserProfile;

  constructor(
    private readonly browser: BrowserService,
    @Inject(derivativesConfig.KEY)
    private readonly config: ConfigType<typeof derivativesConfig>,
  ) {
    const { scraper } = config;
    this.profile = {
      name: 'coinglass',
      userDataDir: scraper.userDataDir,
      headless: scraper.headless,
      executablePath: scraper.executablePath,
      navigationTimeoutMs: scraper.navigationTimeoutMs,
      idleShutdownMs: scraper.idleShutdownMs,
      proxyServer: scraper.proxyServer,
    };
  }

  private get limits(): MapperLimits {
    const { scraper } = this.config;
    return {
      maxOrders: scraper.maxOrders,
      maxScreenerRows: scraper.maxScreenerRows,
      maxSeriesPoints: scraper.maxSeriesPoints,
    };
  }

  private plan(assets: string[]): PagePlan[] {
    const { baseUrl } = this.config.scraper;
    return [
      // Market-wide totals, per-exchange aggregates, the screener and funding extremes.
      { page: 'home', url: `${baseUrl}/`, symbol: null },
      // Liquidations by window, venue and coin, plus the live order stream.
      { page: 'liquidations', url: `${baseUrl}/LiquidationData`, symbol: null },
      ...assets.map((symbol) => ({
        page: `coin:${symbol}`,
        url: `${baseUrl}/currencies/${symbol}`,
        symbol,
      })),
    ];
  }

  async fetch(assets: string[]): Promise<DerivativesSnapshot> {
    const startedAt = Date.now();
    const bundles: HarvestBundle[] = [];
    const reports: PageReport[] = [];

    for (const plan of this.plan(assets)) {
      const pageStartedAt = Date.now();
      try {
        const bundle = await this.visit(plan);
        bundles.push(bundle);
        reports.push({
          page: plan.page,
          url: plan.url,
          ok: bundle.classified.length > 0,
          durationMs: Date.now() - pageStartedAt,
          payloads: bundle.classified.length,
          kinds: [...new Set(bundle.classified.map((entry) => entry.kind))].sort(),
          error: bundle.classified.length ? null : 'page produced no recognised payloads',
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`${plan.page} failed: ${message}`);
        reports.push({
          page: plan.page,
          url: plan.url,
          ok: false,
          durationMs: Date.now() - pageStartedAt,
          payloads: 0,
          kinds: [],
          error: message,
        });
      }
    }

    if (!reports.some((report) => report.ok)) {
      throw new Error(
        `every CoinGlass page failed: ${reports.map((report) => `${report.page} (${report.error})`).join('; ')}`,
      );
    }

    const snapshot = buildSnapshot(bundles, {
      assets,
      limits: this.limits,
      capturedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      pages: reports,
    });

    this.logger.log(
      `scraped ${snapshot.assets.length}/${assets.length} assets and ${snapshot.market?.screener.length ?? 0} screener rows in ${snapshot.durationMs}ms`,
    );
    return snapshot;
  }

  /** Load one page and identify everything it decoded. */
  private async visit(plan: PagePlan): Promise<HarvestBundle> {
    const { scraper } = this.config;
    const policy = retry(handleAll, {
      maxAttempts: Math.max(1, scraper.retries + 1),
      backoff: new ConstantBackoff(2_000),
    });

    let attempt = 0;
    const payloads = await policy.execute(async () => {
      attempt += 1;
      // A wedged renderer is the usual cause of an empty harvest; start clean.
      if (attempt > 1) await this.browser.recycle(this.profile);
      return this.browser.withPage(this.profile, (page) =>
        harvestPage(page, plan.url, {
          settleMs: scraper.settleMs,
          quietMs: scraper.settleQuietMs,
          navigationTimeoutMs: scraper.navigationTimeoutMs,
        }),
      );
    });

    const classified = payloads.flatMap((payload) => {
      const entry = classify(payload.value);
      return entry ? [entry] : [];
    });

    this.logger.debug(
      `${plan.page}: ${payloads.length} payloads, ${classified.length} recognised`,
    );
    return { page: plan.page, symbol: plan.symbol, classified };
  }
}
