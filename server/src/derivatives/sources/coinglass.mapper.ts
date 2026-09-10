import type { Classified, ClassifiedKind, RawRecord } from './coinglass.classify';
import type {
  AssetDerivatives,
  AssetSummary,
  DerivativesSnapshot,
  FundingExtreme,
  LiquidityMap,
  FundingPoint,
  LiquidationBucket,
  LiquidationOrder,
  MacroCard,
  MarketOverview,
  NetFlow,
  PricePoint,
  ScreenerRow,
  Venue,
  VolumeVenue,
  Window,
  WindowValues,
} from '../derivatives.types';

/** One page's worth of identified payloads. `symbol` marks a per-coin page. */
export type HarvestBundle = {
  page: string;
  symbol: string | null;
  classified: Classified[];
};

export type MapperLimits = {
  maxOrders: number;
  maxScreenerRows: number;
  maxSeriesPoints: number;
  /** Grid the heatmap is downsampled to before it leaves the server. */
  maxHeatmapColumns: number;
  maxHeatmapLevels: number;
};

// ------------------------------------------------------------------ coercion

/** CoinGlass mixes numbers and numeric strings in the same field. */
export const num = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const str = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

const iso = (value: unknown): string | null => {
  const millis = num(value);
  if (millis === null) return null;
  // Some endpoints report seconds, others milliseconds.
  const stamp = millis < 1e12 ? millis * 1000 : millis;
  const date = new Date(stamp);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const windows = (row: RawRecord, suffix: string, prefixed: Partial<Record<Window, string>> = {}) => {
  const values: WindowValues = {};
  const direct: [Window, string][] = [
    ['m5', `m5${suffix}`],
    ['m15', `m15${suffix}`],
    ['m30', `m30${suffix}`],
    ['h1', `h1${suffix}`],
    ['h4', `h4${suffix}`],
    ['h12', `h12${suffix}`],
    ['h24', `h24${suffix}`],
  ];
  for (const [window, key] of direct) {
    const value = num(row[key]);
    if (value !== null) values[window] = value;
  }
  for (const [window, key] of Object.entries(prefixed) as [Window, string][]) {
    const value = num(row[key]);
    if (value !== null) values[window] = value;
  }
  return values;
};

// ------------------------------------------------------------------- pickers

const rowsOf = (value: RawRecord | RawRecord[]): RawRecord[] =>
  Array.isArray(value) ? value : [value];

/**
 * The same payload arrives repeatedly as the page re-renders and re-polls.
 * For tables the richest copy wins, for singletons the newest one does — the
 * harvest preserves arrival order, so "newest" is simply the last.
 */
function pick(bundles: HarvestBundle[], kind: ClassifiedKind): RawRecord[] | null {
  let best: RawRecord[] | null = null;
  for (const bundle of bundles) {
    for (const entry of bundle.classified) {
      if (entry.kind !== kind) continue;
      const rows = rowsOf(entry.value);
      if (!best || rows.length > best.length || (rows.length === best.length && !Array.isArray(entry.value))) {
        best = rows;
      }
    }
  }
  return best;
}

const pickOne = (bundles: HarvestBundle[], kind: ClassifiedKind): RawRecord | null =>
  pick(bundles, kind)?.[0] ?? null;

/** Every row of a kind across every page — the same table arrives sliced many ways. */
function collect(bundles: HarvestBundle[], kind: ClassifiedKind): RawRecord[] {
  const rows: RawRecord[] = [];
  for (const bundle of bundles) {
    for (const entry of bundle.classified) {
      if (entry.kind === kind) rows.push(...rowsOf(entry.value));
    }
  }
  return rows;
}

// -------------------------------------------------------------------- venues

export function toVenue(row: RawRecord): Venue | null {
  const exchange = str(row.exName) ?? str(row.exchangeName);
  const openInterestUsd = num(row.openInterest);
  if (!exchange || openInterestUsd === null) return null;

  const depth = row.depth as RawRecord | undefined;
  return {
    exchange,
    logo: str(row.exchangeLogo),
    symbol: str(row.symbol) ?? str(row.instrumentId) ?? exchange,
    instrumentId: str(row.instrumentId),
    perpetual: num(row.type) !== 2,
    openInterestUsd,
    openInterestAmount: num(row.openInterestAmount),
    openInterestChangePercent24h: num(row.h24OiChangePercent),
    volumeUsd24h: num(row.volUsd),
    volumeChangePercent24h: num(row.h24VolUsdChangePercent),
    oiVolumeRatio: num(row.oiVolRadio),
    fundingRate: num(row.fundingRate),
    fundingIntervalHours: num(row.fundingInterval),
    nextFundingAt: iso(row.nextFundingTime),
    longRate: num(row.longRate),
    shortRate: num(row.shortRate),
    longVolumeUsd: num(row.longVolUsd),
    shortVolumeUsd: num(row.shortVolUsd),
    // Swapped deliberately. CoinGlass' venue rows label these the opposite way
    // round from every other endpoint: summed across venues, `h24Long…` matches
    // the coin's *short* total and vice versa, on every asset checked. The
    // aggregate direction is the one corroborated by the screener's own long and
    // short counts, so the venue rows are the outlier and are flipped here.
    longLiquidationUsd24h: num(row.h24ShortLiquidationUsd),
    shortLiquidationUsd24h: num(row.h24LongLiquidationUsd),
    price: num(row.price),
    indexPrice: num(row.indexPrice),
    priceChangePercent24h: num(row.h24PriceChangePercent),
    // The full ladder is megabytes and the app only ever shows the totals.
    bidDepth: depth ? num(depth.bidTotal) : null,
    askDepth: depth ? num(depth.askTotal) : null,
  };
}

// -------------------------------------------------------------- liquidations

export function toLiquidationBucket(row: RawRecord, fallbackName = 'All'): LiquidationBucket {
  return {
    name: str(row.exchangeName) ?? str(row.symbol) ?? fallbackName,
    logo: str(row.exchangeLogo) ?? str(row.symbolLogo),
    totalUsd: num(row.totalVolUsd) ?? 0,
    longUsd: num(row.longVolUsd) ?? 0,
    shortUsd: num(row.shortVolUsd) ?? 0,
    longRate: num(row.longRate),
    shortRate: num(row.shortRate),
    count: num(row.number),
    longCount: num(row.longNumber),
    shortCount: num(row.shortNumber),
    share: num(row.rate),
  };
}

/**
 * `trustSideCounts` exists because the per-coin window payload disagrees with
 * itself: its `longNumber`/`shortNumber` pair is the wrong way round against
 * its own `longVolUsd`/`shortVolUsd`, and against the count fields CoinGlass
 * publishes for the same coin in the screener. The venue payload is
 * consistent, so only the coin one drops them — the counts come from the
 * screener instead (see `liquidationSplit`).
 */
const periodBuckets = (source: RawRecord | null, trustSideCounts = true) => {
  const buckets: Partial<Record<'h1' | 'h4' | 'h12' | 'h24', LiquidationBucket>> = {};
  if (!source) return buckets;
  for (const key of ['h1', 'h4', 'h12', 'h24'] as const) {
    const entry = source[key];
    if (!entry || typeof entry !== 'object') continue;
    const bucket = toLiquidationBucket(entry as RawRecord);
    buckets[key] = trustSideCounts ? bucket : { ...bucket, longCount: null, shortCount: null };
  }
  return buckets;
};

export function toLiquidationOrder(row: RawRecord): LiquidationOrder | null {
  const usd = num(row.volUsd);
  const at = iso(row.createTime) ?? iso(row.turnoverTime);
  if (usd === null || !at) return null;
  const side = num(row.side);
  return {
    exchange: str(row.exchangeName) ?? 'Unknown',
    symbol: str(row.symbol) ?? str(row.originalSymbol) ?? '—',
    instrumentId: str(row.originalSymbol),
    // Confirmed against the aggregate long/short split: 1 is a liquidated long.
    side: side === 1 ? 'long' : side === 2 ? 'short' : null,
    price: num(row.price),
    quantity: num(row.qty) ?? num(row.amount),
    usd,
    at,
  };
}

// ------------------------------------------------------------------- series

const toFundingPoint = (row: RawRecord): FundingPoint | null => {
  const candle = row.data;
  if (!Array.isArray(candle) || candle.length < 5) return null;
  const at = iso(candle[0]);
  const open = num(candle[1]);
  const high = num(candle[2]);
  const low = num(candle[3]);
  const close = num(candle[4]);
  if (!at || open === null || high === null || low === null || close === null) return null;
  const price = Array.isArray(row.price) ? row.price : [];
  return { at, open, high, low, close, priceOpen: num(price[0]), priceClose: num(price[1]) };
};

const toPricePoint = (row: RawRecord): PricePoint | null => {
  const at = iso(row.time);
  const price = num(row.price);
  if (!at || price === null) return null;
  return { at, price, marketCap: num(row.marketCap) };
};

const toNetFlows = (source: RawRecord | null): NetFlow[] => {
  if (!source) return [];
  const flows: NetFlow[] = [];
  for (const [key, value] of Object.entries(source)) {
    if (!/^\d+[mhdy]$/.test(key) || !Array.isArray(value)) continue;
    const inflow = num(value[0]);
    const outflow = num(value[1]);
    const net = num(value[2]);
    if (inflow === null || outflow === null || net === null) continue;
    flows.push({ window: key, inflowUsd: inflow, outflowUsd: outflow, netUsd: net });
  }
  // Shortest window first, so the app can show "now" before "this quarter".
  const rank = (window: string): number => {
    const size = Number.parseInt(window, 10);
    const unit = window.slice(-1);
    const scale = unit === 'm' ? 1 : unit === 'h' ? 60 : unit === 'd' ? 1440 : 525_600;
    return size * scale;
  };
  return flows.sort((a, b) => rank(a.window) - rank(b.window));
};

// ------------------------------------------------------------------- market

/**
 * The home page's coin table. Every row reads `exchangeName: 'All'` — these are
 * coins aggregated across venues, not venues — so the coin has to be recovered
 * from the contract link or the liquidation block hanging off the row.
 */
const toAggregateRow = (row: RawRecord): ScreenerRow | null => {
  const link = (row.kLink ?? null) as RawRecord | null;
  const liquidations = (row.liqInfo ?? null) as RawRecord | null;
  const symbol = str(link?.baseAsset) ?? str(liquidations?.symbol);
  if (!symbol) return null;
  return {
    symbol,
    name: null,
    logo: str(liquidations?.symbolLogo),
    price: num(row.price),
    priceChangePercent24h: num(row.priceChangePercent),
    openInterestUsd: num(row.openInterest),
    openInterestChange: windows(row, 'OIChangePercent', { h24: 'oichangePercent' }),
    volumeUsd24h: num(row.volUsd),
    volumeChangePercent24h: num(row.h24VolChangePercent),
    fundingRateByOpenInterest: num(row.avgFundingRate),
    fundingRateAnnualized: null,
    longShortRatio24h: null,
    liquidationUsd24h: num(liquidations?.totalVolUsd),
    longLiquidationUsd24h: num(liquidations?.longVolUsd),
    shortLiquidationUsd24h: num(liquidations?.shortVolUsd),
    oiMarketCapRatio: null,
    marketCap: null,
  };
};

const toScreenerRow = (row: RawRecord): ScreenerRow | null => {
  const symbol = str(row.symbol);
  if (!symbol) return null;
  return {
    symbol,
    name: str(row.name),
    logo: str(row.symbolLogo),
    price: num(row.price),
    priceChangePercent24h: num(row.h24PriceChangePercent),
    openInterestUsd: num(row.openInterest),
    openInterestChange: windows(row, 'OiChangePercent', {
      d3: 'oiChangePercent3d',
      d7: 'oiChangePercent7d',
      d30: 'oiChangePercent30d',
    }),
    volumeUsd24h: num(row.volUsd),
    volumeChangePercent24h: num(row.h24VolChangePercent),
    fundingRateByOpenInterest: num(row.avgFundingRateByOi),
    fundingRateAnnualized: num(row.avgFundingRateByOiAPR),
    longShortRatio24h: num(row.h24Ls),
    liquidationUsd24h: num(row.h24LiquidationUsd),
    // Swapped deliberately. CoinGlass' venue rows label these the opposite way
    // round from every other endpoint: summed across venues, `h24Long…` matches
    // the coin's *short* total and vice versa, on every asset checked. The
    // aggregate direction is the one corroborated by the screener's own long and
    // short counts, so the venue rows are the outlier and are flipped here.
    longLiquidationUsd24h: num(row.h24ShortLiquidationUsd),
    shortLiquidationUsd24h: num(row.h24LongLiquidationUsd),
    oiMarketCapRatio: num(row.oiMarketCapRadio),
    marketCap: num(row.marketCap),
  };
};

const toFundingExtreme = (row: RawRecord): FundingExtreme | null => {
  const symbol = str(row.symbol);
  const rate = num(row.fundingRate);
  if (!symbol || rate === null) return null;
  return {
    symbol,
    exchange: str(row.exchangeName) ?? 'Unknown',
    instrumentId: str(row.originalSymbol),
    fundingRate: rate,
    predictedRate: num(row.predictedRate),
  };
};

const toMacroCards = (source: RawRecord | null): MacroCard[] => {
  if (!source) return [];
  const cards: MacroCard[] = [];
  for (const [group, entries] of Object.entries(source)) {
    if (!group.startsWith('card') || !Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object') continue;
      const row = entry as RawRecord;
      const key = str(row.key);
      const title = str(row.title);
      if (!key || !title) continue;
      cards.push({
        key,
        title,
        value: num(row.value),
        display: str(row.convertValue),
        change: num(row.changePercent),
        changeIsPercent: !key.includes('BALANCE'),
      });
    }
  }
  return cards;
};

/**
 * The screener arrives in slices — the main table, plus a top-five list per
 * sort the home page offers — so the rows are merged rather than picked. The
 * richest source for a coin wins: a full screener row carries funding, RSI and
 * long/short, where an aggregate row carries only the headline numbers.
 */
function buildScreener(bundles: HarvestBundle[], limits: MapperLimits): ScreenerRow[] {
  const rows = new Map<string, ScreenerRow>();
  for (const row of collect(bundles, 'screener')) {
    const mapped = toScreenerRow(row);
    if (mapped) rows.set(mapped.symbol, mapped);
  }
  for (const row of collect(bundles, 'coin-aggregate')) {
    const mapped = toAggregateRow(row);
    if (mapped && !rows.has(mapped.symbol)) rows.set(mapped.symbol, mapped);
  }
  return [...rows.values()]
    .sort((a, b) => (b.openInterestUsd ?? 0) - (a.openInterestUsd ?? 0))
    .slice(0, limits.maxScreenerRows);
}

/**
 * The venue breakdown carries no window of its own — the page renders whichever
 * one its selector is on. Matching its aggregate row against the window totals
 * recovers the answer instead of hard-coding a guess that a redesign would
 * quietly invalidate.
 */
function matchWindow(
  total: number | null,
  periods: Partial<Record<'h1' | 'h4' | 'h12' | 'h24', LiquidationBucket>>,
): 'h1' | 'h4' | 'h12' | 'h24' | null {
  if (total === null || total <= 0) return null;
  for (const key of ['h1', 'h4', 'h12', 'h24'] as const) {
    const candidate = periods[key]?.totalUsd;
    if (candidate && Math.abs(candidate - total) / total < 0.01) return key;
  }
  return null;
}

export function buildMarketOverview(
  bundles: HarvestBundle[],
  limits: MapperLimits,
): MarketOverview | null {
  const marketBundles = bundles.filter((bundle) => bundle.symbol === null);
  const statistics = pickOne(marketBundles, 'market-statistics');
  const largest = pickOne(marketBundles, 'liquidation-largest');
  const periods = pickOne(marketBundles, 'liquidation-periods');
  const screener = buildScreener(bundles, limits);
  const extremes = pickOne(bundles, 'funding-extremes');

  const exchangeRows = (pick(marketBundles, 'liquidation-exchanges') ?? []).map((row) =>
    toLiquidationBucket(row),
  );
  // The aggregate row rides along in the same array; the app shows it separately.
  const liquidationsByExchange = exchangeRows.filter((bucket) => bucket.name !== 'All');
  const liquidationsByCoin = (pick(marketBundles, 'liquidation-coins') ?? [])
    .map((row) => toLiquidationBucket(row, '—'))
    .sort((a, b) => b.totalUsd - a.totalUsd)
    .slice(0, 20);
  const recentLiquidations = (pick(marketBundles, 'liquidation-orders') ?? [])
    .map(toLiquidationOrder)
    .filter((order): order is LiquidationOrder => order !== null)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, limits.maxOrders);

  const periodMap = periodBuckets(periods);
  const info = largest?.info as RawRecord | undefined;
  const maxOrder = largest?.maxOrder as RawRecord | undefined;

  const macro = toMacroCards(pickOne(marketBundles, 'macro-cards'));
  // Cards alone are thin, but they are real numbers; only an entirely empty
  // harvest means there is no market overview to serve.
  if (!statistics && !screener.length && !liquidationsByExchange.length && !macro.length) {
    return null;
  }

  const liquidationList = Array.isArray(statistics?.liquidationList)
    ? (statistics!.liquidationList as unknown[]).map(num).filter((value): value is number => value !== null)
    : [];

  return {
    openInterestUsd: num(statistics?.openInterest),
    openInterestChangePercent24h: num(statistics?.openInterestChange),
    liquidationUsd24h: num(statistics?.liquidation24h) ?? num(info?.totalVolUsd),
    liquidationChangePercent24h: num(statistics?.liquidation24hChange),
    liquidationSeries: liquidationList,
    averageRsi: num(statistics?.avgRsi),
    liquidations: periodMap,
    liquidationsByExchange,
    liquidationsByExchangeWindow: matchWindow(
      exchangeRows.find((bucket) => bucket.name === 'All')?.totalUsd ?? null,
      periodMap,
    ),
    liquidationsByCoin,
    largestLiquidation: maxOrder ? toLiquidationOrder(maxOrder) : null,
    recentLiquidations,
    tradersLiquidated24h: num(info?.number),
    screener,
    fundingHighest: Array.isArray(extremes?.frMax)
      ? (extremes!.frMax as RawRecord[]).map(toFundingExtreme).filter((entry): entry is FundingExtreme => entry !== null)
      : [],
    fundingLowest: Array.isArray(extremes?.frMin)
      ? (extremes!.frMin as RawRecord[]).map(toFundingExtreme).filter((entry): entry is FundingExtreme => entry !== null)
      : [],
    macro,
  };
}

// ------------------------------------------------------------- liquidity map

/**
 * Fold CoinGlass' heatmap into a grid a phone can draw.
 *
 * The raw map is ~15,000 cells across 288 five-minute columns and 132 price
 * levels. Nothing on a phone screen resolves that, and shipping it would cost
 * a third of a megabyte per read, so neighbouring squares are summed into a
 * coarser grid. Summing (rather than sampling) is what keeps the total dollar
 * figure honest: every cell in a group still counts towards the group.
 */
export function toLiquidityMap(
  raw: RawRecord,
  options: { symbol: string; limits: MapperLimits; capturedAt: string },
): LiquidityMap | null {
  const rawCells = Array.isArray(raw.liq) ? (raw.liq as unknown[]) : [];
  const rawLevels = (Array.isArray(raw.y) ? (raw.y as unknown[]) : []).map(num);
  const rawColumns = Array.isArray(raw.prices) ? (raw.prices as unknown[]) : [];
  if (!rawCells.length || !rawLevels.length || !rawColumns.length) return null;

  const candles = rawColumns.flatMap((entry) => {
    if (!Array.isArray(entry) || entry.length < 5) return [];
    const at = iso(entry[0]);
    const [open, high, low, close] = [num(entry[1]), num(entry[2]), num(entry[3]), num(entry[4])];
    if (!at || open === null || high === null || low === null || close === null) return [];
    return [{ at, open, high, low, close }];
  });
  if (!candles.length) return null;

  const columnGroup = Math.max(1, Math.ceil(candles.length / options.limits.maxHeatmapColumns));
  const levelGroup = Math.max(1, Math.ceil(rawLevels.length / options.limits.maxHeatmapLevels));

  // A group's price is its midpoint, and its time is when the group opens.
  const levels: number[] = [];
  for (let index = 0; index < rawLevels.length; index += levelGroup) {
    const group = rawLevels.slice(index, index + levelGroup).filter((value): value is number => value !== null);
    if (group.length) levels.push(group.reduce((total, value) => total + value, 0) / group.length);
  }

  // Candles collapse onto the same grid: one per column, so the price line and
  // the heatmap share an x-axis and the payload does not carry 288 rows the
  // chart could not draw separately anyway.
  const grouped: LiquidityMap['candles'] = [];
  for (let index = 0; index < candles.length; index += columnGroup) {
    const group = candles.slice(index, index + columnGroup);
    grouped.push({
      at: group[0].at,
      open: group[0].open,
      high: Math.max(...group.map((candle) => candle.high)),
      low: Math.min(...group.map((candle) => candle.low)),
      close: group[group.length - 1].close,
    });
  }
  const columns = grouped.map((candle) => candle.at);

  const grid = new Map<string, number>();
  const profileByLevel = new Map<number, number>();
  for (const entry of rawCells) {
    if (!Array.isArray(entry) || entry.length < 3) continue;
    const column = num(entry[0]);
    const level = num(entry[1]);
    const usd = num(entry[2]);
    if (column === null || level === null || usd === null) continue;

    const x = Math.floor(column / columnGroup);
    const y = Math.floor(level / levelGroup);
    if (x >= columns.length || y >= levels.length) continue;
    grid.set(`${x}:${y}`, (grid.get(`${x}:${y}`) ?? 0) + usd);
    // The profile keeps full price resolution: it is cheap and it is the view
    // that answers "where would a move find fuel".
    profileByLevel.set(level, (profileByLevel.get(level) ?? 0) + usd);
  }
  if (!grid.size) return null;

  const cells: [number, number, number][] = [...grid.entries()].map(([key, usd]) => {
    const [x, y] = key.split(':');
    return [Number(x), Number(y), Math.round(usd)];
  });

  const profile = [...profileByLevel.entries()]
    .flatMap(([level, usd]) => {
      const price = rawLevels[level];
      return price === null || price === undefined ? [] : [{ price, usd: Math.round(usd) }];
    })
    .sort((a, b) => a.price - b.price);

  const instrument = (raw.instrument ?? null) as RawRecord | null;
  return {
    symbol: options.symbol,
    exchange: str(instrument?.exName),
    instrumentId: str(instrument?.instrumentId),
    updatedAt: iso(raw.updateTime) ?? options.capturedAt,
    capturedAt: options.capturedAt,
    levels,
    columns,
    cells,
    candles: grouped,
    profile,
    // CoinGlass' own `rangeLow`/`rangeHigh` describe its chart viewport, which
    // is wider than the grid it actually fills — reporting those would claim
    // the map covers prices it holds nothing for. The levels are the truth.
    rangeLow: levels[0],
    rangeHigh: levels[levels.length - 1],
    maxCell: cells.reduce((highest, cell) => Math.max(highest, cell[2]), 0),
    price: grouped.at(-1)?.close ?? null,
  };
}

// -------------------------------------------------------------------- assets

function buildSummary(
  symbol: string,
  info: RawRecord | null,
  derivatives: RawRecord | null,
  screener: RawRecord | null,
  venues: Venue[],
): AssetSummary {
  const openInterestUsd =
    num(derivatives?.futuresOiUsd) ?? num(screener?.openInterest) ?? num(info?.openInterest);
  const volumeUsd24h =
    num(derivatives?.futuresVolUsd) ?? num(screener?.volUsd) ?? num(info?.futuresVolUsd);
  const binance = (derivatives?.binanceLSInfo ?? null) as RawRecord | null;
  const okx = (derivatives?.okxLSInfo ?? null) as RawRecord | null;
  const marketCap = num(info?.marketCap) ?? num(screener?.marketCap);

  const rsi: AssetSummary['rsi'] = {};
  const rsiKeys: [keyof AssetSummary['rsi'], string][] = [
    ['m15', 'rsi15m'],
    ['h1', 'rsi1h'],
    ['h4', 'rsi4h'],
    ['h12', 'rsi12h'],
    ['d1', 'rsi1d'],
    ['w1', 'rsi1w'],
  ];
  for (const [key, field] of rsiKeys) {
    const value = num(screener?.[field]);
    if (value !== null) rsi[key] = value;
  }

  // CoinGlass publishes its own contract total; the venue rows are a fallback
  // and undercount, since not every venue reports a size in the base asset.
  const openInterestAmount =
    num(screener?.openInterestAmount) ??
    (venues.length
      ? venues.reduce((total, venue) => total + (venue.openInterestAmount ?? 0), 0)
      : null);

  return {
    symbol,
    name: str(info?.name) ?? str(derivatives?.name) ?? str(screener?.name),
    logo: str(info?.logo) ?? str(derivatives?.logo) ?? str(screener?.symbolLogo),
    price: num(info?.price) ?? num(derivatives?.price) ?? num(screener?.price),
    priceChangePercent24h:
      num(info?.priceChangePercent24h) ??
      num(derivatives?.priceChangePercent) ??
      num(screener?.h24PriceChangePercent),
    priceChangePercent7d: num(info?.priceChangePercent7d) ?? num(screener?.d7PriceChangePercent),
    marketCap,
    circulatingSupply: num(info?.circulatingSupply),

    openInterestUsd,
    openInterestAmount,
    openInterestChange: screener
      ? windows(screener, 'OiChangePercent', {
          d3: 'oiChangePercent3d',
          d7: 'oiChangePercent7d',
          d30: 'oiChangePercent30d',
        })
      : num(derivatives?.futuresOiChangePercent) !== null
        ? { h24: num(derivatives?.futuresOiChangePercent) as number }
        : {},
    openInterestChangeUsd: screener
      ? windows(screener, 'OiChange', { d3: 'oiChange3d', d7: 'oiChange7d', d30: 'oiChange30d' })
      : {},
    volumeUsd24h,
    volumeChange: screener
      ? windows(screener, 'VolChangePercent')
      : num(derivatives?.futuresVolUsdChangePercent) !== null
        ? { h24: num(derivatives?.futuresVolUsdChangePercent) as number }
        : {},
    spotVolumeUsd24h: num(info?.volUsd),
    oiVolumeRatio: num(screener?.oiVolRadio),
    oiMarketCapRatio: num(screener?.oiMarketCapRadio),

    optionsOpenInterestUsd: num(derivatives?.optionOiUsd),
    optionsOpenInterestChangePercent24h: num(derivatives?.optionOiUsdChangePercent),
    optionsVolumeUsd24h: num(derivatives?.optionVolUsd),
    optionsVolumeChangePercent24h: num(derivatives?.optionVolUsdChangePercent),

    fundingRateByOpenInterest: num(screener?.avgFundingRateByOi),
    fundingRateByVolume: num(screener?.avgFundingRateByVol),
    fundingRateBySymbol: num(screener?.avgFundingRateBySymbol),
    fundingRateAnnualized: num(screener?.avgFundingRateByOiAPR),

    longShortRatio: screener
      ? windows(screener, 'Ls')
      : num(derivatives?.ls) !== null
        ? { h24: num(derivatives?.ls) as number }
        : {},
    globalAccountRatio: num(binance?.globalA),
    topAccountRatio: num(binance?.topA),
    topPositionRatio: num(binance?.topP),
    okxGlobalAccountRatio: num(okx?.globalA),

    rsi,
    liquidationUsd24h: num(info?.liquidationUsd24h) ?? num(screener?.h24LiquidationUsd),
    liquidationCount24h: num(info?.liquidationNumber24h),
  };
}

const liquidationSplit = (screener: RawRecord | null) => {
  const split: AssetDerivatives['liquidationSplit'] = {};
  if (!screener) return split;
  // Dollars are keyed `h24LongLiquidationUsd`, counts `longLiquidationNumber24h`.
  const suffix = { h1: '1h', h4: '4h', h12: '12h', h24: '24h' } as const;
  for (const key of ['h1', 'h4', 'h12', 'h24'] as const) {
    const longUsd = num(screener[`${key}LongLiquidationUsd`]);
    const shortUsd = num(screener[`${key}ShortLiquidationUsd`]);
    if (longUsd === null && shortUsd === null) continue;
    split[key] = {
      longUsd: longUsd ?? 0,
      shortUsd: shortUsd ?? 0,
      longCount: num(screener[`longLiquidationNumber${suffix[key]}`]),
      shortCount: num(screener[`shortLiquidationNumber${suffix[key]}`]),
    };
  }
  return split;
};

const toVolumeVenues = (value: unknown): VolumeVenue[] => {
  if (!Array.isArray(value)) return [];
  return value
    .flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return [];
      const row = entry as RawRecord;
      const exchange = str(row.exchangeName);
      const volume = num(row.volUsd);
      if (!exchange || volume === null) return [];
      return [{ exchange, volumeUsd24h: volume, volumeChangePercent24h: num(row.volChangePercent24h) }];
    })
    .sort((a, b) => b.volumeUsd24h - a.volumeUsd24h);
};

export function buildAsset(
  symbol: string,
  bundles: HarvestBundle[],
  limits: MapperLimits,
  observedAt: string,
): AssetDerivatives | null {
  const own = bundles.filter((bundle) => bundle.symbol === symbol);
  if (!own.length) return null;

  const venues = (pick(own, 'coin-venues') ?? [])
    .map(toVenue)
    .filter((venue): venue is Venue => venue !== null)
    .sort((a, b) => b.openInterestUsd - a.openInterestUsd);

  // The screener row for this coin lives on a market page, and the home page
  // slices that table several ways — so look through every copy, not just one.
  const screener =
    collect(bundles, 'screener').find((row) => str(row.symbol) === symbol) ?? null;

  const info = pickOne(own, 'coin-info');
  const derivatives = pickOne(own, 'coin-derivatives');
  if (!info && !derivatives && !venues.length && !screener) return null;

  const volumes = pickOne(own, 'volume-by-exchange');
  const fundingHistory = (pick(own, 'funding-history') ?? [])
    .map(toFundingPoint)
    .filter((point): point is FundingPoint => point !== null)
    .slice(-limits.maxSeriesPoints);
  const priceHistory = (pick(own, 'price-history') ?? [])
    .map(toPricePoint)
    .filter((point): point is PricePoint => point !== null)
    .slice(-limits.maxSeriesPoints);

  return {
    summary: buildSummary(symbol, info, derivatives, screener, venues),
    venues,
    liquidations: periodBuckets(pickOne(own, 'liquidation-periods'), false),
    liquidationSplit: liquidationSplit(screener),
    fundingHistory,
    priceHistory,
    spotVolumeByExchange: toVolumeVenues(volumes?.spots),
    futuresVolumeByExchange: toVolumeVenues(volumes?.futures),
    netFlows: toNetFlows(pickOne(own, 'net-flows')),
    updatedAt: observedAt,
  };
}

/** Fold every harvested page into the snapshot the API serves. */
export function buildSnapshot(
  bundles: HarvestBundle[],
  options: { assets: string[]; limits: MapperLimits; capturedAt: string; durationMs: number; pages: DerivativesSnapshot['pages'] },
): DerivativesSnapshot {
  const assets = options.assets
    .map((symbol) => buildAsset(symbol, bundles, options.limits, options.capturedAt))
    .filter((asset): asset is AssetDerivatives => asset !== null);

  // Heatmaps come from their own page, so they are keyed by that page's symbol
  // rather than by the tracked-asset list.
  const liquidityMaps = bundles
    .filter((bundle) => bundle.symbol !== null && bundle.page.startsWith('heatmap:'))
    .flatMap((bundle) => {
      const raw = pickOne([bundle], 'liquidity-map');
      if (!raw) return [];
      const map = toLiquidityMap(raw, {
        symbol: bundle.symbol as string,
        limits: options.limits,
        capturedAt: options.capturedAt,
      });
      return map ? [map] : [];
    });

  return {
    capturedAt: options.capturedAt,
    source: 'coinglass-scrape',
    durationMs: options.durationMs,
    market: buildMarketOverview(bundles, options.limits),
    assets,
    liquidityMaps,
    pages: options.pages,
  };
}
