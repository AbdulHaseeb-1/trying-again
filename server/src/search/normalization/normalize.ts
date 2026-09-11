import { createHash } from 'node:crypto';

import type { SearchQueryOptions, SearchResult } from '../search-provider';

/**
 * The rules every adapter's output passes through, applied once here rather
 * than re-implemented (and mis-implemented) per engine.
 */

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Stable id: the same page from the same engine is always the same result. */
export function resultId(provider: string, url: string): string {
  return `sr_${createHash('sha1').update(`${provider}|${url}`).digest('hex').slice(0, 16)}`;
}

function matchesDomain(domain: string, pattern: string): boolean {
  const needle = pattern.trim().toLowerCase().replace(/^www\./, '');
  if (!needle) return false;
  return domain === needle || domain.endsWith(`.${needle}`);
}

export function isDomainAllowed(
  domain: string,
  allowed: string[],
  blocked: string[],
): boolean {
  if (!domain) return false;
  if (blocked.some((pattern) => matchesDomain(domain, pattern))) return false;
  if (allowed.length > 0 && !allowed.some((pattern) => matchesDomain(domain, pattern))) {
    return false;
  }
  return true;
}

/**
 * Domain policy, recency and result count, applied after the engine answers.
 *
 * Applied here even when the engine claims to support the same filters: an
 * allow-list that only holds when the upstream honours a query parameter is not
 * a policy, it is a hope.
 */
export function applyPolicy(
  results: SearchResult[],
  options: SearchQueryOptions,
  now = Date.now(),
): SearchResult[] {
  const cutoff = options.recencyDays ? now - options.recencyDays * 86_400_000 : null;

  const filtered = results.filter((result) => {
    if (!result.url) return false;
    if (!isDomainAllowed(result.domain, options.allowedDomains, options.blockedDomains)) {
      return false;
    }
    if (cutoff && result.publishedAt) {
      const published = Date.parse(result.publishedAt);
      if (Number.isFinite(published) && published < cutoff) return false;
    }
    return true;
  });

  const seen = new Set<string>();
  const deduped = filtered.filter((result) => {
    const key = result.url.replace(/[#?].*$/, '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return deduped.slice(0, Math.max(1, options.maxResults));
}

/** Collapse whitespace and cap length — snippets arrive in wildly mixed shapes. */
export function cleanSnippet(value: unknown, max = 400): string {
  if (typeof value !== 'string') return '';
  const text = value.replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function toIsoOrNull(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Seconds or milliseconds, depending on the engine.
    const ms = value > 1e12 ? value : value * 1000;
    return new Date(ms).toISOString();
  }
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}
