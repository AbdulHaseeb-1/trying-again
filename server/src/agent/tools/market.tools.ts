import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import { DerivativesService } from '../../derivatives/derivatives.service';
import { AgentError } from '../agent.errors';
import type { AnyAppTool, AppTool, AppToolProvider } from './tool-definition';
import { sessionState } from './market-sessions';
import { compact, marketReference, trim } from './tool-support';

const symbolInput = z.object({
  symbol: z
    .string()
    .describe('Ticker, e.g. BTC. Omit to use whatever the user is currently looking at.')
    .nullable(),
});

/**
 * Everything an agent can learn about a market, over the CoinGlass pipeline the
 * application already runs.
 *
 * Read-only by construction. Each tool returns a small, already-rounded object
 * rather than the raw snapshot — a full asset payload is tens of kilobytes and
 * spending a model's context on nine unused positioning ratios makes answers
 * worse, not better.
 */
@Injectable()
export class MarketTools implements AppToolProvider {
  constructor(private readonly derivatives: DerivativesService) {}

  tools(): AnyAppTool[] {
    return [
      this.snapshot(),
      this.openInterest(),
      this.funding(),
      this.liquidations(),
      this.ohlcv(),
      this.volumeProfile(),
      this.session(),
      this.screener(),
    ] as AnyAppTool[];
  }

  /** The symbol the caller asked for, or the one on screen, or the first tracked. */
  private resolveSymbol(requested: string | null, contextSymbol: string | null): string {
    const wanted = (requested ?? contextSymbol ?? this.derivatives.available[0] ?? '').toUpperCase();
    if (!wanted) {
      throw new AgentError('context_unavailable', 'No market data has been captured yet.');
    }
    return wanted;
  }

  private requireAsset(symbol: string) {
    const asset = this.derivatives.asset(symbol);
    if (!asset) {
      throw new AgentError(
        'tool_unavailable',
        `No derivatives data for ${symbol}. Tracked symbols: ${this.derivatives.available.join(', ') || 'none'}.`,
      );
    }
    return asset;
  }

  private snapshot(): AppTool<typeof symbolInput> {
    return {
      name: 'get_market_snapshot',
      description:
        'Price, 24h change, market cap, open interest, volume, funding and liquidations for one symbol, as of the latest capture.',
      domain: 'market',
      capability: 'market.read',
      level: 'READ',
      parameters: symbolInput,
      timeoutMs: 5_000,
      label: (input, context) =>
        `Reading ${this.resolveSymbol(input.symbol, context.selectedSymbol)} market data`,
      summary: (output) => {
        const row = output as { price: number | null; symbol: string };
        return row.price ? `${row.symbol} at ${row.price}` : row.symbol;
      },
      references: (output) => {
        const row = output as { symbol: string; capturedAt: string | null };
        return [
          marketReference({
            title: `${row.symbol} market snapshot`,
            symbol: row.symbol,
            surface: 'derivatives.snapshot',
            capturedAt: row.capturedAt,
          }),
        ];
      },
      execute: async (input, { run }) => {
        const symbol = this.resolveSymbol(input.symbol, run.selectedSymbol);
        const asset = this.requireAsset(symbol);
        const summary = asset.summary;
        return compact({
          symbol,
          capturedAt: asset.updatedAt,
          price: trim(summary.price, 8),
          priceChangePercent24h: trim(summary.priceChangePercent24h),
          priceChangePercent7d: trim(summary.priceChangePercent7d),
          marketCapUsd: trim(summary.marketCap, 6),
          openInterestUsd: trim(summary.openInterestUsd, 6),
          openInterestChangePercent24h: trim(summary.openInterestChange.h24),
          volumeUsd24h: trim(summary.volumeUsd24h, 6),
          fundingRate: trim(summary.fundingRateByOpenInterest, 6),
          fundingRateAnnualizedPercent: trim(summary.fundingRateAnnualized),
          longShortRatio24h: trim(summary.longShortRatio.h24),
          liquidationUsd24h: trim(summary.liquidationUsd24h, 6),
          rsi: compact(summary.rsi as Record<string, number>),
          venueCount: asset.venues.length,
        });
      },
    };
  }

  private openInterest(): AppTool<typeof symbolInput> {
    return {
      name: 'get_open_interest',
      description:
        'Open interest for one symbol: the total, its change across every window, and the top venues by size.',
      domain: 'market',
      capability: 'market.read',
      level: 'READ',
      parameters: symbolInput,
      timeoutMs: 5_000,
      label: (input, context) =>
        `Analyzing ${this.resolveSymbol(input.symbol, context.selectedSymbol)} open interest`,
      summary: (output) => {
        const row = output as { totalUsd: number | null };
        return row.totalUsd ? `$${Math.round(row.totalUsd / 1e9)}B open interest` : 'open interest';
      },
      references: (output) => {
        const row = output as { symbol: string; capturedAt: string };
        return [
          marketReference({
            title: `${row.symbol} open interest`,
            symbol: row.symbol,
            surface: 'derivatives.openInterest',
            capturedAt: row.capturedAt,
          }),
        ];
      },
      execute: async (input, { run }) => {
        const symbol = this.resolveSymbol(input.symbol, run.selectedSymbol);
        const asset = this.requireAsset(symbol);
        return {
          symbol,
          capturedAt: asset.updatedAt,
          totalUsd: trim(asset.summary.openInterestUsd, 6),
          changePercent: compact(asset.summary.openInterestChange as Record<string, number>),
          oiVolumeRatio: trim(asset.summary.oiVolumeRatio),
          oiMarketCapRatio: trim(asset.summary.oiMarketCapRatio),
          topVenues: asset.venues
            .slice()
            .sort((a, b) => b.openInterestUsd - a.openInterestUsd)
            .slice(0, 5)
            .map((venue) => ({
              exchange: venue.exchange,
              openInterestUsd: trim(venue.openInterestUsd, 6),
              changePercent24h: trim(venue.openInterestChangePercent24h),
              fundingRate: trim(venue.fundingRate, 6),
            })),
        };
      },
    };
  }

  private funding(): AppTool<typeof symbolInput> {
    return {
      name: 'get_funding',
      description:
        'Funding for one symbol: the weighted rate, its annualised equivalent, the recent history and the per-venue spread.',
      domain: 'market',
      capability: 'market.read',
      level: 'READ',
      parameters: symbolInput,
      timeoutMs: 5_000,
      label: (input, context) =>
        `Checking ${this.resolveSymbol(input.symbol, context.selectedSymbol)} funding`,
      summary: (output) => {
        const row = output as { weightedRate: number | null };
        return row.weightedRate !== null ? `funding ${(row.weightedRate * 100).toFixed(4)}%` : 'funding';
      },
      references: (output) => {
        const row = output as { symbol: string; capturedAt: string };
        return [
          marketReference({
            title: `${row.symbol} funding`,
            symbol: row.symbol,
            surface: 'derivatives.funding',
            capturedAt: row.capturedAt,
          }),
        ];
      },
      execute: async (input, { run }) => {
        const symbol = this.resolveSymbol(input.symbol, run.selectedSymbol);
        const asset = this.requireAsset(symbol);
        return {
          symbol,
          capturedAt: asset.updatedAt,
          weightedRate: trim(asset.summary.fundingRateByOpenInterest, 6),
          annualizedPercent: trim(asset.summary.fundingRateAnnualized),
          // A tail, not the whole series: the shape is the point.
          history: asset.fundingHistory.slice(-12).map((point) => ({
            at: point.at,
            close: trim(point.close, 6),
          })),
          byVenue: asset.venues
            .filter((venue) => venue.fundingRate !== null)
            .slice(0, 8)
            .map((venue) => ({
              exchange: venue.exchange,
              rate: trim(venue.fundingRate, 6),
              nextFundingAt: venue.nextFundingAt,
            })),
        };
      },
    };
  }

  private liquidations(): AppTool<typeof symbolInput> {
    return {
      name: 'get_liquidations',
      description:
        'Liquidations for one symbol across the 1h/4h/12h/24h windows, split long against short.',
      domain: 'market',
      capability: 'market.read',
      level: 'READ',
      parameters: symbolInput,
      timeoutMs: 5_000,
      label: (input, context) =>
        `Reading ${this.resolveSymbol(input.symbol, context.selectedSymbol)} liquidations`,
      summary: (output) => {
        const row = output as { windows: { window: string; totalUsd: number | null }[] };
        const day = row.windows.find((entry) => entry.window === 'h24');
        return day?.totalUsd ? `$${Math.round(day.totalUsd / 1e6)}M in 24h` : 'liquidations';
      },
      references: (output) => {
        const row = output as { symbol: string; capturedAt: string };
        return [
          marketReference({
            title: `${row.symbol} liquidations`,
            symbol: row.symbol,
            surface: 'derivatives.liquidations',
            capturedAt: row.capturedAt,
          }),
        ];
      },
      execute: async (input, { run }) => {
        const symbol = this.resolveSymbol(input.symbol, run.selectedSymbol);
        const asset = this.requireAsset(symbol);
        return {
          symbol,
          capturedAt: asset.updatedAt,
          windows: Object.entries(asset.liquidations).map(([window, bucket]) => ({
            window,
            totalUsd: trim(bucket?.totalUsd, 6),
            longUsd: trim(bucket?.longUsd, 6),
            shortUsd: trim(bucket?.shortUsd, 6),
          })),
        };
      },
    };
  }

  private ohlcv(): AppTool<typeof symbolInput> {
    return {
      name: 'get_ohlcv',
      description:
        'Recent price structure for one symbol. Returns OHLC candles where the application has them, and its own price series otherwise — the response says which.',
      domain: 'market',
      capability: 'market.read',
      level: 'READ',
      parameters: symbolInput,
      timeoutMs: 5_000,
      label: (input, context) =>
        `Reading ${this.resolveSymbol(input.symbol, context.selectedSymbol)} price structure`,
      summary: (output) => {
        const row = output as { kind: string; points: unknown[] };
        return `${row.points.length} ${row.kind === 'candles' ? 'candles' : 'price points'}`;
      },
      references: (output) => {
        const row = output as { symbol: string; capturedAt: string | null; kind: string };
        return [
          marketReference({
            title: `${row.symbol} ${row.kind === 'candles' ? 'candles' : 'price series'}`,
            symbol: row.symbol,
            surface: 'derivatives.price',
            capturedAt: row.capturedAt,
          }),
        ];
      },
      execute: async (input, { run }) => {
        const symbol = this.resolveSymbol(input.symbol, run.selectedSymbol);
        const map = this.derivatives.liquidityMap(symbol);
        if (map && map.candles.length > 0) {
          return {
            symbol,
            kind: 'candles' as const,
            capturedAt: map.capturedAt,
            points: map.candles.slice(-60).map((candle) => ({
              at: candle.at,
              o: trim(candle.open, 8),
              h: trim(candle.high, 8),
              l: trim(candle.low, 8),
              c: trim(candle.close, 8),
            })),
          };
        }
        const asset = this.requireAsset(symbol);
        return {
          symbol,
          kind: 'price_series' as const,
          capturedAt: asset.updatedAt,
          points: asset.priceHistory.slice(-60).map((point) => ({
            at: point.at,
            c: trim(point.price, 8),
          })),
        };
      },
    };
  }

  private volumeProfile(): AppTool<typeof symbolInput> {
    return {
      name: 'get_volume_profile',
      description:
        'Where leverage is resting by price — the liquidation heatmap summed down a price axis. Available only for symbols the application captures a heatmap for.',
      domain: 'market',
      capability: 'market.read',
      level: 'READ',
      parameters: symbolInput,
      timeoutMs: 5_000,
      label: (input, context) =>
        `Reading the ${this.resolveSymbol(input.symbol, context.selectedSymbol)} liquidity map`,
      summary: (output) => {
        const row = output as { levels: unknown[] };
        return `${row.levels.length} price levels`;
      },
      references: (output) => {
        const row = output as { symbol: string; capturedAt: string };
        return [
          marketReference({
            title: `${row.symbol} liquidity map`,
            symbol: row.symbol,
            surface: 'derivatives.liquidityMap',
            capturedAt: row.capturedAt,
          }),
        ];
      },
      execute: async (input, { run }) => {
        const symbol = this.resolveSymbol(input.symbol, run.selectedSymbol);
        const map = this.derivatives.liquidityMap(symbol);
        if (!map) {
          throw new AgentError(
            'tool_unavailable',
            `No liquidity map for ${symbol}. Available: ${this.derivatives.mappedSymbols.join(', ') || 'none'}.`,
          );
        }
        // The heaviest levels are the answer; the rest is noise at this budget.
        const levels = map.profile
          .slice()
          .sort((a, b) => b.usd - a.usd)
          .slice(0, 12)
          .sort((a, b) => a.price - b.price)
          .map((level) => ({ price: trim(level.price, 8), usd: trim(level.usd, 5) }));
        return {
          symbol,
          capturedAt: map.capturedAt,
          price: trim(map.price, 8),
          rangeLow: trim(map.rangeLow, 8),
          rangeHigh: trim(map.rangeHigh, 8),
          levels,
        };
      },
    };
  }

  private session(): AppTool<z.ZodObject<Record<string, never>>> {
    return {
      name: 'get_session_information',
      description:
        'Which FX trading sessions are open right now, which overlap, and when the next one opens.',
      domain: 'market',
      capability: 'market.read',
      level: 'READ',
      parameters: z.object({}),
      timeoutMs: 2_000,
      label: () => 'Checking the trading session',
      summary: (output) => {
        const row = output as { open: { name: string }[] };
        return row.open.length > 0 ? row.open.map((entry) => entry.name).join(' / ') : 'all closed';
      },
      execute: async () => sessionState(),
    };
  }

  private screener(): AppTool<z.ZodObject<{ limit: z.ZodNumber }>> {
    return {
      name: 'get_market_movers',
      description:
        'The market-wide screener: the largest coins by open interest with their 24h price and funding, for market-breadth questions.',
      domain: 'market',
      capability: 'market.read',
      level: 'READ',
      parameters: z.object({
        limit: z.number().int().min(1).max(25).describe('How many rows to return.'),
      }),
      timeoutMs: 5_000,
      label: () => 'Scanning the market',
      summary: (output) => {
        const row = output as { rows: unknown[] };
        return `${row.rows.length} coins`;
      },
      references: (output) => {
        const row = output as { capturedAt: string | null };
        return [
          marketReference({
            title: 'Market screener',
            symbol: null,
            surface: 'derivatives.screener',
            capturedAt: row.capturedAt,
          }),
        ];
      },
      execute: async (input) => {
        const market = this.derivatives.market;
        if (!market) throw new AgentError('context_unavailable', 'No market snapshot yet.');
        return {
          capturedAt: this.derivatives.capturedAt,
          totalOpenInterestUsd: trim(market.openInterestUsd, 6),
          liquidationUsd24h: trim(market.liquidationUsd24h, 6),
          rows: market.screener.slice(0, input.limit).map((entry) => ({
            symbol: entry.symbol,
            price: trim(entry.price, 8),
            changePercent24h: trim(entry.priceChangePercent24h),
            openInterestUsd: trim(entry.openInterestUsd, 5),
            fundingRate: trim(entry.fundingRateByOpenInterest, 6),
          })),
        };
      },
    };
  }
}
