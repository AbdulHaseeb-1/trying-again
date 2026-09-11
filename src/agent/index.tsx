import { useCallback, type ReactNode } from 'react';

import type { AgentContextAttachment } from '@/agent/protocol';
import { AgentProvider, useAgentStore } from '@/agent/state/agent-store';
import { AppContextProvider } from '@/agent/state/app-context';
import { AgentPanel } from '@/agent/ui/agent-panel';

/**
 * The agent subsystem's single mounting point.
 *
 * Wraps the application once, in the root layout, and supplies three things:
 * the workspace context store (what the user is looking at), the conversation
 * store, and the panel itself. Any screen can then open the assistant with
 * context attached, without knowing how any of it works.
 */
export function AgentWorkspaceProvider({ children }: { children: ReactNode }) {
  return (
    <AppContextProvider>
      <AgentProvider>
        {children}
        <AgentPanel />
      </AgentProvider>
    </AppContextProvider>
  );
}

export type AgentPanelControls = {
  openAgent: (options?: { attachment?: AgentContextAttachment; prompt?: string }) => void;
  closeAgent: () => void;
  /** Open the panel pointed at one news item, with the article already attached. */
  analyzeNews: (item: { id: string; title: string }) => void;
  /** Open the panel pointed at one economic release. */
  analyzeRelease: (event: { id: string; title: string; currency?: string }) => void;
};

/**
 * The control surface other screens use.
 *
 * Deliberately narrow: open, close, and two "look at this" entry points. A
 * screen should not be able to drive a conversation — that is the panel's job —
 * but it should be able to hand the assistant the thing the user is staring at.
 */
export function useAgentPanel(): AgentPanelControls {
  const store = useAgentStore();

  const analyzeNews = useCallback(
    (item: { id: string; title: string }) => {
      store.open({
        attachment: { kind: 'news', id: item.id, label: item.title },
        prompt: `What does this mean for the market: "${item.title}"?`,
      });
    },
    [store],
  );

  const analyzeRelease = useCallback(
    (event: { id: string; title: string; currency?: string }) => {
      const label = event.currency ? `${event.currency} ${event.title}` : event.title;
      store.open({
        attachment: { kind: 'calendar_event', id: event.id, label },
        prompt: `Brief me on ${label} — what it measures, what printed, and what it implies.`,
      });
    },
    [store],
  );

  return { openAgent: store.open, closeAgent: store.close, analyzeNews, analyzeRelease };
}

export { useAppContext } from '@/agent/state/app-context';
export { useAgentStore } from '@/agent/state/agent-store';
