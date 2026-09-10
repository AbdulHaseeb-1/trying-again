import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { createHash } from 'node:crypto';

import { derivativesConfig } from '../config/configuration';
import { PrismaService } from '../database/prisma.service';
import type { DerivativesSnapshot, LiquidationOrder } from './derivatives.types';

export type HistorySeries =
  | 'asset'
  | 'venues'
  | 'funding'
  | 'prices'
  | 'liquidations'
  | 'market'
  | 'coins';

export type HistoryQuery = {
  symbol?: string;
  exchange?: string;
  from?: Date;
  to?: Date;
  limit?: number;
};

export type ArchiveReport = {
  /** Rows written per table; a quiet minute writes zeroes. */
  fundingPoints: number;
  pricePoints: number;
  liquidations: number;
  assetSnapshots: number;
  venueSnapshots: number;
  coinSnapshots: number;
  marketSnapshots: number;
};

const EMPTY: ArchiveReport = {
  fundingPoints: 0,
  pricePoints: 0,
  liquidations: 0,
  assetSnapshots: 0,
  venueSnapshots: 0,
  coinSnapshots: 0,
  marketSnapshots: 0,
};

const MAX_LIMIT = 5_000;

/**
 * The derivatives archive.
 *
 * Two kinds of data arrive on every scrape and they are stored on different
 * terms:
 *
 * - **Series CoinGlass itself keeps** — funding intervals, the price series,
 *   the liquidation feed — overlap heavily between scrapes. They are written
 *   with `skipDuplicates` against their natural key, so a scrape adds only what
 *   it genuinely saw for the first time. Re-reading the same 240 funding
 *   candles a minute later writes nothing.
 * - **Series that only exist because we looked** — the coin's own totals, the
 *   venue table, the market snapshot. Nothing dedupes those: every sync is a
 *   new observation at a new instant. Writing all of them at the 60s scrape
 *   cadence would store a quarter of a million venue rows a day for no extra
 *   information, so they are sampled on their own interval
 *   (`DERIVATIVES_HISTORY_INTERVAL_MS`, five minutes by default).
 */
@Injectable()
export class DerivativesArchive {
  private readonly logger = new Logger(DerivativesArchive.name);
  private lastSampledAt: number | null = null;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(derivativesConfig.KEY)
    private readonly config: ConfigType<typeof derivativesConfig>,
  ) {}

  get enabled(): boolean {
    return this.prisma.enabled && this.config.archive.enabled;
  }

  /** Fold one scrape into the archive. Never throws — the live view comes first. */
  async persist(snapshot: DerivativesSnapshot): Promise<ArchiveReport> {
    const db = this.prisma.db;
    if (!db || !this.config.archive.enabled) return EMPTY;

    const capturedAt = new Date(snapshot.capturedAt);
    const report: ArchiveReport = { ...EMPTY };
    const sampling = this.shouldSample(capturedAt);

    try {
      for (const asset of snapshot.assets) {
        const symbol = asset.summary.symbol;

        if (asset.fundingHistory.length) {
          const { count } = await db.fundingPoint.createMany({
            data: asset.fundingHistory.map((point) => ({
              symbol,
              at: new Date(point.at),
              open: point.open,
              high: point.high,
              low: point.low,
              close: point.close,
              priceOpen: point.priceOpen,
              priceClose: point.priceClose,
            })),
            skipDuplicates: true,
          });
          report.fundingPoints += count;
        }

        if (asset.priceHistory.length) {
          const { count } = await db.pricePoint.createMany({
            data: asset.priceHistory.map((point) => ({
              symbol,
              at: new Date(point.at),
              price: point.price,
              marketCap: point.marketCap,
            })),
            skipDuplicates: true,
          });
          report.pricePoints += count;
        }

        if (sampling) {
          const { summary } = asset;
          await db.assetSnapshot.create({
            data: {
              symbol,
              capturedAt,
              price: summary.price,
              priceChangePercent24h: summary.priceChangePercent24h,
              marketCap: summary.marketCap,
              openInterestUsd: summary.openInterestUsd,
              openInterestAmount: summary.openInterestAmount,
              openInterestChange24h: summary.openInterestChange.h24 ?? null,
              volumeUsd24h: summary.volumeUsd24h,
              volumeChange24h: summary.volumeChange.h24 ?? null,
              oiVolumeRatio: summary.oiVolumeRatio,
              fundingByOpenInterest: summary.fundingRateByOpenInterest,
              fundingByVolume: summary.fundingRateByVolume,
              fundingAnnualized: summary.fundingRateAnnualized,
              longShortRatio24h: summary.longShortRatio.h24 ?? null,
              globalAccountRatio: summary.globalAccountRatio,
              topAccountRatio: summary.topAccountRatio,
              topPositionRatio: summary.topPositionRatio,
              optionsOpenInterestUsd: summary.optionsOpenInterestUsd,
              optionsVolumeUsd24h: summary.optionsVolumeUsd24h,
              liquidationUsd24h: summary.liquidationUsd24h,
              longLiquidationUsd24h: asset.liquidationSplit.h24?.longUsd ?? null,
              shortLiquidationUsd24h: asset.liquidationSplit.h24?.shortUsd ?? null,
              liquidationCount24h: summary.liquidationCount24h
                ? Math.round(summary.liquidationCount24h)
                : null,
              venueCount: asset.venues.length,
            },
          });
          report.assetSnapshots += 1;

          if (asset.venues.length) {
            const { count } = await db.venueSnapshot.createMany({
              data: asset.venues.map((venue) => ({
                symbol,
                exchange: venue.exchange,
                instrument: venue.instrumentId ?? venue.symbol,
                capturedAt,
                perpetual: venue.perpetual,
                openInterestUsd: venue.openInterestUsd,
                openInterestAmount: venue.openInterestAmount,
                openInterestChange24h: venue.openInterestChangePercent24h,
                volumeUsd24h: venue.volumeUsd24h,
                fundingRate: venue.fundingRate,
                fundingIntervalHours: venue.fundingIntervalHours
                  ? Math.round(venue.fundingIntervalHours)
                  : null,
                longRate: venue.longRate,
                shortRate: venue.shortRate,
                longLiquidationUsd24h: venue.longLiquidationUsd24h,
                shortLiquidationUsd24h: venue.shortLiquidationUsd24h,
                price: venue.price,
              })),
              skipDuplicates: true,
            });
            report.venueSnapshots += count;
          }
        }
      }

      const market = snapshot.market;
      if (market) {
        if (market.recentLiquidations.length) {
          const { count } = await db.liquidationOrder.createMany({
            data: market.recentLiquidations.map((order) => ({
              id: liquidationId(order),
              exchange: order.exchange,
              symbol: order.symbol,
              instrumentId: order.instrumentId,
              side: order.side,
              price: order.price,
              quantity: order.quantity,
              usd: order.usd,
              at: new Date(order.at),
            })),
            skipDuplicates: true,
          });
          report.liquidations += count;
        }

        if (sampling) {
          await db.marketSnapshot.create({
            data: {
              capturedAt,
              openInterestUsd: market.openInterestUsd,
              openInterestChange24h: market.openInterestChangePercent24h,
              liquidationUsd24h: market.liquidationUsd24h,
              liquidationChange24h: market.liquidationChangePercent24h,
              tradersLiquidated24h: market.tradersLiquidated24h
                ? Math.round(market.tradersLiquidated24h)
                : null,
              averageRsi: market.averageRsi,
              coinsTracked: market.screener.length,
            },
          });
          report.marketSnapshots += 1;

          if (market.screener.length) {
            const { count } = await db.coinSnapshot.createMany({
              data: market.screener.map((row) => ({
                symbol: row.symbol,
                capturedAt,
                price: row.price,
                priceChangePercent24h: row.priceChangePercent24h,
                openInterestUsd: row.openInterestUsd,
                openInterestChange24h: row.openInterestChange.h24 ?? null,
                volumeUsd24h: row.volumeUsd24h,
                fundingByOpenInterest: row.fundingRateByOpenInterest,
                fundingAnnualized: row.fundingRateAnnualized,
                longShortRatio24h: row.longShortRatio24h,
                liquidationUsd24h: row.liquidationUsd24h,
                marketCap: row.marketCap,
              })),
              skipDuplicates: true,
            });
            report.coinSnapshots += count;
          }
        }
      }

      if (sampling) this.lastSampledAt = capturedAt.getTime();
      return report;
    } catch (error) {
      this.logger.warn(`archive write failed: ${error instanceof Error ? error.message : error}`);
      return report;
    }
  }

  /** True when enough time has passed to take a fresh observation. */
  private shouldSample(capturedAt: Date): boolean {
    const interval = this.config.archive.intervalMs;
    if (interval <= 0) return true;
    if (this.lastSampledAt === null) return true;
    return capturedAt.getTime() - this.lastSampledAt >= interval;
  }

  /** Drop rows past the retention horizon. A horizon of 0 keeps everything. */
  async prune(): Promise<number> {
    const db = this.prisma.db;
    const days = this.config.archive.retentionDays;
    if (!db || days <= 0) return 0;

    const before = new Date(Date.now() - days * 86_400_000);
    try {
      const results = await Promise.all([
        db.liquidationOrder.deleteMany({ where: { at: { lt: before } } }),
        db.venueSnapshot.deleteMany({ where: { capturedAt: { lt: before } } }),
        db.coinSnapshot.deleteMany({ where: { capturedAt: { lt: before } } }),
      ]);
      const removed = results.reduce((total, result) => total + result.count, 0);
      if (removed) this.logger.log(`pruned ${removed} rows older than ${days}d`);
      return removed;
    } catch (error) {
      this.logger.warn(`prune failed: ${error instanceof Error ? error.message : error}`);
      return 0;
    }
  }

  /** Read one series back out of the archive. */
  async history(series: HistorySeries, query: HistoryQuery = {}): Promise<unknown[]> {
    const db = this.prisma.db;
    if (!db) return [];

    const take = Math.min(query.limit ?? 500, MAX_LIMIT);
    const symbol = query.symbol?.toUpperCase();
    const window = query.from || query.to ? { gte: query.from, lte: query.to } : undefined;

    switch (series) {
      case 'asset':
        return db.assetSnapshot.findMany({
          where: { symbol, capturedAt: window },
          orderBy: { capturedAt: 'desc' },
          take,
        });
      case 'venues':
        return db.venueSnapshot.findMany({
          where: { symbol, exchange: query.exchange, capturedAt: window },
          orderBy: { capturedAt: 'desc' },
          take,
        });
      case 'funding':
        return db.fundingPoint.findMany({
          where: { symbol, at: window },
          orderBy: { at: 'desc' },
          take,
        });
      case 'prices':
        return db.pricePoint.findMany({
          where: { symbol, at: window },
          orderBy: { at: 'desc' },
          take,
        });
      case 'liquidations':
        return db.liquidationOrder.findMany({
          where: { symbol, exchange: query.exchange, at: window },
          orderBy: { at: 'desc' },
          take,
        });
      case 'coins':
        return db.coinSnapshot.findMany({
          where: { symbol, capturedAt: window },
          orderBy: { capturedAt: 'desc' },
          take,
        });
      case 'market':
      default:
        return db.marketSnapshot.findMany({
          where: { capturedAt: window },
          orderBy: { capturedAt: 'desc' },
          take,
        });
    }
  }

  /** What the archive holds, for `/status`. */
  async summary(): Promise<Record<string, unknown> | null> {
    const db = this.prisma.db;
    if (!db) return null;
    try {
      const [assets, venues, funding, prices, liquidations, coins, market, oldest, newest] =
        await Promise.all([
          db.assetSnapshot.count(),
          db.venueSnapshot.count(),
          db.fundingPoint.count(),
          db.pricePoint.count(),
          db.liquidationOrder.count(),
          db.coinSnapshot.count(),
          db.marketSnapshot.count(),
          db.assetSnapshot.findFirst({ orderBy: { capturedAt: 'asc' }, select: { capturedAt: true } }),
          db.assetSnapshot.findFirst({ orderBy: { capturedAt: 'desc' }, select: { capturedAt: true } }),
        ]);
      return {
        rows: {
          assetSnapshots: assets,
          venueSnapshots: venues,
          fundingPoints: funding,
          pricePoints: prices,
          liquidationOrders: liquidations,
          coinSnapshots: coins,
          marketSnapshots: market,
        },
        earliest: oldest?.capturedAt.toISOString() ?? null,
        latest: newest?.capturedAt.toISOString() ?? null,
        sampleIntervalMs: this.config.archive.intervalMs,
        retentionDays: this.config.archive.retentionDays,
      };
    } catch (error) {
      this.logger.warn(`archive summary failed: ${error instanceof Error ? error.message : error}`);
      return null;
    }
  }
}

/**
 * A liquidation's identity.
 *
 * CoinGlass ships no id on the feed rows, and the feed overlaps between
 * scrapes, so the order has to identify itself: one position, closed on one
 * venue, at one instant, for one amount.
 */
export function liquidationId(order: LiquidationOrder): string {
  const parts = [
    order.exchange,
    order.instrumentId ?? order.symbol,
    order.at,
    order.usd.toFixed(4),
    order.side ?? '',
  ];
  return createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 32);
}
