import type { CalendarEvent } from '@/data/calendar';

export type ParsedValue = { value: number; unit: string };

/**
 * Parse a ForexFactory cell into a number plus its unit.
 *
 * The cells are free text and carry more shapes than they first appear to:
 * `2.8%`, `229K`, `770B`, `-0.4%`, `$1.2M`, and composites like `3.26|1.1`
 * from bond auctions. Anything that is not a single scalar returns null rather
 * than being coerced, so the chart never invents a comparison.
 */
export function parseValue(raw: string | null | undefined): ParsedValue | null {
  if (!raw) return null;
  const text = raw.trim();
  // Bond auctions pack two figures into one cell; they are not one quantity.
  if (text.includes('|') || text.includes('/')) return null;

  const match = text.replace(/,/g, '').match(/^([<>~]?)\s*(-?\d+(?:\.\d+)?)\s*([KMBT])?\s*(%)?$/i);
  if (!match) return null;

  const [, , digits, magnitude, percent] = match;
  const scale = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 }[(magnitude ?? '').toUpperCase()] ?? 1;
  return {
    value: Number.parseFloat(digits) * scale,
    // Unit identity, so we never plot a percentage against a headcount.
    unit: percent ? '%' : (magnitude ?? '').toUpperCase() || 'n',
  };
}

export type ComparisonBar = { label: string; raw: string; value: number; kind: 'previous' | 'forecast' | 'actual' };

/**
 * Build the previous/forecast/actual series, but only when the values are
 * actually comparable: at least two of them, all sharing one unit.
 */
export function buildComparison(event: CalendarEvent): ComparisonBar[] | null {
  const candidates: { label: string; raw: string | null; kind: ComparisonBar['kind'] }[] = [
    { label: 'Previous', raw: event.previous, kind: 'previous' },
    { label: 'Forecast', raw: event.forecast, kind: 'forecast' },
    { label: 'Actual', raw: event.actual, kind: 'actual' },
  ];

  const bars: ComparisonBar[] = [];
  const units = new Set<string>();
  for (const candidate of candidates) {
    const parsed = parseValue(candidate.raw);
    if (!parsed || candidate.raw === null) continue;
    units.add(parsed.unit);
    bars.push({ label: candidate.label, raw: candidate.raw, value: parsed.value, kind: candidate.kind });
  }

  if (bars.length < 2 || units.size !== 1) return null;
  return bars;
}

/** How far the print landed from its forecast, in the event's own units. */
export function surprise(event: CalendarEvent): { text: string; beat: boolean } | null {
  const actual = parseValue(event.actual);
  const forecast = parseValue(event.forecast);
  if (!actual || !forecast || actual.unit !== forecast.unit) return null;

  const delta = actual.value - forecast.value;
  if (delta === 0) return { text: 'In line with forecast', beat: false };

  // Round to the precision the source itself published.
  const decimals = (event.forecast?.split('.')[1]?.replace(/[^\d]/g, '').length ?? 0);
  const magnitude = Math.abs(delta).toFixed(Math.min(decimals, 4));
  const unit = actual.unit === '%' ? 'pp' : '';
  return {
    text: `${delta > 0 ? '+' : '−'}${magnitude}${unit ? ` ${unit}` : ''} vs forecast`,
    beat: delta > 0,
  };
}
