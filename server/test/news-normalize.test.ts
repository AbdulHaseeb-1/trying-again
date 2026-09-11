import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { fallbackItemKey, newsId } from '../src/news/normalization/news-id';
import { normalizeNewsItem } from '../src/news/normalization/news.normalize';
import { decodeCursor, encodeCursor, pageInMemory } from '../src/news/news.repository';
import { detectSymbols, parseFeeds } from '../src/news/providers/rss-news.provider';
import type { NewsItem } from '../src/news/news.types';

const at = new Date('2026-09-11T12:00:00.000Z');

describe('news identity', () => {
  it('is stable for the same provider item', () => {
    assert.equal(newsId('rss', 'CoinDesk|abc'), newsId('rss', 'CoinDesk|abc'));
  });

  it('separates the same key arriving from different providers', () => {
    assert.notEqual(newsId('rss', 'abc'), newsId('app-calendar', 'abc'));
  });

  it('is opaque and prefixed, so an agent can cite it verbatim', () => {
    assert.match(newsId('rss', 'abc'), /^news_[A-Za-z0-9_-]{22}$/);
  });

  it('builds a fallback key from whatever the feed did provide', () => {
    assert.equal(fallbackItemKey(['CoinDesk', null, 'https://x/1']), 'CoinDesk|https://x/1');
  });
});

describe('news normalization', () => {
  it('strips markup and entities out of feed prose', () => {
    const item = normalizeNewsItem(
      {
        provider: 'rss',
        providerItemId: 'k1',
        source: 'CoinDesk',
        title: '<b>Bitcoin</b> climbs',
        summary: '<p>Spot demand &amp; ETF flows<script>alert(1)</script></p>',
      },
      at,
    );
    assert.equal(item?.title, 'Bitcoin climbs');
    assert.equal(item?.summary, 'Spot demand & ETF flows');
  });

  it('refuses an item with no usable title', () => {
    assert.equal(
      normalizeNewsItem({ provider: 'rss', providerItemId: 'k', source: 'X', title: '   ' }, at),
      null,
    );
    assert.equal(
      normalizeNewsItem({ provider: 'rss', providerItemId: 'k', source: 'X', title: 42 }, at),
      null,
    );
  });

  it('accepts the three timestamp shapes feeds actually send', () => {
    const iso = normalizeNewsItem(
      { provider: 'p', providerItemId: '1', source: 'S', title: 'T', publishedAt: '2026-09-01T08:00:00Z' },
      at,
    );
    const seconds = normalizeNewsItem(
      { provider: 'p', providerItemId: '2', source: 'S', title: 'T', publishedAt: 1_756_713_600 },
      at,
    );
    const millis = normalizeNewsItem(
      { provider: 'p', providerItemId: '3', source: 'S', title: 'T', publishedAt: 1_756_713_600_000 },
      at,
    );
    assert.equal(iso?.publishedAt, '2026-09-01T08:00:00.000Z');
    assert.equal(seconds?.publishedAt, millis?.publishedAt);
  });

  it('falls back to the sync time when a feed sends no date', () => {
    const item = normalizeNewsItem({ provider: 'p', providerItemId: '1', source: 'S', title: 'T' }, at);
    assert.equal(item?.publishedAt, at.toISOString());
  });

  it('rejects a non-http URL rather than storing it as a citation target', () => {
    const item = normalizeNewsItem(
      {
        provider: 'p',
        providerItemId: '1',
        source: 'S',
        title: 'T',
        sourceUrl: 'javascript:alert(1)',
      },
      at,
    );
    assert.equal(item?.sourceUrl, null);
    assert.equal(item?.canonicalUrl, null);
  });

  it('normalises symbols upward and drops junk', () => {
    const item = normalizeNewsItem(
      {
        provider: 'p',
        providerItemId: '1',
        source: 'S',
        title: 'T',
        symbols: ['btc', ' eth ', '', 7, 'btc'],
      },
      at,
    );
    assert.deepEqual(item?.symbols, ['BTC', 'ETH']);
  });

  it('defaults an unknown importance to medium rather than inventing one', () => {
    const item = normalizeNewsItem(
      { provider: 'p', providerItemId: '1', source: 'S', title: 'T', importance: 'catastrophic' },
      at,
    );
    assert.equal(item?.importance, 'medium');
  });

  it('caps a runaway body', () => {
    const item = normalizeNewsItem(
      { provider: 'p', providerItemId: '1', source: 'S', title: 'T', body: 'x'.repeat(50_000) },
      at,
    );
    assert.ok((item?.body?.length ?? 0) <= 12_000);
  });
});

describe('news paging and filters', () => {
  const items: NewsItem[] = [
    make('1', '2026-09-11T10:00:00.000Z', ['BTC'], 'high', 'Bitcoin rallies'),
    make('2', '2026-09-11T09:00:00.000Z', ['USD'], 'critical', 'US CPI prints hot'),
    make('3', '2026-09-10T09:00:00.000Z', ['BTC', 'ETH'], 'low', 'Ether quiet'),
    make('4', '2026-09-09T09:00:00.000Z', ['USD'], 'medium', 'Fed speakers'),
  ];

  it('returns newest first', () => {
    const page = pageInMemory(items, {}, 10);
    assert.deepEqual(
      page.items.map((item) => item.id),
      ['1', '2', '3', '4'],
    );
  });

  it('filters by symbol', () => {
    const page = pageInMemory(items, { symbols: ['BTC'] }, 10);
    assert.deepEqual(
      page.items.map((item) => item.id),
      ['1', '3'],
    );
  });

  it('filters by minimum importance, inclusively', () => {
    const page = pageInMemory(items, { minImportance: 'high' }, 10);
    assert.deepEqual(
      page.items.map((item) => item.id),
      ['1', '2'],
    );
  });

  it('searches title text case-insensitively', () => {
    assert.deepEqual(
      pageInMemory(items, { q: 'cpi' }, 10).items.map((item) => item.id),
      ['2'],
    );
  });

  it('filters by time range', () => {
    const page = pageInMemory(
      items,
      { from: '2026-09-10T00:00:00.000Z', to: '2026-09-11T09:30:00.000Z' },
      10,
    );
    assert.deepEqual(
      page.items.map((item) => item.id),
      ['2', '3'],
    );
  });

  it('pages with a cursor without repeating or skipping', () => {
    const first = pageInMemory(items, {}, 2);
    assert.deepEqual(
      first.items.map((item) => item.id),
      ['1', '2'],
    );
    assert.ok(first.nextCursor);

    const second = pageInMemory(items, { cursor: first.nextCursor! }, 2);
    assert.deepEqual(
      second.items.map((item) => item.id),
      ['3', '4'],
    );
    assert.equal(second.nextCursor, null);
  });

  it('reports the full match count alongside the page', () => {
    const page = pageInMemory(items, { symbols: ['USD'] }, 1);
    assert.equal(page.items.length, 1);
    assert.equal(page.total, 2);
  });

  it('round-trips a cursor and ignores a corrupt one', () => {
    const cursor = encodeCursor(items[0]);
    assert.deepEqual(decodeCursor(cursor), {
      publishedAt: items[0].publishedAt,
      id: items[0].id,
    });
    assert.equal(decodeCursor('not-a-cursor'), null);
    assert.equal(decodeCursor(undefined), null);
  });
});

describe('rss provider helpers', () => {
  it('ships defaults when the variable is unset and none when it is empty', () => {
    assert.ok(parseFeeds(undefined).length > 0);
    assert.deepEqual(parseFeeds(''), []);
  });

  it('parses a Name|url[|cat+cat] list', () => {
    const feeds = parseFeeds('Reuters|https://r.example/rss|macro+fx, Bad Entry');
    assert.equal(feeds.length, 1);
    assert.equal(feeds[0].name, 'Reuters');
    assert.deepEqual(feeds[0].categories, ['macro', 'fx']);
  });

  it('detects symbols on word boundaries, not substrings', () => {
    assert.deepEqual(detectSymbols('Bitcoin and Ether rally').sort(), ['BTC', 'ETH']);
    assert.deepEqual(detectSymbols('The FOMC meets'), ['USD']);
    // "sol" inside "solution" must not tag the story as Solana.
    assert.deepEqual(detectSymbols('A solution to the problem'), []);
    assert.deepEqual(detectSymbols('Gold hits a record'), ['XAU']);
  });
});

function make(
  id: string,
  publishedAt: string,
  symbols: string[],
  importance: NewsItem['importance'],
  title: string,
): NewsItem {
  return {
    id,
    title,
    summary: null,
    body: null,
    source: 'Test',
    sourceUrl: null,
    canonicalUrl: null,
    publishedAt,
    receivedAt: publishedAt,
    symbols,
    categories: ['test'],
    importance,
    sentiment: null,
    provider: 'test',
    providerItemId: id,
    metadata: {},
  };
}
