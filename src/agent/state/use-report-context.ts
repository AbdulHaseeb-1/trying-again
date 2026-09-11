import { useEffect } from 'react';

import { useAppContext } from '@/agent/state/app-context';

/**
 * How a screen tells the assistant what it is showing.
 *
 * One hook, called from the screens that have a symbol on display. Keeping it
 * to a hook rather than prop-drilling a setter means adding a new screen to the
 * agent's awareness is a single line, and forgetting to add one degrades
 * gracefully — the agent simply asks which symbol the user means.
 */
export function useReportContext(context: {
  symbol?: string | null;
  timeframe?: string | null;
  chartId?: string | null;
  workspace?: string | null;
}): void {
  const store = useAppContext();
  const { symbol, timeframe, chartId, workspace } = context;

  const { setSelectedSymbol, setSelectedTimeframe, setChart, setWorkspace } = store;

  useEffect(() => {
    if (symbol !== undefined) setSelectedSymbol(symbol);
  }, [setSelectedSymbol, symbol]);

  useEffect(() => {
    if (timeframe !== undefined) setSelectedTimeframe(timeframe);
  }, [setSelectedTimeframe, timeframe]);

  useEffect(() => {
    if (chartId !== undefined) setChart({ id: chartId });
  }, [chartId, setChart]);

  useEffect(() => {
    if (workspace !== undefined) setWorkspace(workspace);
  }, [setWorkspace, workspace]);
}
