import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

import type { AgentContextAttachment } from '@/agent/protocol';

/**
 * What the user is looking at, as one small store.
 *
 * Before this existed, "the selected symbol" was `useState` inside the
 * derivatives screen and nothing outside that screen could know it. The agent
 * needs it, the composer needs it to offer a context chip, and a conversation
 * records it — so it belongs one level up.
 *
 * It stays deliberately thin: pointers, not data. No snapshot, no candles, no
 * news bodies. Those are read through tools, at the moment they are needed.
 */
export type AppContextValue = {
  selectedSymbol: string | null;
  selectedTimeframe: string | null;
  activeChartId: string | null;
  visibleTimeRange: { from: string; to: string } | null;
  activeWorkspace: string | null;
  setSelectedSymbol: (symbol: string | null) => void;
  setSelectedTimeframe: (timeframe: string | null) => void;
  setChart: (chart: { id: string | null; range?: { from: string; to: string } | null }) => void;
  setWorkspace: (workspace: string | null) => void;
  /** The chips the composer offers for whatever is on screen right now. */
  suggestedAttachments: () => AgentContextAttachment[];
  /** The payload sent with a run — the pointer set, nothing more. */
  snapshot: () => {
    selectedSymbol: string | null;
    selectedTimeframe: string | null;
    activeChartId: string | null;
    visibleTimeRange: { from: string; to: string } | null;
    activeWorkspace: string | null;
    locale: string;
    timezone: string;
  };
};

const AppContextStore = createContext<AppContextValue | null>(null);

export function AppContextProvider({ children }: { children: ReactNode }) {
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [selectedTimeframe, setSelectedTimeframe] = useState<string | null>(null);
  const [activeChartId, setActiveChartId] = useState<string | null>(null);
  const [visibleTimeRange, setVisibleTimeRange] = useState<{ from: string; to: string } | null>(
    null,
  );
  const [activeWorkspace, setWorkspace] = useState<string | null>(null);

  // Read once: resolving the zone on every render is wasted work and, on some
  // engines, surprisingly slow.
  const locale = useRef(resolveLocale()).current;
  const timezone = useRef(resolveTimezone()).current;

  const value = useMemo<AppContextValue>(() => {
    const setChart = ({
      id,
      range,
    }: {
      id: string | null;
      range?: { from: string; to: string } | null;
    }) => {
      setActiveChartId(id);
      if (range !== undefined) setVisibleTimeRange(range);
    };

    return {
      selectedSymbol,
      selectedTimeframe,
      activeChartId,
      visibleTimeRange,
      activeWorkspace,
      setSelectedSymbol,
      setSelectedTimeframe,
      setChart,
      setWorkspace,
      suggestedAttachments: () => {
        const chips: AgentContextAttachment[] = [];
        if (selectedSymbol) {
          chips.push({
            kind: 'chart',
            id: activeChartId ?? selectedSymbol,
            label: selectedTimeframe
              ? `${selectedSymbol} · ${selectedTimeframe}`
              : `${selectedSymbol} chart`,
          });
          chips.push({
            kind: 'market_snapshot',
            id: selectedSymbol,
            label: `${selectedSymbol} snapshot`,
          });
        }
        chips.push({ kind: 'session', id: 'current', label: 'Current session' });
        return chips;
      },
      snapshot: () => ({
        selectedSymbol,
        selectedTimeframe,
        activeChartId,
        visibleTimeRange,
        activeWorkspace,
        locale,
        timezone,
      }),
    };
  }, [
    activeChartId,
    activeWorkspace,
    locale,
    selectedSymbol,
    selectedTimeframe,
    timezone,
    visibleTimeRange,
  ]);

  return <AppContextStore.Provider value={value}>{children}</AppContextStore.Provider>;
}

/**
 * Usable outside the provider on purpose: a screen that sets the symbol should
 * not crash in a test or a storybook that did not wrap it.
 */
export function useAppContext(): AppContextValue {
  const context = useContext(AppContextStore);
  if (context) return context;
  return {
    selectedSymbol: null,
    selectedTimeframe: null,
    activeChartId: null,
    visibleTimeRange: null,
    activeWorkspace: null,
    setSelectedSymbol: () => undefined,
    setSelectedTimeframe: () => undefined,
    setChart: () => undefined,
    setWorkspace: () => undefined,
    suggestedAttachments: () => [],
    snapshot: () => ({
      selectedSymbol: null,
      selectedTimeframe: null,
      activeChartId: null,
      visibleTimeRange: null,
      activeWorkspace: null,
      locale: resolveLocale(),
      timezone: resolveTimezone(),
    }),
  };
}

function resolveTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function resolveLocale(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || 'en';
  } catch {
    return 'en';
  }
}
