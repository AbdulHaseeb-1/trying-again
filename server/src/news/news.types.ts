/**
 * The canonical shape of a news item — the thing agents cite.
 *
 * The rule this exists to enforce: a story is never flattened into anonymous
 * text before an agent sees it. It arrives with an identity, a publisher, a
 * timestamp and the symbols it touches, and it keeps them all the way through
 * the answer, so "[2] Reuters" in a reply can still be opened.
 */

export const NEWS_IMPORTANCE = ['low', 'medium', 'high', 'critical'] as const;
export type NewsImportance = (typeof NEWS_IMPORTANCE)[number];

export const NEWS_SENTIMENT = ['bullish', 'bearish', 'neutral'] as const;
export type NewsSentiment = (typeof NEWS_SENTIMENT)[number];

export type NewsItem = {
  /** Internal and stable: `news_<hash>`. Derived from provider identity. */
  id: string;
  title: string;
  summary: string | null;
  /**
   * Extracted article text where we have it. Untrusted: it is quoted to a model
   * as data, never spliced into instructions.
   */
  body: string | null;
  /** Publisher name as a human reads it: "Reuters", "MarketPulse Calendar". */
  source: string;
  sourceUrl: string | null;
  canonicalUrl: string | null;
  publishedAt: string;
  receivedAt: string;
  symbols: string[];
  categories: string[];
  importance: NewsImportance;
  sentiment: NewsSentiment | null;
  /** Which adapter produced it. */
  provider: string;
  providerItemId: string | null;
  metadata: Record<string, unknown>;
};

export type NewsQuery = {
  /** Free text over title and summary. */
  q?: string;
  symbols?: string[];
  categories?: string[];
  minImportance?: NewsImportance;
  from?: string;
  to?: string;
  providers?: string[];
  limit?: number;
  cursor?: string;
};

export type NewsPage = {
  items: NewsItem[];
  /** Opaque; pass back as `cursor` for the next page. */
  nextCursor: string | null;
  total: number;
};

export const importanceRank = (importance: NewsImportance): number =>
  NEWS_IMPORTANCE.indexOf(importance);
