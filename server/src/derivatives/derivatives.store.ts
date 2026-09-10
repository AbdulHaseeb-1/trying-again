import { Injectable } from '@nestjs/common';

import type {
  AssetDerivatives,
  DerivativesSnapshot,
  LiquidityMap,
  MarketOverview,
} from './derivatives.types';

export type MergeReport = {
  /** Assets whose breakdown this merge replaced. */
  updated: string[];
  /** Assets the incoming snapshot did not cover, so the old copy stands. */
  retained: string[];
  marketUpdated: boolean;
  /** Symbols whose liquidity map this merge replaced. */
  mapsUpdated: string[];
};

/**
 * The in-memory projection of the latest scrape.
 *
 * Merging rather than replacing is what makes a partial run safe. A CoinGlass
 * page can fail on its own — a slow render, a blocked request — and the run
 * still returns whatever the other pages produced. If that thin snapshot
 * overwrote the store wholesale, one flaky page would blank a tab that was
 * showing correct numbers a minute ago. So each asset advances independently
 * and anything the run did not cover is left exactly as it was.
 */
@Injectable()
export class DerivativesStore {
  private assets = new Map<string, AssetDerivatives>();
  private maps = new Map<string, LiquidityMap>();
  private overview: MarketOverview | null = null;
  private capturedAt: string | null = null;
  private lastChangedAt: string | null = null;
  private pages: DerivativesSnapshot['pages'] = [];

  merge(snapshot: DerivativesSnapshot): MergeReport {
    const report: MergeReport = { updated: [], retained: [], marketUpdated: false, mapsUpdated: [] };

    for (const asset of snapshot.assets) {
      this.assets.set(asset.summary.symbol, asset);
      report.updated.push(asset.summary.symbol);
    }
    for (const symbol of this.assets.keys()) {
      if (!report.updated.includes(symbol)) report.retained.push(symbol);
    }

    if (snapshot.market) {
      this.overview = snapshot.market;
      report.marketUpdated = true;
    }

    // A heatmap page that failed leaves the previous map standing, like assets.
    for (const map of snapshot.liquidityMaps ?? []) {
      this.maps.set(map.symbol, map);
      report.mapsUpdated.push(map.symbol);
    }

    this.pages = snapshot.pages;
    this.capturedAt = snapshot.capturedAt;
    if (report.updated.length || report.marketUpdated || report.mapsUpdated.length) {
      this.lastChangedAt = new Date().toISOString();
    }
    return report;
  }

  /** Seed from a persisted snapshot without reporting it as a sync. */
  hydrate(snapshot: DerivativesSnapshot): number {
    for (const asset of snapshot.assets) {
      if (!this.assets.has(asset.summary.symbol)) this.assets.set(asset.summary.symbol, asset);
    }
    for (const map of snapshot.liquidityMaps ?? []) {
      if (!this.maps.has(map.symbol)) this.maps.set(map.symbol, map);
    }
    this.overview ??= snapshot.market;
    this.capturedAt ??= snapshot.capturedAt;
    this.pages = this.pages.length ? this.pages : snapshot.pages;
    return this.assets.size;
  }

  asset(symbol: string): AssetDerivatives | null {
    return this.assets.get(symbol.toUpperCase()) ?? null;
  }

  liquidityMap(symbol: string): LiquidityMap | null {
    return this.maps.get(symbol.toUpperCase()) ?? null;
  }

  /** Symbols a map exists for — a short list, and not the tracked assets. */
  get mappedSymbols(): string[] {
    return [...this.maps.keys()];
  }

  all(): AssetDerivatives[] {
    return [...this.assets.values()];
  }

  get symbols(): string[] {
    return [...this.assets.keys()];
  }

  get market(): MarketOverview | null {
    return this.overview;
  }

  get pageReports(): DerivativesSnapshot['pages'] {
    return this.pages;
  }

  get capturedAtIso(): string | null {
    return this.capturedAt;
  }

  get changedAt(): string | null {
    return this.lastChangedAt;
  }

  /** The whole store as one snapshot, for persistence and for the API. */
  toSnapshot(): DerivativesSnapshot {
    return {
      capturedAt: this.capturedAt ?? new Date().toISOString(),
      source: 'coinglass-scrape',
      durationMs: 0,
      market: this.overview,
      assets: this.all(),
      liquidityMaps: [...this.maps.values()],
      pages: this.pages,
    };
  }
}
