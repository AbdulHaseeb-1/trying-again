import type { Page } from 'playwright';

/**
 * Harvesting CoinGlass.
 *
 * CoinGlass serves its numbers as encrypted blobs — every response is
 * `{"code":"0","data":"<base64>"}` — and decodes them in the browser before
 * rendering. There is nothing useful in the HTML either: the tables are drawn
 * from that decoded state.
 *
 * So rather than parsing the DOM (which loses precision, units and every value
 * that is only ever rendered inside a chart) we let the page do its own work
 * and read what it produced. `JSON.parse` is the one funnel every decoded
 * payload passes through, so wrapping it captures the site's full model —
 * per-venue open interest, funding, liquidations, order flow — in the exact
 * shape CoinGlass' own front end consumes.
 */

export type HarvestedPayload = {
  /** Order of arrival, kept so the newest copy of a repeated payload wins. */
  index: number;
  bytes: number;
  value: unknown;
};

export type HarvestOptions = {
  /** Hard ceiling on how long to let the page keep answering. */
  settleMs: number;
  /** Stop early once no new payload has landed for this long. */
  quietMs: number;
  navigationTimeoutMs: number;
};

/** Third-party JSON that rides along on the page and is never market data. */
const NOISE = [
  '_nextI18Next',
  'FeatureCollection',
  'consent-settings',
  'ca-pub-',
  'sha224WithRSAEncryption',
  'aes-128-ecb',
  'TERMLY_',
  'modp1',
];

/** Anything bigger than this is a chart archive we would only throw away. */
const MAX_PAYLOAD_BYTES = 1_500_000;

/**
 * The hook is injected as source text rather than as a function reference.
 *
 * Playwright stringifies a function argument, which means whatever the
 * transpiler emitted goes to the browser with it — and esbuild's `keepNames`
 * helper (`__name`) does not exist there. The resulting ReferenceError fires
 * *before* `JSON.parse` is replaced, so the page runs happily and the harvest
 * comes back empty with nothing to explain it. Source text has no such
 * dependency on the build.
 */
function hookSource(config: { noise: string[]; maxBytes: number }): string {
  return `
(() => {
  const noise = ${JSON.stringify(config.noise)};
  const maxBytes = ${config.maxBytes};
  const harvest = [];
  const seen = new Set();
  globalThis.__cgHarvest = harvest;

  const parse = JSON.parse;
  const stringify = JSON.stringify;
  let index = 0;

  JSON.parse = function (text, reviver) {
    const value = parse.call(JSON, text, reviver);
    try {
      // Envelopes are still encrypted at this point; the interesting parse is
      // the one the page makes on the decrypted string a moment later.
      const envelope =
        value !== null && typeof value === 'object' &&
        typeof value.data === 'string' && 'code' in value;
      if (
        !envelope && typeof text === 'string' &&
        text.length > 200 && text.length < maxBytes &&
        (Array.isArray(value) || (value !== null && typeof value === 'object'))
      ) {
        const head = text.slice(0, 400);
        if (!noise.some((token) => head.indexOf(token) !== -1)) {
          // Identical payloads arrive many times over (re-renders, polls).
          const signature = text.length + ':' + text.slice(0, 160);
          if (!seen.has(signature)) {
            seen.add(signature);
            const safe = stringify(value, (key, item) =>
              typeof item === 'bigint' ? item.toString() : item);
            if (safe) harvest.push({ index: index++, bytes: safe.length, text: safe });
          }
        }
      }
    } catch (error) {
      // Never let instrumentation break the page we are reading.
    }
    return value;
  };
})();
`;
}

/**
 * Load one CoinGlass page and return everything it decoded.
 *
 * The page keeps polling after load, so we wait for it to go quiet rather than
 * for a fixed delay: on a fast connection that returns in a few seconds, and
 * `settleMs` bounds the slow case.
 */
export async function harvestPage(
  page: Page,
  url: string,
  options: HarvestOptions,
): Promise<HarvestedPayload[]> {
  await page.addInitScript({ content: hookSource({ noise: NOISE, maxBytes: MAX_PAYLOAD_BYTES }) });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: options.navigationTimeoutMs });

  const count = () =>
    page.evaluate('globalThis.__cgHarvest ? globalThis.__cgHarvest.length : 0') as Promise<number>;

  const deadline = Date.now() + options.settleMs;
  let stable = 0;
  let lastCount = -1;
  while (Date.now() < deadline) {
    const current = await count();
    if (current === lastCount && current > 0) {
      stable += 500;
      if (stable >= options.quietMs) break;
    } else {
      stable = 0;
      lastCount = current;
    }
    await page.waitForTimeout(500);
  }

  const raw = (await page.evaluate('globalThis.__cgHarvest || []')) as {
    index: number;
    bytes: number;
    text: string;
  }[];

  return raw.flatMap((entry) => {
    try {
      return [{ index: entry.index, bytes: entry.bytes, value: JSON.parse(entry.text) as unknown }];
    } catch {
      return [];
    }
  });
}
