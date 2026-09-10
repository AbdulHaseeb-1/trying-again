/**
 * Wire model for the derivatives snapshot.
 *
 * CoinGlass exposes the same measure over many windows (5m … 30d) and many
 * venues, so the shapes here are deliberately uniform: a `Window`-keyed record
 * for anything measured over time, and one row type per venue. The app can
 * then switch a timeframe chip without a bespoke branch per metric.
 */

/** Windows CoinGlass reports over. Not every metric fills every one. */
export const WINDOWS = ['m5', 'm15', 'm30', 'h1', 'h4', 'h12', 'h24', 'd3', 'd7', 'd30'] as const;
export type Window = (typeof WINDOWS)[number];

export type WindowValues = Partial<Record<Window, number>>;

export type LiquidationBucket = {
  /** 'All' for the aggregate row, otherwise the venue or coin name. */
  name: string;
  logo: string | null;
  totalUsd: number;
  longUsd: number;
  shortUsd: number;
  /** Percent of the total that was long, as CoinGlass reports it. */
  longRate: number | null;
  shortRate: number | null;
  /** Liquidated positions, not dollars. */
  count: number | null;
  longCount: number | null;
  shortCount: number | null;
  /** Share of the market-wide total, for the venue breakdown. */
  share: number | null;
};

export type LiquidationOrder = {
  exchange: string;
  symbol: string;
  instrumentId: string | null;
  /** 'long' means a long position was liquidated (a forced sell). */
  side: 'long' | 'short' | null;
  price: number | null;
  quantity: number | null;
  usd: number;
  at: string;
};

/** One perpetual or futures contract on one venue. */
export type Venue = {
  exchange: string;
  logo: string | null;
  symbol: string;
  instrumentId: string | null;
  /** CoinGlass' contract type flag: 1 = perpetual, 2 = delivery futures. */
  perpetual: boolean;
  openInterestUsd: number;
  openInterestAmount: number | null;
  openInterestChangePercent24h: number | null;
  volumeUsd24h: number | null;
  volumeChangePercent24h: number | null;
  /** Open interest divided by 24h volume — how "sticky" the venue's book is. */
  oiVolumeRatio: number | null;
  fundingRate: number | null;
  fundingIntervalHours: number | null;
  nextFundingAt: string | null;
  /** Percent of taker volume on each side, 0-100. */
  longRate: number | null;
  shortRate: number | null;
  longVolumeUsd: number | null;
  shortVolumeUsd: number | null;
  longLiquidationUsd24h: number | null;
  shortLiquidationUsd24h: number | null;
  price: number | null;
  indexPrice: number | null;
  priceChangePercent24h: number | null;
  /** Resting size within CoinGlass' depth window, in contracts. */
  bidDepth: number | null;
  askDepth: number | null;
};

export type VolumeVenue = {
  exchange: string;
  volumeUsd24h: number;
  volumeChangePercent24h: number | null;
};

/** A point on the funding-rate candle series, with the price at the same instant. */
export type FundingPoint = {
  at: string;
  open: number;
  high: number;
  low: number;
  close: number;
  priceOpen: number | null;
  priceClose: number | null;
};

export type PricePoint = {
  at: string;
  price: number;
  marketCap: number | null;
};

/** Spot money in and out of the asset over a window, as CoinGlass nets it. */
export type NetFlow = {
  window: string;
  inflowUsd: number;
  outflowUsd: number;
  netUsd: number;
};

export type AssetSummary = {
  symbol: string;
  name: string | null;
  logo: string | null;
  price: number | null;
  priceChangePercent24h: number | null;
  priceChangePercent7d: number | null;
  marketCap: number | null;
  circulatingSupply: number | null;

  openInterestUsd: number | null;
  openInterestAmount: number | null;
  /** Percent change of open interest, per window. */
  openInterestChange: WindowValues;
  /** Absolute change of open interest in USD, per window. */
  openInterestChangeUsd: WindowValues;
  volumeUsd24h: number | null;
  volumeChange: WindowValues;
  spotVolumeUsd24h: number | null;
  /** Open interest over 24h volume, and over market cap. */
  oiVolumeRatio: number | null;
  oiMarketCapRatio: number | null;

  optionsOpenInterestUsd: number | null;
  optionsOpenInterestChangePercent24h: number | null;
  optionsVolumeUsd24h: number | null;
  optionsVolumeChangePercent24h: number | null;

  /** Weighted funding across venues, in percent per interval. */
  fundingRateByOpenInterest: number | null;
  fundingRateByVolume: number | null;
  fundingRateBySymbol: number | null;
  /** Annualised from the OI-weighted rate, as CoinGlass publishes it. */
  fundingRateAnnualized: number | null;

  /** Taker long/short volume ratio, per window. */
  longShortRatio: WindowValues;
  /** Binance's account-level ratios — the crowd, then the top traders. */
  globalAccountRatio: number | null;
  topAccountRatio: number | null;
  topPositionRatio: number | null;
  okxGlobalAccountRatio: number | null;

  rsi: Partial<Record<'m15' | 'h1' | 'h4' | 'h12' | 'd1' | 'w1', number>>;
  liquidationUsd24h: number | null;
  liquidationCount24h: number | null;
};

export type AssetDerivatives = {
  summary: AssetSummary;
  /** Every listed contract CoinGlass tracks for the asset. */
  venues: Venue[];
  /** Liquidations for this asset, keyed by window. */
  liquidations: Partial<Record<'h1' | 'h4' | 'h12' | 'h24', LiquidationBucket>>;
  /** Long/short liquidation dollars and position counts per window. */
  liquidationSplit: Partial<
    Record<
      'h1' | 'h4' | 'h12' | 'h24',
      { longUsd: number; shortUsd: number; longCount: number | null; shortCount: number | null }
    >
  >;
  fundingHistory: FundingPoint[];
  priceHistory: PricePoint[];
  spotVolumeByExchange: VolumeVenue[];
  futuresVolumeByExchange: VolumeVenue[];
  netFlows: NetFlow[];
  updatedAt: string;
};

/**
 * One row of the whole-market screener: every measure CoinGlass publishes for
 * a coin's futures market, aggregated across venues.
 */
export type ScreenerRow = {
  symbol: string;
  name: string | null;
  logo: string | null;
  price: number | null;
  priceChangePercent24h: number | null;
  openInterestUsd: number | null;
  openInterestChange: WindowValues;
  volumeUsd24h: number | null;
  volumeChangePercent24h: number | null;
  fundingRateByOpenInterest: number | null;
  fundingRateAnnualized: number | null;
  longShortRatio24h: number | null;
  liquidationUsd24h: number | null;
  longLiquidationUsd24h: number | null;
  shortLiquidationUsd24h: number | null;
  oiMarketCapRatio: number | null;
  marketCap: number | null;
};

export type FundingExtreme = {
  symbol: string;
  exchange: string;
  instrumentId: string | null;
  fundingRate: number;
  predictedRate: number | null;
};

/** A headline number from CoinGlass' home cards (BTC dominance, exchange balance, …). */
export type MacroCard = {
  key: string;
  title: string;
  value: number | null;
  display: string | null;
  change: number | null;
  /**
   * Whether `change` is a percentage. CoinGlass sends every card's delta in one
   * `changePercent` field but renders the balance cards without a `%` — that one
   * is a coin count, not a rate, and labelling it as a percent would put an
   * absurd number ("+949%") on screen.
   */
  changeIsPercent: boolean;
};

export type MarketOverview = {
  openInterestUsd: number | null;
  openInterestChangePercent24h: number | null;
  liquidationUsd24h: number | null;
  liquidationChangePercent24h: number | null;
  /** Hourly liquidation totals for the last day, oldest first. */
  liquidationSeries: number[];
  averageRsi: number | null;
  /** Market-wide liquidations by window, then split by venue and by coin. */
  liquidations: Partial<Record<'h1' | 'h4' | 'h12' | 'h24', LiquidationBucket>>;
  liquidationsByExchange: LiquidationBucket[];
  /** Which window `liquidationsByExchange` covers — CoinGlass does not say. */
  liquidationsByExchangeWindow: 'h1' | 'h4' | 'h12' | 'h24' | null;
  liquidationsByCoin: LiquidationBucket[];
  largestLiquidation: LiquidationOrder | null;
  recentLiquidations: LiquidationOrder[];
  tradersLiquidated24h: number | null;
  /** The whole futures market, coin by coin. */
  screener: ScreenerRow[];
  fundingHighest: FundingExtreme[];
  fundingLowest: FundingExtreme[];
  macro: MacroCard[];
};

export type SourceName = 'coinglass-scrape';

/** What one page of the scrape produced — surfaced so a partial run is visible. */
export type PageReport = {
  page: string;
  url: string;
  ok: boolean;
  durationMs: number;
  payloads: number;
  /** Classified payload kinds the page yielded, deduplicated. */
  kinds: string[];
  error: string | null;
};

export type DerivativesSnapshot = {
  capturedAt: string;
  source: SourceName;
  durationMs: number;
  market: MarketOverview | null;
  assets: AssetDerivatives[];
  pages: PageReport[];
};

export type SyncTrigger = 'boot' | 'interval' | 'manual';

export type SyncOutcome = {
  trigger: SyncTrigger;
  source: SourceName | null;
  startedAt: string;
  durationMs: number;
  ok: boolean;
  error: string | null;
  /** Assets whose breakdown was refreshed by this run. */
  assets: string[];
  /** Pages that answered out of the pages attempted. */
  pagesOk: number;
  pagesAttempted: number;
};
