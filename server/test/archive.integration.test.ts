import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../src/generated/prisma/client';
import { CalendarArchive } from '../src/calendar/calendar.archive';
import { DerivativesArchive, liquidationId } from '../src/derivatives/derivatives.archive';
import type { CalendarEvent } from '../src/calendar/calendar.types';
import type { DerivativesSnapshot } from '../src/derivatives/derivatives.types';

/**
 * The incremental-write promise, checked against a real Postgres.
 *
 * The unit tests prove the archives *decide* correctly; only the database can
 * prove that re-offering the same rows actually collapses into the rows already
 * there. Set TEST_DATABASE_URL (pointing at a scratch database — this test
 * truncates its tables) to run it; without one the suite skips.
 */
const url = process.env.TEST_DATABASE_URL;

describe('archive against Postgres', { skip: url ? false : 'TEST_DATABASE_URL is not set' }, () => {
  let client: PrismaClient;
  let prisma: { enabled: boolean; db: PrismaClient };

  before(async () => {
    client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
    await client.$executeRawUnsafe(
      'TRUNCATE calendar_event, asset_snapshot, venue_snapshot, market_snapshot, coin_snapshot, funding_point, price_point, liquidation_order',
    );
    prisma = { enabled: true, db: client };
  });

  after(async () => {
    await client?.$disconnect();
  });

  test('re-scraping the same window adds nothing', async () => {
    const archive = new DerivativesArchive(prisma as never, {
      archive: { enabled: true, intervalMs: 300_000, retentionDays: 0 },
    } as never);

    const first = await archive.persist(sampleSnapshot('2026-09-10T07:00:00.000Z'));
    assert.equal(first.fundingPoints, 2);
    assert.equal(first.pricePoints, 2);
    assert.equal(first.liquidations, 2);

    // The next scrape a minute later re-offers the same tail plus one new
    // candle, one new price point and one new liquidation.
    const second = await archive.persist(sampleSnapshot('2026-09-10T07:01:00.000Z', 1));
    assert.equal(second.fundingPoints, 1, 'only the candle that was new');
    assert.equal(second.pricePoints, 1);
    assert.equal(second.liquidations, 1);
    assert.equal(second.assetSnapshots, 0, 'still inside the sampling interval');

    assert.equal(await client.fundingPoint.count(), 3);
    assert.equal(await client.pricePoint.count(), 3);
    assert.equal(await client.liquidationOrder.count(), 3);
    assert.equal(await client.assetSnapshot.count(), 1);
  });

  test('an event is upserted in place, and its print time is set once', async () => {
    const archive = new CalendarArchive(prisma as never);
    const pending = event();

    await archive.persist([pending]);
    await archive.persist([{ ...pending, forecast: '2.9%' }]);
    assert.equal(await client.calendarEvent.count(), 1, 'one event, not one row per sync');

    const beforeRelease = await client.calendarEvent.findUniqueOrThrow({ where: { id: pending.id } });
    assert.equal(beforeRelease.forecast, '2.9%');
    assert.equal(beforeRelease.releasedAt, null);

    // It prints…
    await archive.persist([{ ...pending, actual: '3.0%', released: true, outcome: 'worse' }]);
    await archive.markReleased([pending.id]);
    const released = await client.calendarEvent.findUniqueOrThrow({ where: { id: pending.id } });
    assert.ok(released.releasedAt, 'the print is stamped');

    // …and is then revised, which is not a second print.
    await archive.persist([{ ...pending, actual: '3.1%', released: true, outcome: 'worse' }]);
    await archive.markReleased([pending.id]);
    const revised = await client.calendarEvent.findUniqueOrThrow({ where: { id: pending.id } });
    assert.equal(revised.actual, '3.1%');
    assert.deepEqual(revised.releasedAt, released.releasedAt, 'the original print time stands');
  });

  test('history reads back what was written, newest first', async () => {
    const archive = new DerivativesArchive(prisma as never, {
      archive: { enabled: true, intervalMs: 0, retentionDays: 0 },
    } as never);
    await archive.persist(sampleSnapshot('2026-09-10T08:00:00.000Z', 2));

    const rows = (await archive.history('asset', { symbol: 'BTC', limit: 5 })) as {
      capturedAt: Date;
    }[];
    assert.ok(rows.length >= 2);
    assert.ok(rows[0].capturedAt >= rows[1].capturedAt, 'newest first');

    const filtered = await archive.history('venues', { symbol: 'BTC', exchange: 'Binance' });
    assert.ok(filtered.length > 0);
    assert.equal(await archive.history('venues', { symbol: 'NOSUCH' }).then((r) => r.length), 0);
  });

  test('retention drops sampled rows past the horizon and keeps keyed series', async () => {
    const archive = new DerivativesArchive(prisma as never, {
      // Everything written above is older than "now minus zero days"? No: the
      // horizon is measured from now, and the fixtures are dated in the past.
      archive: { enabled: true, intervalMs: 0, retentionDays: 1 },
    } as never);

    const fundingBefore = await client.fundingPoint.count();
    await client.liquidationOrder.update({
      where: { id: liquidationId(sampleOrder(0)) },
      data: { at: new Date(Date.now() - 10 * 86_400_000) },
    });

    const removed = await archive.prune();
    assert.ok(removed >= 1, 'the aged liquidation goes');
    assert.equal(await client.fundingPoint.count(), fundingBefore, 'funding history is kept');
  });
});

function sampleOrder(offsetMinutes: number) {
  return {
    exchange: 'Binance',
    symbol: 'BTC',
    instrumentId: 'BTCUSDT',
    side: 'long' as const,
    price: 78_000,
    quantity: 1,
    usd: 78_000,
    at: new Date(Date.parse('2026-09-10T07:00:00.000Z') + offsetMinutes * 60_000).toISOString(),
  };
}

/** Two overlapping tails plus `newPoints` genuinely new rows. */
function sampleSnapshot(capturedAt: string, newPoints = 0): DerivativesSnapshot {
  const funding = [0, 1, 2].slice(0, 2 + newPoints).map((index) => ({
    at: new Date(Date.parse('2026-09-09T00:00:00.000Z') + index * 8 * 3_600_000).toISOString(),
    open: 0.004,
    high: 0.009,
    low: 0.002,
    close: 0.008,
    priceOpen: 78_000,
    priceClose: 78_100,
  }));
  const prices = [0, 1, 2].slice(0, 2 + newPoints).map((index) => ({
    at: new Date(Date.parse('2026-09-10T06:00:00.000Z') + index * 300_000).toISOString(),
    price: 78_000 + index,
    marketCap: null,
  }));

  return {
    capturedAt,
    source: 'coinglass-scrape',
    durationMs: 1,
    assets: [
      {
        summary: {
          symbol: 'BTC',
          name: 'Bitcoin',
          logo: null,
          price: 78_000,
          priceChangePercent24h: -1,
          priceChangePercent7d: null,
          marketCap: null,
          circulatingSupply: null,
          openInterestUsd: 53_000_000_000,
          openInterestAmount: 680_000,
          openInterestChange: { h24: -0.9 },
          openInterestChangeUsd: {},
          volumeUsd24h: 61_000_000_000,
          volumeChange: { h24: 12 },
          spotVolumeUsd24h: null,
          oiVolumeRatio: 0.86,
          oiMarketCapRatio: null,
          optionsOpenInterestUsd: null,
          optionsOpenInterestChangePercent24h: null,
          optionsVolumeUsd24h: null,
          optionsVolumeChangePercent24h: null,
          fundingRateByOpenInterest: 0.008,
          fundingRateByVolume: null,
          fundingRateBySymbol: null,
          fundingRateAnnualized: 8.8,
          longShortRatio: { h24: 0.95 },
          globalAccountRatio: null,
          topAccountRatio: null,
          topPositionRatio: null,
          okxGlobalAccountRatio: null,
          rsi: {},
          liquidationUsd24h: 73_000_000,
          liquidationCount24h: 5_800,
        },
        venues: [
          {
            exchange: 'Binance',
            logo: null,
            symbol: 'BTC/USDT',
            instrumentId: 'BTCUSDT',
            perpetual: true,
            openInterestUsd: 8_200_000_000,
            openInterestAmount: 104_000,
            openInterestChangePercent24h: -1.8,
            volumeUsd24h: 11_000_000_000,
            volumeChangePercent24h: 20,
            oiVolumeRatio: 0.68,
            fundingRate: 0.01,
            fundingIntervalHours: 8,
            nextFundingAt: null,
            longRate: 49,
            shortRate: 51,
            longVolumeUsd: null,
            shortVolumeUsd: null,
            longLiquidationUsd24h: 20_000_000,
            shortLiquidationUsd24h: 7_800_000,
            price: 78_000,
            indexPrice: null,
            priceChangePercent24h: null,
            bidDepth: null,
            askDepth: null,
          },
        ],
        liquidations: {},
        liquidationSplit: {},
        fundingHistory: funding,
        priceHistory: prices,
        spotVolumeByExchange: [],
        futuresVolumeByExchange: [],
        netFlows: [],
        updatedAt: capturedAt,
      },
    ],
    market: {
      openInterestUsd: 138_000_000_000,
      openInterestChangePercent24h: -2,
      liquidationUsd24h: 373_000_000,
      liquidationChangePercent24h: 61,
      liquidationSeries: [],
      averageRsi: 42,
      liquidations: {},
      liquidationsByExchange: [],
      liquidationsByExchangeWindow: null,
      liquidationsByCoin: [],
      largestLiquidation: null,
      recentLiquidations: [0, 1, 2].slice(0, 2 + newPoints).map(sampleOrder),
      tradersLiquidated24h: 143_000,
      screener: [],
      fundingHighest: [],
      fundingLowest: [],
      macro: [],
    },
    liquidityMaps: [],
    pages: [],
  };
}

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'integration-cpi',
    sourceId: 1,
    title: 'CPI y/y',
    currency: 'USD',
    country: 'US',
    impact: 'high',
    scheduledAt: '2026-09-10T12:30:00.000Z',
    timePrecision: 'exact',
    actual: null,
    forecast: '2.8%',
    previous: '2.7%',
    revision: null,
    outcome: 'pending',
    released: false,
    leaked: false,
    source: 'forex-factory-scrape',
    updatedAt: '2026-09-09T10:00:00.000Z',
    detailUrl: null,
    ...overrides,
  };
}
