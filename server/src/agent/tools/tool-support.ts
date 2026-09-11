import { referenceId } from '../citations/citation.service';
import type { AgentReference } from '../citations/reference.types';

/** Helpers shared by the application tools. */

/**
 * A reference to a number this application computed.
 *
 * Market answers cite their own data, not just the web. "As of 12:04, open
 * interest was $38.2B" should be traceable to the snapshot it came from, and
 * this is what makes that clickable.
 */
export function marketReference(params: {
  title: string;
  symbol: string | null;
  surface: string;
  capturedAt: string | null;
  detail?: Record<string, unknown>;
}): AgentReference {
  const key = `${params.surface}|${params.symbol ?? 'market'}|${params.capturedAt ?? 'live'}`;
  return {
    id: referenceId('market_data', key),
    type: 'market_data',
    title: params.title,
    source: 'MarketPulse',
    publishedAt: params.capturedAt,
    entityId: params.symbol,
    metadata: { surface: params.surface, ...params.detail },
  };
}

export function chartReference(params: {
  title: string;
  symbol: string | null;
  chartId: string | null;
  capturedAt: string | null;
}): AgentReference {
  return {
    id: referenceId('chart', `${params.chartId ?? 'active'}|${params.symbol ?? 'none'}`),
    type: 'chart',
    title: params.title,
    source: 'MarketPulse chart',
    publishedAt: params.capturedAt,
    entityId: params.chartId,
  };
}

export function appReference(params: {
  title: string;
  entityId: string;
  surface: string;
}): AgentReference {
  return {
    id: referenceId('application_entity', `${params.surface}|${params.entityId}`),
    type: 'application_entity',
    title: params.title,
    source: 'MarketPulse',
    entityId: params.entityId,
    metadata: { surface: params.surface },
  };
}

/** Round to a sensible number of significant digits before it reaches a model. */
export function trim(value: number | null | undefined, digits = 4): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Number(value.toPrecision(digits));
}

/** Drop nulls so a tool result stays small and unambiguous. */
export function compact<T extends Record<string, unknown>>(input: T): Partial<T> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === null || value === undefined) continue;
    output[key] = value;
  }
  return output as Partial<T>;
}

/**
 * Text from outside the application, wrapped so a model reads it as material
 * rather than as instructions.
 *
 * An article, a search snippet or a news body can contain "ignore your previous
 * instructions". Wrapping is not a complete defence — nothing is — but it is
 * the part that belongs at the data boundary, and it pairs with the standing
 * instruction in every agent's prompt that content inside these markers is
 * never a command.
 */
export function untrusted(label: string, body: string): string {
  return [
    `<untrusted source="${label.replace(/[<>"]/g, '')}">`,
    body,
    '</untrusted>',
  ].join('\n');
}
