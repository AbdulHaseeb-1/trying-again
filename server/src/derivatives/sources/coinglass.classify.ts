/**
 * Naming the payloads.
 *
 * The harvest hook sees decoded JSON but not the request that produced it, so
 * each payload is identified by its shape. That turns out to be the more
 * durable key anyway: CoinGlass renames and re-versions endpoints (`/api/home`
 * → `/api/home/v2`, `/api/futures/v2/coins/markets`) far more often than it
 * changes the field names inside a row, and a shape test degrades gracefully —
 * an unrecognised payload is skipped, not mis-parsed.
 */

export type RawRecord = Record<string, unknown>;

export type ClassifiedKind =
  | 'coin-info'
  | 'coin-derivatives'
  | 'coin-venues'
  | 'funding-history'
  | 'price-history'
  | 'liquidation-periods'
  | 'liquidation-exchanges'
  | 'liquidation-coins'
  | 'liquidation-orders'
  | 'liquidation-largest'
  | 'market-statistics'
  | 'coin-aggregate'
  | 'screener'
  | 'funding-extremes'
  | 'macro-cards'
  | 'volume-by-exchange'
  | 'net-flows'
  | 'coin-prices'
  | 'liquidity-map';

export type Classified = { kind: ClassifiedKind; value: RawRecord | RawRecord[] };

const isRecord = (value: unknown): value is RawRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const has = (value: RawRecord, ...keys: string[]): boolean => keys.every((key) => key in value);

const firstRow = (value: unknown): RawRecord | null => {
  if (!Array.isArray(value) || value.length === 0) return null;
  return isRecord(value[0]) ? value[0] : null;
};

/** `{ list: [...] }` pagination wrappers show up on half the endpoints. */
const listRows = (value: unknown): RawRecord[] | null => {
  if (Array.isArray(value)) return value.every(isRecord) ? (value as RawRecord[]) : null;
  if (isRecord(value) && Array.isArray(value.list)) {
    const rows = value.list;
    return rows.every(isRecord) ? (rows as RawRecord[]) : null;
  }
  return null;
};

const PERIOD_KEYS = ['h1', 'h4', 'h12', 'h24'] as const;

const isPeriodMap = (value: unknown): boolean =>
  isRecord(value) &&
  PERIOD_KEYS.some((key) => isRecord(value[key]) && has(value[key] as RawRecord, 'totalVolUsd', 'longVolUsd'));

/** Identify one decoded payload, or return null if it is not something we model. */
export function classify(value: unknown): Classified | null {
  // Next.js hands the coin page's server-rendered props over the same funnel.
  if (isRecord(value) && isRecord(value.props)) {
    const pageProps = (value.props as RawRecord).pageProps;
    if (isRecord(pageProps) && isRecord(pageProps.coinInfo)) {
      return { kind: 'coin-info', value: pageProps.coinInfo };
    }
  }

  if (isRecord(value)) {
    // Some endpoints are read straight off the envelope's decoded `data`.
    const unwrapped = 'code' in value && isRecord(value.data) ? (value.data as RawRecord) : value;

    // The heatmap: a sparse grid, its price axis, and the candles under it.
    if (Array.isArray(unwrapped.liq) && Array.isArray(unwrapped.y) && Array.isArray(unwrapped.prices)) {
      return { kind: 'liquidity-map', value: unwrapped };
    }

    if (has(unwrapped, 'symbol', 'openInterest', 'futuresVolUsd', 'marketCap')) {
      return { kind: 'coin-info', value: unwrapped };
    }
    if (has(unwrapped, 'futuresOiUsd', 'optionOiUsd', 'symbol')) {
      return { kind: 'coin-derivatives', value: unwrapped };
    }
    if (has(unwrapped, 'openInterest', 'liquidation24h', 'liquidationList')) {
      return { kind: 'market-statistics', value: unwrapped };
    }
    if (has(unwrapped, 'maxOrder', 'info')) {
      return { kind: 'liquidation-largest', value: unwrapped };
    }
    if (has(unwrapped, 'frMin', 'frMax')) {
      return { kind: 'funding-extremes', value: unwrapped };
    }
    if (has(unwrapped, 'card1')) {
      return { kind: 'macro-cards', value: unwrapped };
    }
    if (has(unwrapped, 'spots', 'futures') && Array.isArray(unwrapped.spots)) {
      return { kind: 'volume-by-exchange', value: unwrapped };
    }
    if (isPeriodMap(unwrapped)) {
      return { kind: 'liquidation-periods', value: unwrapped };
    }
    // Net flow: a symbol plus one entry per window, each a tuple of strings.
    if (
      typeof unwrapped.symbol === 'string' &&
      Object.entries(unwrapped).some(
        ([key, entry]) => /^\d+[mhdy]$/.test(key) && Array.isArray(entry) && entry.length >= 3,
      )
    ) {
      return { kind: 'net-flows', value: unwrapped };
    }
  }

  const rows = listRows(value);
  const row = rows?.[0] ?? firstRow(value);
  if (!rows || !row) return null;

  if (has(row, 'exName', 'instrumentId', 'openInterest')) {
    return { kind: 'coin-venues', value: rows };
  }
  // Rows carry `exchangeName: 'All'` — the coin is named inside `kLink`.
  if (has(row, 'exchangeName', 'avgFundingRate', 'openInterest')) {
    return { kind: 'coin-aggregate', value: rows };
  }
  if (has(row, 'symbol', 'avgFundingRateByOi', 'openInterest')) {
    return { kind: 'screener', value: rows };
  }
  if (has(row, 'exchangeName', 'totalVolUsd', 'longVolUsd')) {
    return { kind: 'liquidation-exchanges', value: rows };
  }
  if (has(row, 'symbol', 'totalVolUsd', 'longVolUsd')) {
    return { kind: 'liquidation-coins', value: rows };
  }
  if (has(row, 'exchangeName', 'volUsd', 'createTime') && ('qty' in row || 'price' in row)) {
    return { kind: 'liquidation-orders', value: rows };
  }
  if (has(row, 'data', 'price') && Array.isArray(row.data)) {
    return { kind: 'funding-history', value: rows };
  }
  if (has(row, 'time', 'price') && ('marketCap' in row)) {
    return { kind: 'price-history', value: rows };
  }
  if (has(row, 'symbol', 'price', 'priceChangePercent24h') && !('openInterest' in row)) {
    return { kind: 'coin-prices', value: rows };
  }

  return null;
}
