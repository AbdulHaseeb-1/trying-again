import assert from 'node:assert/strict';
import { test } from 'node:test';

import { classify } from '../src/derivatives/sources/coinglass.classify';
import {
  buildAsset,
  buildMarketOverview,
  buildSnapshot,
  num,
  toLiquidationOrder,
  toVenue,
  type HarvestBundle,
  type MapperLimits,
} from '../src/derivatives/sources/coinglass.mapper';
import { DerivativesStore } from '../src/derivatives/derivatives.store';
import type { AssetDerivatives, DerivativesSnapshot } from '../src/derivatives/derivatives.types';

const limits: MapperLimits = { maxOrders: 10, maxScreenerRows: 10, maxSeriesPoints: 3 };

const venueRow = {
  exName: 'Binance',
  exchangeLogo: 'logo.png',
  symbol: 'BTC/USDT',
  instrumentId: 'BTCUSDT',
  type: 1,
  openInterest: 8_200_000_000,
  openInterestAmount: 104_827.65,
  h24OiChangePercent: -1.87,
  volUsd: 11_988_007_415,
  h24VolUsdChangePercent: 20.03,
  oiVolRadio: 0.6856,
  fundingRate: 0.01,
  fundingInterval: 8,
  nextFundingTime: 1_789_027_200_000,
  longRate: 49.39,
  shortRate: 50.61,
  h24LongLiquidationUsd: 7_894_026.85,
  h24ShortLiquidationUsd: 20_095_399.66,
  price: 78_413.8,
  depth: { bidTotal: 2425.2, askTotal: 2378.8, bids: [[1, 2]], asks: [[3, 4]] },
};

const screenerRow = {
  symbol: 'BTC',
  name: 'Bitcoin',
  symbolLogo: 'btc.png',
  price: 78_404.7,
  openInterest: 53_416_036_470,
  openInterestAmount: 681_236.3,
  avgFundingRateByOi: 0.008341,
  avgFundingRateByOiAPR: 9.1334,
  h24OiChangePercent: -0.86,
  oiChangePercent7d: -0.76,
  h24Ls: 0.9573,
  h24LiquidationUsd: 73_460_445,
  h24LongLiquidationUsd: 52_970_309,
  h24ShortLiquidationUsd: 20_490_136,
  longLiquidationNumber24h: 3_886,
  shortLiquidationNumber24h: 1_913,
  rsi4h: 40.9,
};

const bundle = (page: string, symbol: string | null, values: unknown[]): HarvestBundle => ({
  page,
  symbol,
  classified: values.flatMap((value) => {
    const entry = classify(value);
    return entry ? [entry] : [];
  }),
});

// ------------------------------------------------------------- classification

test('payloads are identified by shape, not by endpoint', () => {
  assert.equal(classify([venueRow])?.kind, 'coin-venues');
  assert.equal(classify({ total: 1, list: [screenerRow] })?.kind, 'screener');
  assert.equal(classify([screenerRow])?.kind, 'screener');
  assert.equal(
    classify({ openInterest: 1, liquidation24h: 2, liquidationList: [1, 2] })?.kind,
    'market-statistics',
  );
  assert.equal(classify({ maxOrder: {}, info: {} })?.kind, 'liquidation-largest');
  assert.equal(classify({ frMin: [], frMax: [] })?.kind, 'funding-extremes');
  assert.equal(
    classify({ h1: { totalVolUsd: 1, longVolUsd: 1 }, h24: { totalVolUsd: 2, longVolUsd: 1 } })?.kind,
    'liquidation-periods',
  );
  assert.equal(classify({ symbol: 'BTC', '24h': ['1', '2', '3', 4, 5] })?.kind, 'net-flows');
  assert.equal(classify({ spots: [], futures: [] })?.kind, 'volume-by-exchange');
});

test('the encrypted envelope itself is never mistaken for data', () => {
  assert.equal(classify({ code: '0', msg: 'success', data: 'ZW5jcnlwdGVk' }), null);
  assert.equal(classify({ nothing: 'recognisable' }), null);
  assert.equal(classify([]), null);
});

test('server-rendered props are unwrapped to the coin they describe', () => {
  const nextData = {
    props: { pageProps: { coinInfo: { symbol: 'BTC', openInterest: 1, futuresVolUsd: 2, marketCap: 3 } } },
  };
  const classified = classify(nextData);
  assert.equal(classified?.kind, 'coin-info');
  assert.equal((classified?.value as { symbol: string }).symbol, 'BTC');
});

// -------------------------------------------------------------------- mapping

test('numeric strings and numbers are both accepted', () => {
  assert.equal(num('171766922519'), 171766922519);
  assert.equal(num(0.0084), 0.0084);
  assert.equal(num(''), null);
  assert.equal(num('not a number'), null);
  assert.equal(num(Number.POSITIVE_INFINITY), null);
});

test('venue liquidation sides are flipped back to match every other endpoint', () => {
  const venue = toVenue(venueRow)!;
  // The row says long 7.89M / short 20.09M; summed across venues that pairing
  // is the mirror of the coin's own aggregate, so it is corrected on the way in.
  assert.equal(venue.longLiquidationUsd24h, 20_095_399.66);
  assert.equal(venue.shortLiquidationUsd24h, 7_894_026.85);
});

test('a venue row keeps the totals and drops the order ladder', () => {
  const venue = toVenue(venueRow)!;
  assert.equal(venue.exchange, 'Binance');
  assert.equal(venue.perpetual, true);
  assert.equal(venue.nextFundingAt, new Date(1_789_027_200_000).toISOString());
  assert.equal(venue.bidDepth, 2425.2);
  assert.ok(!('bids' in venue), 'the megabyte-sized ladder must not reach the API');
});

test('liquidation sides follow CoinGlass: 1 is a liquidated long', () => {
  const order = toLiquidationOrder({
    volUsd: 100,
    createTime: 1_789_000_000_000,
    exchangeName: 'Binance',
    symbol: 'BTC',
    side: 1,
  })!;
  assert.equal(order.side, 'long');
  assert.equal(
    toLiquidationOrder({ volUsd: 1, createTime: 1_789_000_000_000, side: 2 })?.side,
    'short',
  );
  assert.equal(toLiquidationOrder({ exchangeName: 'Binance' }), null);
});

test('an asset merges its own page with the market screener row', () => {
  const bundles = [
    bundle('home', null, [{ total: 1, list: [screenerRow] }]),
    bundle('coin:BTC', 'BTC', [
      [venueRow],
      { symbol: 'BTC', futuresOiUsd: 53_000_000_000, optionOiUsd: 42_000_000_000, ls: 0.95 },
      [{ data: [1_789_000_000, '0.001', '0.002', '0.0005', '0.0018'], price: ['78000', '78100'] }],
    ]),
  ];

  const asset = buildAsset('BTC', bundles, limits, '2026-09-10T00:00:00.000Z')!;
  assert.equal(asset.summary.symbol, 'BTC');
  // The venue table is the only source of contract counts per venue…
  assert.equal(asset.venues.length, 1);
  // …but CoinGlass' own total wins over summing them.
  assert.equal(asset.summary.openInterestAmount, 681_236.3);
  assert.equal(asset.summary.fundingRateAnnualized, 9.1334);
  assert.equal(asset.summary.optionsOpenInterestUsd, 42_000_000_000);
  assert.equal(asset.summary.openInterestChange.d7, -0.76);
  assert.equal(asset.summary.rsi.h4, 40.9);
  assert.equal(asset.liquidationSplit.h24?.longUsd, 52_970_309);
  assert.equal(asset.liquidationSplit.h24?.longCount, 3_886);
  assert.equal(asset.fundingHistory.length, 1);
});

test('the coin window payload keeps its dollars but not its inverted counts', () => {
  // CoinGlass reports the larger side's dollars against the smaller side's
  // count here; the screener's own counts (checked above) are the usable pair.
  const periods = {
    h24: {
      totalUsd: 0,
      totalVolUsd: 72_911_324,
      longVolUsd: 53_030_790,
      shortVolUsd: 19_880_534,
      number: 5_747,
      longNumber: 1_855,
      shortNumber: 3_892,
    },
  };
  const asset = buildAsset(
    'BTC',
    [bundle('coin:BTC', 'BTC', [[venueRow], periods])],
    limits,
    '2026-09-10T00:00:00.000Z',
  )!;
  assert.equal(asset.liquidations.h24?.longUsd, 53_030_790);
  assert.equal(asset.liquidations.h24?.count, 5_747, 'the total is consistent and survives');
  assert.equal(asset.liquidations.h24?.longCount, null);
  assert.equal(asset.liquidations.h24?.shortCount, null);
});

test('an asset with no page of its own is not invented', () => {
  const bundles = [bundle('home', null, [{ total: 1, list: [screenerRow] }])];
  assert.equal(buildAsset('BTC', bundles, limits, '2026-09-10T00:00:00.000Z'), null);
});

test('the screener merges every slice the market pages carry', () => {
  const aggregate = {
    exchangeName: 'All',
    avgFundingRate: 0.004,
    openInterest: 1_000_000,
    kLink: { baseAsset: 'DOGE' },
    liqInfo: { symbol: 'DOGE', totalVolUsd: 5_000, longVolUsd: 4_000, shortVolUsd: 1_000 },
  };
  const market = buildMarketOverview(
    [bundle('home', null, [{ total: 2, list: [screenerRow] }, [aggregate]])],
    limits,
  )!;
  assert.deepEqual(
    market.screener.map((row) => row.symbol),
    ['BTC', 'DOGE'],
    'both the full screener row and the aggregate-only coin survive, richest first',
  );
  assert.equal(market.screener[1].liquidationUsd24h, 5_000);
});

test('market liquidations separate the aggregate row from the venue rows', () => {
  const market = buildMarketOverview(
    [
      bundle('liquidations', null, [
        [
          { exchangeName: 'All', totalVolUsd: 100, longVolUsd: 60, shortVolUsd: 40, rate: 100 },
          { exchangeName: 'Binance', totalVolUsd: 60, longVolUsd: 40, shortVolUsd: 20, rate: 60 },
        ],
        { maxOrder: { volUsd: 9, createTime: 1_789_000_000_000, side: 2 }, info: { number: 143_400 } },
      ]),
    ],
    limits,
  )!;
  assert.deepEqual(market.liquidationsByExchange.map((row) => row.name), ['Binance']);
  assert.equal(market.tradersLiquidated24h, 143_400);
  assert.equal(market.largestLiquidation?.side, 'short');
});

test('the venue breakdown is matched to the window it actually covers', () => {
  const periods = {
    h1: { totalVolUsd: 25, longVolUsd: 20, shortVolUsd: 5 },
    h4: { totalVolUsd: 100, longVolUsd: 60, shortVolUsd: 40 },
  };
  const byExchange = [
    { exchangeName: 'All', totalVolUsd: 100, longVolUsd: 60, shortVolUsd: 40 },
    { exchangeName: 'Binance', totalVolUsd: 60, longVolUsd: 40, shortVolUsd: 20 },
  ];
  const market = buildMarketOverview([bundle('liquidations', null, [periods, byExchange])], limits)!;
  assert.equal(market.liquidationsByExchangeWindow, 'h4');

  // With nothing to match against, it says so rather than guessing 24h.
  const unmatched = buildMarketOverview([bundle('liquidations', null, [byExchange])], limits)!;
  assert.equal(unmatched.liquidationsByExchangeWindow, null);
});

test('balance cards keep their delta but not a percent sign', () => {
  const cards = {
    card1: [
      { key: 'BTC_MARKET_CAP_RADIO', title: 'Bitcoin Dominance', value: 59.07, changePercent: 0.32 },
      { key: 'EX_BTC_BALANCE', title: 'Bitcoin Exchange Balance', value: 2_480_397, changePercent: 948 },
    ],
  };
  const market = buildMarketOverview([bundle('home', null, [cards])], limits)!;
  assert.equal(market.macro[0].changeIsPercent, true);
  assert.equal(market.macro[1].change, 948);
  assert.equal(market.macro[1].changeIsPercent, false, '+948 coins is not +948 percent');
});

test('a run that reached nothing produces no market overview', () => {
  assert.equal(buildMarketOverview([bundle('home', null, [{ irrelevant: true }])], limits), null);
});

test('the snapshot reports which pages answered', () => {
  const snapshot = buildSnapshot([bundle('coin:BTC', 'BTC', [[venueRow]])], {
    assets: ['BTC', 'ETH'],
    limits,
    capturedAt: '2026-09-10T00:00:00.000Z',
    durationMs: 42,
    pages: [
      { page: 'coin:BTC', url: 'u', ok: true, durationMs: 1, payloads: 1, kinds: ['coin-venues'], error: null },
      { page: 'coin:ETH', url: 'u', ok: false, durationMs: 1, payloads: 0, kinds: [], error: 'timeout' },
    ],
  });
  assert.deepEqual(snapshot.assets.map((asset) => asset.summary.symbol), ['BTC']);
  assert.equal(snapshot.pages.filter((page) => page.ok).length, 1);
});

// ---------------------------------------------------------------------- store

const asset = (symbol: string, price: number): AssetDerivatives => ({
  summary: {
    symbol,
    name: symbol,
    logo: null,
    price,
    priceChangePercent24h: null,
    priceChangePercent7d: null,
    marketCap: null,
    circulatingSupply: null,
    openInterestUsd: 1,
    openInterestAmount: null,
    openInterestChange: {},
    openInterestChangeUsd: {},
    volumeUsd24h: null,
    volumeChange: {},
    spotVolumeUsd24h: null,
    oiVolumeRatio: null,
    oiMarketCapRatio: null,
    optionsOpenInterestUsd: null,
    optionsOpenInterestChangePercent24h: null,
    optionsVolumeUsd24h: null,
    optionsVolumeChangePercent24h: null,
    fundingRateByOpenInterest: null,
    fundingRateByVolume: null,
    fundingRateBySymbol: null,
    fundingRateAnnualized: null,
    longShortRatio: {},
    globalAccountRatio: null,
    topAccountRatio: null,
    topPositionRatio: null,
    okxGlobalAccountRatio: null,
    rsi: {},
    liquidationUsd24h: null,
    liquidationCount24h: null,
  },
  venues: [],
  liquidations: {},
  liquidationSplit: {},
  fundingHistory: [],
  priceHistory: [],
  spotVolumeByExchange: [],
  futuresVolumeByExchange: [],
  netFlows: [],
  updatedAt: '2026-09-10T00:00:00.000Z',
});

const snapshot = (assets: AssetDerivatives[], market: DerivativesSnapshot['market'] = null): DerivativesSnapshot => ({
  capturedAt: '2026-09-10T00:00:00.000Z',
  source: 'coinglass-scrape',
  durationMs: 1,
  market,
  assets,
  pages: [],
});

test('a partial run never blanks an asset an earlier run captured', () => {
  const store = new DerivativesStore();
  store.merge(snapshot([asset('BTC', 78_000), asset('ETH', 2_400)]));

  // The ETH page failed this time round; BTC advances, ETH stands.
  const report = store.merge(snapshot([asset('BTC', 79_000)]));
  assert.deepEqual(report.updated, ['BTC']);
  assert.deepEqual(report.retained, ['ETH']);
  assert.equal(store.asset('BTC')?.summary.price, 79_000);
  assert.equal(store.asset('ETH')?.summary.price, 2_400);
});

test('a run without market pages keeps the market overview it had', () => {
  const store = new DerivativesStore();
  const market = buildMarketOverview(
    [bundle('home', null, [{ openInterest: 5, liquidation24h: 6, liquidationList: [1] }])],
    limits,
  );
  store.merge(snapshot([], market));
  const report = store.merge(snapshot([asset('BTC', 1)]));
  assert.equal(report.marketUpdated, false);
  assert.equal(store.market?.openInterestUsd, 5);
});

test('symbols are looked up case-insensitively', () => {
  const store = new DerivativesStore();
  store.merge(snapshot([asset('BTC', 1)]));
  assert.equal(store.asset('btc')?.summary.symbol, 'BTC');
});
