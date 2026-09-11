import type { NewsImportance, NewsItem, NewsSentiment } from '../news.types';
import { NEWS_IMPORTANCE, NEWS_SENTIMENT } from '../news.types';
import { newsId } from './news-id';

/**
 * Everything a provider may produce, turned into exactly one `NewsItem`.
 *
 * Providers hand over loose, partly-typed records; this is the only place a
 * `NewsItem` is constructed, so every stored story has a real id, a real
 * timestamp and a bounded body no matter how eccentric the upstream feed was.
 */
export type RawNewsItem = {
  provider: string;
  providerItemId: string;
  title: unknown;
  summary?: unknown;
  body?: unknown;
  source: string;
  sourceUrl?: unknown;
  canonicalUrl?: unknown;
  publishedAt?: unknown;
  symbols?: unknown;
  categories?: unknown;
  importance?: unknown;
  sentiment?: unknown;
  metadata?: Record<string, unknown>;
};

const MAX_BODY = 12_000;
const MAX_SUMMARY = 600;

const ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&#39;': "'",
};

function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  // Feed summaries routinely arrive as HTML fragments.
  const stripped = value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, (entity) => ENTITIES[entity.toLowerCase()] ?? ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!stripped) return null;
  return stripped.length > max ? `${stripped.slice(0, max - 1)}…` : stripped;
}

function stringList(value: unknown, upper = true): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const cleaned = entry.trim();
    if (!cleaned) continue;
    seen.add(upper ? cleaned.toUpperCase() : cleaned);
  }
  return [...seen];
}

function timestamp(value: unknown, fallback: Date): string {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value > 1e12 ? value : value * 1000).toISOString();
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  return fallback.toISOString();
}

function importanceOf(value: unknown): NewsImportance {
  return typeof value === 'string' && (NEWS_IMPORTANCE as readonly string[]).includes(value)
    ? (value as NewsImportance)
    : 'medium';
}

function sentimentOf(value: unknown): NewsSentiment | null {
  return typeof value === 'string' && (NEWS_SENTIMENT as readonly string[]).includes(value)
    ? (value as NewsSentiment)
    : null;
}

function urlOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function normalizeNewsItem(raw: RawNewsItem, now = new Date()): NewsItem | null {
  const title = text(raw.title, 300);
  if (!title) return null;

  const sourceUrl = urlOrNull(raw.sourceUrl);
  return {
    id: newsId(raw.provider, raw.providerItemId),
    title,
    summary: text(raw.summary, MAX_SUMMARY),
    body: text(raw.body, MAX_BODY),
    source: raw.source,
    sourceUrl,
    canonicalUrl: urlOrNull(raw.canonicalUrl) ?? sourceUrl,
    publishedAt: timestamp(raw.publishedAt, now),
    receivedAt: now.toISOString(),
    symbols: stringList(raw.symbols),
    categories: stringList(raw.categories, false),
    importance: importanceOf(raw.importance),
    sentiment: sentimentOf(raw.sentiment),
    provider: raw.provider,
    providerItemId: raw.providerItemId,
    metadata: raw.metadata ?? {},
  };
}
