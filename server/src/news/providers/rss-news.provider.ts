import { Injectable, Logger } from '@nestjs/common';
import { XMLParser } from 'fast-xml-parser';

import { fallbackItemKey } from '../normalization/news-id';
import type { RawNewsItem } from '../normalization/news.normalize';
import type { NewsProvider } from './news-provider';

type Feed = { name: string; url: string; categories: string[] };

/**
 * External wire copy, over RSS and Atom.
 *
 * RSS is the one syndication format essentially every publisher still serves,
 * needs no key, and carries exactly the fields a citation needs: a title, a
 * link, a timestamp and a publisher. That makes it the right default external
 * source — and the feed list is configuration, so an operator can point it at
 * whatever they actually read.
 *
 * Set `NEWS_RSS_FEEDS` to a comma-separated `Name|https://url` list to replace
 * the defaults, or to an empty string to turn external news off entirely.
 */
@Injectable()
export class RssNewsProvider implements NewsProvider {
  readonly id = 'rss';
  readonly name = 'RSS';

  private readonly logger = new Logger(RssNewsProvider.name);
  private readonly parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@',
    trimValues: true,
  });
  private readonly feeds: Feed[];
  private readonly timeoutMs: number;

  constructor() {
    this.feeds = parseFeeds(process.env.NEWS_RSS_FEEDS);
    this.timeoutMs = Number.parseInt(process.env.NEWS_RSS_TIMEOUT_MS ?? '', 10) || 20_000;
  }

  isConfigured(): boolean {
    return this.feeds.length > 0;
  }

  async poll(signal?: AbortSignal): Promise<RawNewsItem[]> {
    const batches = await Promise.all(
      this.feeds.map((feed) =>
        this.pollFeed(feed, signal).catch((error) => {
          // One dead feed must not take the others with it.
          this.logger.warn(`feed "${feed.name}" failed: ${String(error)}`);
          return [] as RawNewsItem[];
        }),
      ),
    );
    return batches.flat();
  }

  private async pollFeed(feed: Feed, signal?: AbortSignal): Promise<RawNewsItem[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('timeout')), this.timeoutMs);
    const onAbort = () => controller.abort(signal?.reason);
    signal?.addEventListener('abort', onAbort, { once: true });

    try {
      const response = await fetch(feed.url, {
        signal: controller.signal,
        headers: {
          accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml',
          'user-agent': 'MarketPulse/1.0 (news aggregator)',
        },
      });
      if (!response.ok) throw new Error(`responded ${response.status}`);
      const xml = await response.text();
      return this.parse(feed, xml);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }

  private parse(feed: Feed, xml: string): RawNewsItem[] {
    const document = this.parser.parse(xml) as Record<string, unknown>;

    const rssItems = pick(document, ['rss', 'channel', 'item']);
    const atomEntries = pick(document, ['feed', 'entry']);
    const rows = asArray(rssItems ?? atomEntries);

    return rows.flatMap((row) => {
      const entry = row as Record<string, unknown>;
      const link = readLink(entry);
      const title = readText(entry.title);
      if (!title) return [];

      const published =
        readText(entry.pubDate) ??
        readText(entry.published) ??
        readText(entry.updated) ??
        readText((entry as Record<string, unknown>)['dc:date']);

      const summary =
        readText(entry.description) ??
        readText(entry.summary) ??
        readText((entry as Record<string, unknown>)['content:encoded']) ??
        readText(entry.content);

      return [
        {
          provider: this.id,
          // Prefer the feed's own guid; fall back to the link, then the title.
          providerItemId: fallbackItemKey([
            feed.name,
            readText(entry.guid) ?? readText(entry.id) ?? link ?? title,
          ]),
          title,
          summary,
          body: null,
          source: feed.name,
          sourceUrl: link,
          canonicalUrl: link,
          publishedAt: published,
          symbols: detectSymbols(`${title} ${summary ?? ''}`),
          categories: [...feed.categories, ...readCategories(entry)],
          importance: 'medium',
          metadata: { feed: feed.name },
        } satisfies RawNewsItem,
      ];
    });
  }
}

const DEFAULT_FEEDS: Feed[] = [
  { name: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', categories: ['crypto'] },
  { name: 'Cointelegraph', url: 'https://cointelegraph.com/rss', categories: ['crypto'] },
  {
    name: 'Federal Reserve',
    url: 'https://www.federalreserve.gov/feeds/press_all.xml',
    categories: ['macro', 'central-bank'],
  },
  {
    name: 'Investing.com Economy',
    url: 'https://www.investing.com/rss/news_14.rss',
    categories: ['macro'],
  },
];

export function parseFeeds(raw: string | undefined): Feed[] {
  if (raw === undefined) return DEFAULT_FEEDS;
  if (raw.trim() === '') return [];
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .flatMap((entry) => {
      const [name, url, categories] = entry.split('|').map((part) => part?.trim());
      if (!name || !url) return [];
      return [{ name, url, categories: categories ? categories.split('+') : ['news'] }];
    });
}

/** Coins the application actually tracks, plus the names they are written by. */
const SYMBOL_HINTS: Record<string, string[]> = {
  BTC: ['bitcoin', 'btc'],
  ETH: ['ethereum', 'ether', 'eth'],
  SOL: ['solana', 'sol'],
  USD: ['dollar', 'usd', 'federal reserve', 'fed', 'fomc'],
  EUR: ['euro', 'ecb', 'eurozone'],
  GBP: ['pound sterling', 'boe', 'bank of england'],
  JPY: ['yen', 'boj', 'bank of japan'],
  XAU: ['gold', 'bullion'],
};

export function detectSymbols(text: string): string[] {
  const haystack = ` ${text.toLowerCase()} `;
  const found = new Set<string>();
  for (const [symbol, hints] of Object.entries(SYMBOL_HINTS)) {
    // Word-boundary matching: "sol" must not fire on "solution".
    if (hints.some((hint) => new RegExp(`(^|[^a-z])${hint}([^a-z]|$)`, 'i').test(haystack))) {
      found.add(symbol);
    }
  }
  return [...found];
}

function pick(source: Record<string, unknown>, path: string[]): unknown {
  let current: unknown = source;
  for (const key of path) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
}

function readText(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record['#text'] === 'string') return record['#text'];
  }
  return null;
}

function readLink(entry: Record<string, unknown>): string | null {
  const link = entry.link;
  if (typeof link === 'string') return link;
  if (Array.isArray(link)) {
    for (const candidate of link) {
      const href = (candidate as Record<string, unknown>)?.['@href'];
      if (typeof href === 'string') return href;
    }
  }
  if (link && typeof link === 'object') {
    const href = (link as Record<string, unknown>)['@href'];
    if (typeof href === 'string') return href;
    const text = readText(link);
    if (text) return text;
  }
  return readText(entry.guid);
}

function readCategories(entry: Record<string, unknown>): string[] {
  return asArray(entry.category)
    .map((value) => readText(value) ?? readText((value as Record<string, unknown>)?.['@term']))
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .slice(0, 5);
}
