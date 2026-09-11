import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyPolicy,
  cleanSnippet,
  domainOf,
  isDomainAllowed,
  resultId,
  toIsoOrNull,
} from '../src/search/normalization/normalize';
import type { SearchQueryOptions, SearchResult } from '../src/search/search-provider';

const baseOptions: SearchQueryOptions = {
  maxResults: 10,
  depth: 'basic',
  recencyDays: null,
  allowedDomains: [],
  blockedDomains: [],
  safeSearch: true,
  timeoutMs: 10_000,
};

const result = (url: string, publishedAt: string | null = null): SearchResult => ({
  id: resultId('test', url),
  title: url,
  url,
  domain: domainOf(url),
  snippet: '',
  publishedAt,
  provider: 'test',
  score: null,
});

/**
 * The domain policy is the part of search that is security-relevant, and the
 * part most often implemented as "pass a parameter and hope". These cases are
 * the ones that break a naive `endsWith` check.
 */
describe('search policy', () => {
  it('reads a domain without its www prefix', () => {
    assert.equal(domainOf('https://www.reuters.com/article/1'), 'reuters.com');
    assert.equal(domainOf('not a url'), '');
  });

  it('matches a domain and its subdomains, but not a lookalike', () => {
    assert.equal(isDomainAllowed('reuters.com', ['reuters.com'], []), true);
    assert.equal(isDomainAllowed('feeds.reuters.com', ['reuters.com'], []), true);
    // The attack an `endsWith` check waves through.
    assert.equal(isDomainAllowed('notreuters.com', ['reuters.com'], []), false);
    assert.equal(isDomainAllowed('reuters.com.evil.test', ['reuters.com'], []), false);
  });

  it('lets the block list win over the allow list', () => {
    assert.equal(isDomainAllowed('bad.reuters.com', ['reuters.com'], ['bad.reuters.com']), false);
  });

  it('refuses everything outside a non-empty allow list', () => {
    const filtered = applyPolicy(
      [result('https://reuters.com/a'), result('https://example.com/b')],
      { ...baseOptions, allowedDomains: ['reuters.com'] },
    );
    assert.deepEqual(
      filtered.map((entry) => entry.domain),
      ['reuters.com'],
    );
  });

  it('drops results older than the recency window, keeping undated ones', () => {
    const now = Date.parse('2026-09-11T00:00:00.000Z');
    const filtered = applyPolicy(
      [
        result('https://a.test/1', '2026-09-10T00:00:00.000Z'),
        result('https://b.test/2', '2026-01-01T00:00:00.000Z'),
        result('https://c.test/3', null),
      ],
      { ...baseOptions, recencyDays: 7 },
      now,
    );
    assert.deepEqual(
      filtered.map((entry) => entry.domain),
      ['a.test', 'c.test'],
    );
  });

  it('deduplicates by URL ignoring query and fragment', () => {
    const filtered = applyPolicy(
      [
        result('https://a.test/x'),
        result('https://a.test/x?utm_source=news'),
        result('https://a.test/x#section'),
        result('https://a.test/y'),
      ],
      baseOptions,
    );
    assert.equal(filtered.length, 2);
  });

  it('never returns more than the requested count', () => {
    const many = Array.from({ length: 20 }, (_value, index) => result(`https://a.test/${index}`));
    assert.equal(applyPolicy(many, { ...baseOptions, maxResults: 3 }).length, 3);
  });

  it('drops a result with no usable URL', () => {
    assert.equal(applyPolicy([result('')], baseOptions).length, 0);
  });
});

describe('search result normalization', () => {
  it('gives the same page from the same engine one id', () => {
    assert.equal(resultId('tavily', 'https://a.test/1'), resultId('tavily', 'https://a.test/1'));
    assert.notEqual(resultId('exa', 'https://a.test/1'), resultId('tavily', 'https://a.test/1'));
  });

  it('collapses whitespace and caps a snippet', () => {
    assert.equal(cleanSnippet('  hello \n\n world  '), 'hello world');
    assert.equal(cleanSnippet('x'.repeat(900)).length, 400);
    assert.equal(cleanSnippet(undefined), '');
  });

  it('accepts the date shapes engines actually return', () => {
    assert.equal(toIsoOrNull('2026-09-01'), '2026-09-01T00:00:00.000Z');
    assert.equal(toIsoOrNull(1_756_713_600), toIsoOrNull(1_756_713_600_000));
    assert.equal(toIsoOrNull('sometime last week'), null);
    assert.equal(toIsoOrNull(''), null);
    assert.equal(toIsoOrNull(null), null);
  });
});
