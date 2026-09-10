/**
 * Wire types for the derivatives API, mirrored from the NestJS service.
 * Kept in one place so the screen never reaches into raw JSON.
 */

import type { Tone } from '@/data/market';

export const WINDOWS = ['m5', 'm15', 'm30', 'h1', 'h4', 'h12', 'h24', 'd3', 'd7', 'd30'] as const;
export type Window = (typeof WINDOWS)[number];
export type WindowValues = Partial<Record<Window, number>>;

export type LiquidationBucket = {
  name: string;
  logo: string | null;
  totalUsd: number;
  longUsd: number;
  shortUsd: number;
  longRate: number | null;
  shortRate: number | null;
  count: number | null;
  longCount: number | null;
  shortCount: number | null;
  share: number | null;
};

export type LiquidationOrder = {
  exchange: string;
  symbol: string;
  instrumentId: string | null;
  side: 'long' | 'short' | null;
  price: number | null;
  quantity: number | null;
  usd: number;
  at: string;
};

export type Venue = {
  exchange: string;
  logo: string | null;
  symbol: string;
  instrumentId: string | null;
  perpetual: boolean;
  openInterestUsd: number;
  openInterestAmount: number | null;
  openInterestChangePercent24h: number | null;
  volumeUsd24h: number | null;
  volumeChangePercent24h: number | null;
  oiVolumeRatio: number | null;
  fundingRate: number | null;
  fundingIntervalHours: number | null;
  nextFundingAt: string | null;
  longRate: number | null;
  shortRate: number | null;
  longVolumeUsd: number | null;
  shortVolumeUsd: number | null;
  longLiquidationUsd24h: number | null;
  shortLiquidationUsd24h: number | null;
  price: number | null;
  indexPrice: number | null;
  priceChangePercent24h: number | null;
  bidDepth: number | null;
  askDepth: number | null;
};

export type VolumeVenue = {
  exchange: string;
  volumeUsd24h: number;
  volumeChangePercent24h: number | null;
};

export type FundingPoint = {
  at: string;
  open: number;
  high: number;
  low: number;
  close: number;
  priceOpen: number | null;
  priceClose: number | null;
};

export type PricePoint = { at: string; price: number; marketCap: number | null };

export type NetFlow = { window: string; inflowUsd: number; outflowUsd: number; netUsd: number };

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
  openInterestChange: WindowValues;
  openInterestChangeUsd: WindowValues;
  volumeUsd24h: number | null;
  volumeChange: WindowValues;
  spotVolumeUsd24h: number | null;
  oiVolumeRatio: number | null;
  oiMarketCapRatio: number | null;
  optionsOpenInterestUsd: number | null;
  optionsOpenInterestChangePercent24h: number | null;
  optionsVolumeUsd24h: number | null;
  optionsVolumeChangePercent24h: number | null;
  fundingRateByOpenInterest: number | null;
  fundingRateByVolume: number | null;
  fundingRateBySymbol: number | null;
  fundingRateAnnualized: number | null;
  longShortRatio: WindowValues;
  globalAccountRatio: number | null;
  topAccountRatio: number | null;
  topPositionRatio: number | null;
  okxGlobalAccountRatio: number | null;
  rsi: Partial<Record<'m15' | 'h1' | 'h4' | 'h12' | 'd1' | 'w1', number>>;
  liquidationUsd24h: number | null;
  liquidationCount24h: number | null;
};

export type LiquidationWindow = 'h1' | 'h4' | 'h12' | 'h24';

export type AssetDerivatives = {
  summary: AssetSummary;
  venues: Venue[];
  liquidations: Partial<Record<LiquidationWindow, LiquidationBucket>>;
  liquidationSplit: Partial<
    Record<
      LiquidationWindow,
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

export type MacroCard = {
  key: string;
  title: string;
  value: number | null;
  display: string | null;
  change: number | null;
  /** False for the balance cards, whose delta is a coin count, not a rate. */
  changeIsPercent: boolean;
};

export type MarketOverview = {
  openInterestUsd: number | null;
  openInterestChangePercent24h: number | null;
  liquidationUsd24h: number | null;
  liquidationChangePercent24h: number | null;
  liquidationSeries: number[];
  averageRsi: number | null;
  liquidations: Partial<Record<LiquidationWindow, LiquidationBucket>>;
  liquidationsByExchange: LiquidationBucket[];
  liquidationsByExchangeWindow: LiquidationWindow | null;
  liquidationsByCoin: LiquidationBucket[];
  largestLiquidation: LiquidationOrder | null;
  recentLiquidations: LiquidationOrder[];
  tradersLiquidated24h: number | null;
  screener: ScreenerRow[];
  fundingHighest: FundingExtreme[];
  fundingLowest: FundingExtreme[];
  macro: MacroCard[];
};

/**
 * CoinGlass' liquidation heatmap: leverage waiting to be liquidated, by price
 * and time. Arrives downsampled — see the server's mapper for the grid maths.
 */
export type LiquidityMap = {
  symbol: string;
  exchange: string | null;
  instrumentId: string | null;
  updatedAt: string;
  capturedAt: string;
  /** Price levels, low to high; `cells` index into this. */
  levels: number[];
  /** Column start times, oldest first; `cells` index into this. */
  columns: string[];
  /** Sparse grid of [columnIndex, levelIndex, usd]. */
  cells: [number, number, number][];
  candles: { at: string; open: number; high: number; low: number; close: number }[];
  /** Leverage resting at each price, summed across time. */
  profile: { price: number; usd: number }[];
  rangeLow: number;
  rangeHigh: number;
  maxCell: number;
  price: number | null;
};

export type LiquidityMapResponse = {
  available: string[];
  symbol: string;
  map: LiquidityMap;
};

export type SyncOutcome = {
  trigger: string;
  source: string | null;
  startedAt: string;
  durationMs: number;
  ok: boolean;
  error: string | null;
  assets: string[];
  pagesOk: number;
  pagesAttempted: number;
};

export type DerivativesResponse = {
  generatedAt: string;
  capturedAt: string | null;
  lastChangedAt: string | null;
  snapshotCapturedAt: string | null;
  refreshIntervalMs: number;
  lastSync: SyncOutcome | null;
  available: string[];
  /** Symbols the service captured a liquidity map for. */
  liquidityMaps?: string[];
  symbol: string | null;
  /** False when the service has only a screener row for this coin. */
  tracked?: boolean;
  asset: AssetDerivatives | null;
  market: MarketOverview | null;
};

// ------------------------------------------------------------------ labelling

export const WINDOW_LABELS: Record<Window, string> = {
  m5: '5m',
  m15: '15m',
  m30: '30m',
  h1: '1H',
  h4: '4H',
  h12: '12H',
  h24: '24H',
  d3: '3D',
  d7: '7D',
  d30: '30D',
};

/** Windows the open-interest view offers, longest context last. */
export const OI_WINDOWS: Window[] = ['m15', 'h1', 'h4', 'h24', 'd7', 'd30'];
export const LIQUIDATION_WINDOWS: LiquidationWindow[] = ['h1', 'h4', 'h12', 'h24'];

// ----------------------------------------------------------------- formatting

/** "$36.7B" — the unit derivatives numbers are read in. */
export function formatUsd(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const sign = value < 0 ? '-' : '';
  const size = Math.abs(value);
  if (size >= 1e12) return `${sign}$${(size / 1e12).toFixed(digits)}T`;
  if (size >= 1e9) return `${sign}$${(size / 1e9).toFixed(digits)}B`;
  if (size >= 1e6) return `${sign}$${(size / 1e6).toFixed(digits)}M`;
  if (size >= 1e3) return `${sign}$${(size / 1e3).toFixed(digits)}K`;
  return `${sign}$${size.toFixed(digits)}`;
}

export function formatPrice(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const digits = Math.abs(value) >= 1000 ? 0 : Math.abs(value) >= 1 ? 2 : 5;
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

/** Signed percentage: "+4.8%". */
export function formatPercent(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${value > 0 ? '+' : ''}${value.toFixed(digits)}%`;
}

/** Funding rates are tiny; they need more decimals than a price change. */
export function formatRate(value: number | null | undefined, digits = 4): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${value > 0 ? '+' : ''}${value.toFixed(digits)}%`;
}

export function formatAmount(value: number | null | undefined, symbol: string): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const size = Math.abs(value);
  const digits = size >= 1000 ? 0 : 2;
  return `${value.toLocaleString(undefined, { maximumFractionDigits: digits })} ${symbol}`;
}

export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return `${Math.round(value)}`;
}

/** "2 min ago" — used for the freshness line and the liquidation feed. */
export function formatAgo(iso: string | null, now = Date.now()): string {
  if (!iso) return 'never';
  const seconds = Math.round((now - new Date(iso).getTime()) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** "in 3h 12m" for the next funding stamp. */
export function formatUntil(iso: string | null, now = Date.now()): string {
  if (!iso) return '—';
  const delta = new Date(iso).getTime() - now;
  if (delta <= 0) return 'due';
  const minutes = Math.floor(delta / 60_000);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${String(minutes % 60).padStart(2, '0')}m`;
  return `${minutes}m`;
}

/** A macro card's delta, with a percent sign only where one belongs. */
export function formatCardChange(card: MacroCard): string {
  if (card.change === null || !Number.isFinite(card.change)) return '—';
  if (card.changeIsPercent) return formatPercent(card.change);
  return `${card.change > 0 ? '+' : ''}${card.change.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export const changeTone = (value: number | null | undefined): Tone => {
  if (value === null || value === undefined || !Number.isFinite(value) || value === 0) return 'neutral';
  return value > 0 ? 'positive' : 'negative';
};

/**
 * Funding is a cost, not a direction. Positive means longs are paying, which
 * is healthy while it is small and a crowding warning once it is not — so the
 * tone tracks magnitude rather than sign.
 */
export function fundingTone(rate: number | null | undefined): Tone {
  if (rate === null || rate === undefined || !Number.isFinite(rate)) return 'neutral';
  const size = Math.abs(rate);
  if (size >= 0.05) return 'negative';
  if (size >= 0.02) return 'warning';
  return 'positive';
}

export function fundingVerdict(rate: number | null | undefined): string {
  if (rate === null || rate === undefined || !Number.isFinite(rate)) return 'No data';
  const size = Math.abs(rate);
  if (size >= 0.05) return rate > 0 ? 'Longs crowded' : 'Shorts crowded';
  if (size >= 0.02) return rate > 0 ? 'Longs paying up' : 'Shorts paying up';
  return 'Balanced';
}

/** Long share of a long/short pair, as a percentage of the two. */
/**
 * The clusters a move would run into first, above and below the current price.
 * These are the two numbers a trader actually reads off a heatmap.
 */
export function nearestClusters(
  map: LiquidityMap,
): { above: { price: number; usd: number } | null; below: { price: number; usd: number } | null } {
  const price = map.price;
  if (price === null) return { above: null, below: null };

  // "Significant" is relative to the map: a tenth of its biggest single level.
  const biggest = map.profile.reduce((most, level) => Math.max(most, level.usd), 0);
  const floor = biggest * 0.1;
  const meaningful = map.profile.filter((level) => level.usd >= floor);

  const above = meaningful.filter((level) => level.price > price).at(0) ?? null;
  const below = meaningful.filter((level) => level.price < price).at(-1) ?? null;
  return { above, below };
}

/**
 * Heat ramp for the map, dark to bright.
 *
 * Intensity is scaled by the square root of the share: liquidation clusters are
 * extremely long-tailed, and a linear ramp leaves everything but the single
 * biggest band black.
 */
export function heatColor(usd: number, max: number): string {
  if (max <= 0 || usd <= 0) return 'rgba(56,189,248,0)';
  const scale = Math.min(1, Math.sqrt(usd / max));
  // Deep blue → teal → green → amber, matching how the source reads.
  const stops: [number, number, number][] = [
    [30, 41, 120],
    [30, 130, 160],
    [40, 190, 140],
    [190, 220, 90],
    [250, 210, 70],
  ];
  const position = scale * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.floor(position));
  const t = position - index;
  const [r1, g1, b1] = stops[index];
  const [r2, g2, b2] = stops[index + 1];
  const mix = (a: number, b: number) => Math.round(a + (b - a) * t);
  return `rgb(${mix(r1, r2)}, ${mix(g1, g2)}, ${mix(b1, b2)})`;
}

export function longShare(longUsd: number, shortUsd: number): number {
  const total = longUsd + shortUsd;
  return total > 0 ? (longUsd / total) * 100 : 50;
}

/** A long/short *ratio* (1.2 = 20% more longs) as a long percentage. */
export function ratioToLongPercent(ratio: number | null | undefined): number | null {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio) || ratio <= 0) return null;
  return (ratio / (1 + ratio)) * 100;
}

/**
 * What rising or falling open interest means alongside the price move — the
 * one reading of this screen that is genuinely interpretive, so it says the
 * textbook version and nothing more.
 */
export function positioningNote(
  priceChange: number | null,
  oiChange: number | null,
  funding: number | null,
): string {
  if (priceChange === null || oiChange === null) return 'Not enough data to read positioning yet.';
  const up = priceChange > 0;
  const building = oiChange > 0;
  const fundingNote =
    funding === null
      ? ''
      : Math.abs(funding) >= 0.02
        ? ` Funding at ${formatRate(funding)} says that leverage is getting expensive.`
        : ` Funding at ${formatRate(funding)} is not yet extreme.`;

  if (up && building) return `Price and open interest both rising: new money is opening longs.${fundingNote}`;
  if (up && !building) return `Price up while open interest falls: this is short covering, not fresh buying.${fundingNote}`;
  if (!up && building) return `Price down while open interest rises: new shorts are being opened.${fundingNote}`;
  return `Price and open interest both falling: positions are being closed out.${fundingNote}`;
}
