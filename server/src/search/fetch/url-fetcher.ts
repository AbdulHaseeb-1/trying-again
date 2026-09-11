import { lookup } from 'node:dns/promises';

import { Injectable, Logger } from '@nestjs/common';
import { Readability } from '@mozilla/readability';
import ipaddr from 'ipaddr.js';
import { parseHTML } from 'linkedom';

import type { FetchedPage } from '../search-provider';
import { isDomainAllowed } from '../normalization/normalize';

const MAX_BYTES = 2_000_000;
const MAX_TEXT = 20_000;
const MAX_REDIRECTS = 3;

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeUrlError';
  }
}

/**
 * Opening a URL an agent chose is the sharpest edge in this feature.
 *
 * The model picks the address, so the address is attacker-influenced in every
 * sense that matters: a malicious search result, a poisoned article, or a
 * prompt-injected instruction to "check http://169.254.169.254/". Four defences,
 * all of them here rather than scattered across adapters:
 *
 *  1. **Scheme.** https only. No file:, no gopher:, no data:.
 *  2. **Address.** Every hostname is resolved and the resulting IP rejected if
 *     it is loopback, private, link-local, unique-local, multicast or reserved.
 *     Checking the *resolved address* rather than the hostname is what stops
 *     `internal.example.com A 127.0.0.1` and decimal-IP tricks alike.
 *  3. **Redirects.** Followed by hand, at most three, each hop re-checked —
 *     otherwise a public URL that 302s to the metadata service walks straight
 *     through step 2.
 *  4. **Budget.** A deadline and a byte cap, so a slow or endless body cannot
 *     hold a run open.
 *
 * What comes back is article text, and it is treated as data everywhere above.
 */
@Injectable()
export class UrlFetcher {
  private readonly logger = new Logger(UrlFetcher.name);

  async assertSafe(rawUrl: string, allowed: string[], blocked: string[]): Promise<URL> {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      throw new UnsafeUrlError('That is not a valid URL.');
    }
    if (url.protocol !== 'https:') {
      throw new UnsafeUrlError('Only https URLs can be opened.');
    }
    if (!isDomainAllowed(url.hostname.replace(/^www\./, ''), allowed, blocked)) {
      throw new UnsafeUrlError('That domain is not allowed by the current search policy.');
    }
    await this.assertPublicAddress(url.hostname);
    return url;
  }

  private async assertPublicAddress(hostname: string): Promise<void> {
    let addresses: { address: string }[];
    try {
      addresses = await lookup(hostname, { all: true });
    } catch {
      throw new UnsafeUrlError('That host could not be resolved.');
    }
    if (addresses.length === 0) throw new UnsafeUrlError('That host could not be resolved.');

    for (const entry of addresses) {
      let parsed: ReturnType<typeof ipaddr.parse>;
      try {
        parsed = ipaddr.parse(entry.address);
      } catch {
        throw new UnsafeUrlError('That host resolved to an address we cannot verify.');
      }
      // ipaddr.js labels every reserved range; "unicast" is the only public one.
      const range = parsed.range();
      if (range !== 'unicast') {
        throw new UnsafeUrlError('That host resolves to a non-public address.');
      }
    }
  }

  /**
   * Fetch and extract. Returns readable text, never raw HTML — the caller is
   * about to put this in front of a model, and script/style noise is both a
   * token cost and an injection surface.
   */
  async fetchPage(
    rawUrl: string,
    options: { timeoutMs: number; allowedDomains: string[]; blockedDomains: string[] },
    signal?: AbortSignal,
  ): Promise<FetchedPage> {
    let current = await this.assertSafe(rawUrl, options.allowedDomains, options.blockedDomains);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('timeout')), options.timeoutMs);
    const onAbort = () => controller.abort(signal?.reason);
    signal?.addEventListener('abort', onAbort, { once: true });

    try {
      let response: Response | null = null;
      for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
        response = await fetch(current.toString(), {
          redirect: 'manual',
          signal: controller.signal,
          headers: {
            accept: 'text/html,application/xhtml+xml',
            'user-agent': 'MarketPulseAgent/1.0 (+research)',
          },
        });
        if (response.status < 300 || response.status >= 400) break;
        const location = response.headers.get('location');
        if (!location) break;
        current = await this.assertSafe(
          new URL(location, current).toString(),
          options.allowedDomains,
          options.blockedDomains,
        );
        response = null;
      }

      if (!response) throw new UnsafeUrlError('Too many redirects.');
      if (!response.ok) throw new Error(`fetch failed with ${response.status}`);

      const type = response.headers.get('content-type') ?? '';
      if (!type.includes('html') && !type.includes('text/plain') && !type.includes('xml')) {
        throw new UnsafeUrlError('That URL is not a readable web page.');
      }

      const html = await this.readCapped(response);
      return this.extract(current.toString(), html);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }

  /** Stop reading at the cap rather than buffering whatever the server sends. */
  private async readCapped(response: Response): Promise<string> {
    const reader = response.body?.getReader();
    if (!reader) return response.text();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (total < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        total += value.byteLength;
      }
    }
    await reader.cancel().catch(() => undefined);
    return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8');
  }

  private extract(url: string, html: string): FetchedPage {
    try {
      const { document } = parseHTML(html);
      const article = new Readability(document as unknown as Document).parse();
      const text = (article?.textContent ?? document.body?.textContent ?? '')
        .replace(/\s+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]{2,}/g, ' ')
        .trim();
      return {
        url,
        title: article?.title ?? document.title ?? null,
        siteName: article?.siteName ?? null,
        publishedAt: article?.publishedTime ?? null,
        text: text.slice(0, MAX_TEXT),
        truncated: text.length > MAX_TEXT,
      };
    } catch (error) {
      this.logger.warn(`extraction failed for ${url}: ${String(error)}`);
      return { url, title: null, siteName: null, publishedAt: null, text: '', truncated: false };
    }
  }
}
