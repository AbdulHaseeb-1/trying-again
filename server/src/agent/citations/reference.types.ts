/**
 * One citation model for every kind of source.
 *
 * News citations and web citations were the obvious candidates to become two
 * unrelated systems — one keyed by an internal id, one by a URL — so both are
 * expressed as an `AgentReference` from the moment a tool returns them, and the
 * UI renders them through one component.
 *
 * A reference is created **only** by the tool layer, from data a provider
 * actually returned. The model never mints one: it cites by index, and an index
 * that does not resolve to a stored reference is dropped rather than rendered
 * (see `CitationService.sanitize`).
 */

export const REFERENCE_TYPES = [
  'news',
  'web',
  'market_data',
  'chart',
  'document',
  'application_entity',
] as const;

export type AgentReferenceType = (typeof REFERENCE_TYPES)[number];

export type AgentReference = {
  /** Stable within a conversation; derived from type + identity, never random. */
  id: string;
  type: AgentReferenceType;
  title: string;
  url?: string | null;
  /** Publisher, venue, or the application surface the value came from. */
  source?: string | null;
  publishedAt?: string | null;
  /** Internal id when the reference points at something we store (a news item). */
  entityId?: string | null;
  snippet?: string | null;
  metadata?: Record<string, unknown>;
};

/** A reference as it is attached to one message, with its display number. */
export type AgentMessageReference = AgentReference & { citationIndex: number };
