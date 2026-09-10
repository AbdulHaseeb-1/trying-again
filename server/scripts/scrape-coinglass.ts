import 'reflect-metadata';

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { BrowserService } from '../src/browser/browser.service';
import { derivativesConfig } from '../src/config/configuration';
import { CoinglassScraper } from '../src/derivatives/sources/coinglass.scraper';

/**
 * Run one CoinGlass scrape outside the server and write the snapshot to disk.
 *
 * Useful for three things: seeding `seed/derivatives-snapshot.json`, checking a
 * mapper change against the live site without booting Nest, and capturing data
 * on a machine that can reach CoinGlass to carry to one that cannot.
 *
 *   npx tsx scripts/scrape-coinglass.ts [output.json] [BTC,ETH,SOL]
 */
async function main(): Promise<void> {
  const [outputArgument, assetsArgument] = process.argv.slice(2);
  const output = resolve(process.cwd(), outputArgument ?? 'data/derivatives-snapshot.json');
  const config = derivativesConfig();
  const assets = (assetsArgument ? assetsArgument.split(',') : config.assets)
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean);

  const browser = new BrowserService();
  const scraper = new CoinglassScraper(browser, config);

  try {
    const snapshot = await scraper.fetch(assets);
    await mkdir(dirname(output), { recursive: true });
    // Compact, like the runtime snapshot: these files are read by machines.
    await writeFile(output, JSON.stringify(snapshot), 'utf8');

    for (const page of snapshot.pages) {
      const status = page.ok ? 'ok' : `failed (${page.error})`;
      console.log(`${page.page.padEnd(12)} ${status} — ${page.kinds.join(', ') || 'nothing'}`);
    }
    for (const asset of snapshot.assets) {
      const { summary } = asset;
      console.log(
        `${summary.symbol}: OI ${summary.openInterestUsd} across ${asset.venues.length} venues, ` +
          `funding ${summary.fundingRateByOpenInterest}%, ${asset.fundingHistory.length} funding points`,
      );
    }
    console.log(
      `market: ${snapshot.market?.screener.length ?? 0} screener rows, ` +
        `${snapshot.market?.liquidationsByExchange.length ?? 0} venues liquidating, ` +
        `${snapshot.market?.recentLiquidations.length ?? 0} liquidation orders`,
    );
    console.log(`wrote ${output}`);
  } finally {
    await browser.onModuleDestroy();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
