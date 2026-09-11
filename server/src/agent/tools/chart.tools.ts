import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import { DerivativesService } from '../../derivatives/derivatives.service';
import { AgentError } from '../agent.errors';
import type { AnyAppTool, AppTool, AppToolProvider } from './tool-definition';
import { chartReference, trim } from './tool-support';

const empty = z.object({});

/**
 * What the user is actually looking at.
 *
 * The run context carries pointers — a symbol, a timeframe, a visible range —
 * and these tools turn a pointer into data. Keeping them as tools rather than
 * inlining the chart state into every prompt is what keeps the prompt small and
 * the numbers current: an agent that asks reads the state as it is now, not as
 * it was when the request was assembled.
 */
@Injectable()
export class ChartTools implements AppToolProvider {
  constructor(private readonly derivatives: DerivativesService) {}

  tools(): AnyAppTool[] {
    return [
      this.currentChart(),
      this.visibleRange(),
      this.selectedSymbol(),
      this.selectedTimeframe(),
    ] as AnyAppTool[];
  }

  private currentChart(): AppTool<typeof empty> {
    return {
      name: 'get_current_chart',
      description:
        'The chart on screen: its symbol, timeframe, visible range, and the live price for that symbol.',
      domain: 'chart',
      capability: 'chart.read',
      level: 'READ',
      parameters: empty,
      timeoutMs: 3_000,
      label: () => 'Checking the current chart',
      summary: (output) => {
        const row = output as { symbol: string | null; timeframe: string | null };
        if (!row.symbol) return 'no chart open';
        return row.timeframe ? `${row.symbol} · ${row.timeframe}` : row.symbol;
      },
      references: (output) => {
        const row = output as { symbol: string | null; chartId: string | null; capturedAt: string | null };
        if (!row.symbol) return [];
        return [
          chartReference({
            title: `${row.symbol} chart`,
            symbol: row.symbol,
            chartId: row.chartId,
            capturedAt: row.capturedAt,
          }),
        ];
      },
      execute: async (_input, { run }) => {
        const symbol = run.selectedSymbol;
        const asset = symbol ? this.derivatives.asset(symbol) : null;
        return {
          chartId: run.activeChartId,
          symbol,
          timeframe: run.selectedTimeframe,
          visibleTimeRange: run.visibleTimeRange,
          workspace: run.activeWorkspace,
          price: trim(asset?.summary.price ?? null, 8),
          changePercent24h: trim(asset?.summary.priceChangePercent24h ?? null),
          capturedAt: asset?.updatedAt ?? null,
          hasLiquidityMap: symbol ? this.derivatives.mappedSymbols.includes(symbol) : false,
        };
      },
    };
  }

  private visibleRange(): AppTool<typeof empty> {
    return {
      name: 'get_visible_chart_range',
      description: 'The time window currently visible on the chart, if the client reported one.',
      domain: 'chart',
      capability: 'chart.read',
      level: 'READ',
      parameters: empty,
      timeoutMs: 2_000,
      label: () => 'Reading the visible chart range',
      summary: (output) => {
        const row = output as { from: string | null };
        return row.from ? `from ${row.from.slice(0, 16)}` : 'no range reported';
      },
      execute: async (_input, { run }) => {
        if (!run.visibleTimeRange) {
          throw new AgentError(
            'context_unavailable',
            'The client did not report a visible chart range.',
          );
        }
        return { ...run.visibleTimeRange, symbol: run.selectedSymbol };
      },
    };
  }

  private selectedSymbol(): AppTool<typeof empty> {
    return {
      name: 'get_selected_symbol',
      description: 'The symbol the user has selected, and whether the application tracks it.',
      domain: 'chart',
      capability: 'chart.read',
      level: 'READ',
      parameters: empty,
      timeoutMs: 2_000,
      label: () => 'Checking the selected symbol',
      summary: (output) => (output as { symbol: string | null }).symbol ?? 'none selected',
      execute: async (_input, { run }) => ({
        symbol: run.selectedSymbol,
        tracked: run.selectedSymbol
          ? this.derivatives.available.includes(run.selectedSymbol.toUpperCase())
          : false,
        trackedSymbols: this.derivatives.available,
      }),
    };
  }

  private selectedTimeframe(): AppTool<typeof empty> {
    return {
      name: 'get_selected_timeframe',
      description: 'The timeframe the user has selected on the chart.',
      domain: 'chart',
      capability: 'chart.read',
      level: 'READ',
      parameters: empty,
      timeoutMs: 2_000,
      label: () => 'Checking the selected timeframe',
      summary: (output) => (output as { timeframe: string | null }).timeframe ?? 'none selected',
      execute: async (_input, { run }) => ({ timeframe: run.selectedTimeframe }),
    };
  }
}
