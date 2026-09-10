import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CalendarArchive } from '../src/calendar/calendar.archive';
import { DerivativesArchive, liquidationId } from '../src/derivatives/derivatives.archive';
import type { CalendarEvent } from '../src/calendar/calendar.types';
import type { DerivativesSnapshot, LiquidationOrder } from '../src/derivatives/derivatives.types';

/**
 * A Prisma stand-in that records what it was asked to write. The archives are
 * thin by design — the interesting behaviour is *what* they decide to write and
 * when, not how Prisma spells it — so the fake stays at that level.
 */
function fakeDb() {
  const calls: { table: string; op: string; rows: number; data?: unknown }[] = [];
  const table = (name: string) => ({
    createMany: async (args: { data: unknown[]; skipDuplicates?: boolean }) => {
      calls.push({ table: name, op: 'createMany', rows: args.data.length, data: args });
      return { count: args.data.length };
    },
    create: async ({ data }: { data: unknown }) => {
      calls.push({ table: name, op: 'create', rows: 1, data });
      return data;
    },
    upsert: async (args: unknown) => {
      calls.push({ table: name, op: 'upsert', rows: 1, data: args });
      return args;
    },
    updateMany: async (args: unknown) => {
      calls.push({ table: name, op: 'updateMany', rows: 1, data: args });
      return { count: 1 };
    },
    deleteMany: async () => ({ count: 0 }),
    findMany: async (args: unknown) => {
      calls.push({ table: name, op: 'findMany', rows: 0, data: args });
      return [];
    },
    count: async () => 0,
    findFirst: async () => null,
  });

  const db = {
    calendarEvent: table('calendarEvent'),
    assetSnapshot: table('assetSnapshot'),
    venueSnapshot: table('venueSnapshot'),
    marketSnapshot: table('marketSnapshot'),
    coinSnapshot: table('coinSnapshot'),
    fundingPoint: table('fundingPoint'),
    pricePoint: table('pricePoint'),
    liquidationOrder: table('liquidationOrder'),
    $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations),
  };
  return { db, calls, written: (name: string) => calls.filter((call) => call.table === name) };
}

const prismaStub = (db: unknown, enabled = true) => ({ enabled, db: enabled ? db : null }) as never;

const archiveConfig = (overrides: Record<string, unknown> = {}) =>
  ({
    archive: { enabled: true, intervalMs: 300_000, retentionDays: 90, ...overrides },
  }) as never;

const order = (overrides: Partial<LiquidationOrder> = {}): LiquidationOrder => ({
  exchange: 'Binance',
  symbol: 'BTC',
  instrumentId: 'BTCUSDT',
  side: 'long',
  price: 78_000,
  quantity: 1.25,
  usd: 97_500,
  at: '2026-09-10T07:00:00.000Z',
  ...overrides,
});

const snapshot = (capturedAt: string, overrides: Partial<DerivativesSnapshot> = {}): DerivativesSnapshot => ({
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
      liquidationSplit: { h24: { longUsd: 53_000_000, shortUsd: 20_000_000, longCount: 3_886, shortCount: 1_913 } },
      fundingHistory: [
        { at: '2026-09-10T00:00:00.000Z', open: 0.004, high: 0.009, low: 0.002, close: 0.008, priceOpen: 78_200, priceClose: 78_400 },
      ],
      priceHistory: [{ at: '2026-09-10T07:00:00.000Z', price: 78_000, marketCap: 1.5e12 }],
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
    recentLiquidations: [order()],
    tradersLiquidated24h: 143_000,
    screener: [
      {
        symbol: 'BTC',
        name: 'Bitcoin',
        logo: null,
        price: 78_000,
        priceChangePercent24h: -1,
        openInterestUsd: 53_000_000_000,
        openInterestChange: { h24: -0.9 },
        volumeUsd24h: 61_000_000_000,
        volumeChangePercent24h: 12,
        fundingRateByOpenInterest: 0.008,
        fundingRateAnnualized: 8.8,
        longShortRatio24h: 0.95,
        liquidationUsd24h: 73_000_000,
        longLiquidationUsd24h: 53_000_000,
        shortLiquidationUsd24h: 20_000_000,
        oiMarketCapRatio: null,
        marketCap: null,
      },
    ],
    fundingHighest: [],
    fundingLowest: [],
    macro: [],
  },
  liquidityMaps: [],
  pages: [],
  ...overrides,
});

const event = (overrides: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: 'e1',
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
});

// ------------------------------------------------------------------ identity

test('a liquidation identifies itself by venue, contract, instant and size', () => {
  assert.equal(liquidationId(order()), liquidationId(order()), 'the same order re-scraped is one row');
  assert.notEqual(liquidationId(order()), liquidationId(order({ usd: 97_501 })));
  assert.notEqual(liquidationId(order()), liquidationId(order({ at: '2026-09-10T07:00:01.000Z' })));
  assert.notEqual(liquidationId(order()), liquidationId(order({ exchange: 'Bybit' })));
  assert.notEqual(liquidationId(order()), liquidationId(order({ side: 'short' })));
});

// ---------------------------------------------------------------- derivatives

test('series with a natural key are written every scrape, sampled ones are not', async () => {
  const fake = fakeDb();
  const archive = new DerivativesArchive(prismaStub(fake.db), archiveConfig());

  const first = await archive.persist(snapshot('2026-09-10T07:00:00.000Z'));
  assert.equal(first.fundingPoints, 1);
  assert.equal(first.assetSnapshots, 1, 'the first scrape always takes an observation');
  assert.equal(first.venueSnapshots, 1);

  // A minute later: the deduped series are re-offered, the sampled ones wait.
  const second = await archive.persist(snapshot('2026-09-10T07:01:00.000Z'));
  assert.equal(second.fundingPoints, 1, 'offered again — Postgres decides what is new');
  assert.equal(second.assetSnapshots, 0, 'inside the sampling interval');
  assert.equal(second.venueSnapshots, 0);
  assert.equal(second.marketSnapshots, 0);

  // Past the interval it samples again.
  const third = await archive.persist(snapshot('2026-09-10T07:06:00.000Z'));
  assert.equal(third.assetSnapshots, 1);
  assert.equal(third.venueSnapshots, 1);
  assert.equal(third.marketSnapshots, 1);
});

test('every insert of an overlapping series leaves duplicates to Postgres', async () => {
  const fake = fakeDb();
  const archive = new DerivativesArchive(prismaStub(fake.db), archiveConfig());
  await archive.persist(snapshot('2026-09-10T07:00:00.000Z'));

  // Re-offering rows and letting the unique key reject them is what keeps the
  // writes incremental without the archive having to track what it has seen.
  for (const table of ['fundingPoint', 'pricePoint', 'liquidationOrder', 'venueSnapshot']) {
    const call = fake.written(table).at(0);
    assert.ok(call, `${table} should have been written`);
    assert.equal((call!.data as { skipDuplicates?: boolean }).skipDuplicates, true, table);
  }

  const rows = (fake.written('liquidationOrder').at(0)!.data as { data: { id: string }[] }).data;
  assert.equal(rows[0].id, liquidationId(order()), 'keyed by the order itself, not by insert order');
});

test('a scrape with no market half still archives the coins it did get', async () => {
  const fake = fakeDb();
  const archive = new DerivativesArchive(prismaStub(fake.db), archiveConfig());
  const report = await archive.persist(snapshot('2026-09-10T07:00:00.000Z', { market: null }));
  assert.equal(report.assetSnapshots, 1);
  assert.equal(report.marketSnapshots, 0);
  assert.equal(report.liquidations, 0);
});

test('without a database the archive writes nothing and says so', async () => {
  const fake = fakeDb();
  const archive = new DerivativesArchive(prismaStub(fake.db, false), archiveConfig());
  assert.equal(archive.enabled, false);
  const report = await archive.persist(snapshot('2026-09-10T07:00:00.000Z'));
  assert.deepEqual(Object.values(report), [0, 0, 0, 0, 0, 0, 0]);
  assert.equal(fake.calls.length, 0);
  assert.deepEqual(await archive.history('asset'), []);
  assert.equal(await archive.summary(), null);
});

test('archiving turned off keeps the connection but stops the writes', async () => {
  const fake = fakeDb();
  const archive = new DerivativesArchive(prismaStub(fake.db), archiveConfig({ enabled: false }));
  assert.equal(archive.enabled, false);
  await archive.persist(snapshot('2026-09-10T07:00:00.000Z'));
  assert.equal(fake.calls.length, 0);
});

test('a failing database never propagates out of an archive write', async () => {
  const exploding = {
    fundingPoint: { createMany: async () => { throw new Error('connection reset'); } },
    pricePoint: {},
    liquidationOrder: {},
  };
  const archive = new DerivativesArchive(prismaStub(exploding), archiveConfig());
  const report = await archive.persist(snapshot('2026-09-10T07:00:00.000Z'));
  assert.equal(report.fundingPoints, 0, 'the sync carries on with nothing archived');
});

// -------------------------------------------------------------------- calendar

test('the calendar writes only the rows a sync changed', async () => {
  const fake = fakeDb();
  const archive = new CalendarArchive(prismaStub(fake.db));

  assert.equal(await archive.persist([]), 0, 'a sync that changed nothing writes nothing');
  assert.equal(fake.calls.length, 0);

  await archive.persist([event(), event({ id: 'e2' })]);
  assert.equal(fake.written('calendarEvent').length, 2);
});

test('a print time is set on create but never overwritten by an update', async () => {
  const fake = fakeDb();
  const archive = new CalendarArchive(prismaStub(fake.db));
  await archive.persist([event({ released: true, actual: '2.9%' })]);

  const call = fake.written('calendarEvent').at(0)!.data as {
    create: { releasedAt: Date | null };
    update: Record<string, unknown>;
  };
  assert.ok(call.create.releasedAt instanceof Date, 'a row first seen printed is stamped now');
  assert.ok(
    !('releasedAt' in call.update),
    'a revision is not a second print, so an update must not touch it',
  );
});

test('release stamps only land on rows that have none', async () => {
  const fake = fakeDb();
  const archive = new CalendarArchive(prismaStub(fake.db));
  await archive.markReleased(['e1']);
  const call = fake.written('calendarEvent').at(0)!.data as { where: { releasedAt: null } };
  assert.equal(call.where.releasedAt, null);
});

test('history queries widen minImpact into the impacts at or above it', async () => {
  const fake = fakeDb();
  const archive = new CalendarArchive(prismaStub(fake.db));
  await archive.query({ minImpact: 'medium', currencies: ['usd'], limit: 10 });

  const call = fake.written('calendarEvent').at(0)!.data as {
    where: { impact?: { in: string[] }; currency?: { in: string[] } };
    take: number;
  };
  assert.deepEqual(call.where.impact?.in, ['medium', 'high']);
  assert.deepEqual(call.where.currency?.in, ['USD'], 'currencies are matched case-insensitively');
  assert.equal(call.take, 10);
});

test('without a database calendar history is empty rather than wrong', async () => {
  const archive = new CalendarArchive(prismaStub(fakeDb().db, false));
  assert.equal(archive.enabled, false);
  assert.deepEqual(await archive.query(), []);
  assert.equal(await archive.persist([event()]), 0);
});
