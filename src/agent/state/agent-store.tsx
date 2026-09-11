import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  AgentApiError,
  createConversation,
  deleteConversation,
  fetchBootstrap,
  fetchMessages,
  getConversation,
  listConversations,
  sendMessage,
  stopRun,
  updateConversation,
} from '@/agent/client/agent-api';
import type {
  AgentBootstrap,
  AgentContextAttachment,
  AgentConversation,
  NormalizedAgentError,
} from '@/agent/protocol';
import { agentReducer, initialAgentState, type AgentState } from '@/agent/state/agent-reducer';
import { useAppContext } from '@/agent/state/app-context';

export type AgentStoreValue = AgentState & {
  /** Panel visibility, kept here so any surface can open it with context. */
  visible: boolean;
  bootstrap: AgentBootstrap | null;
  bootstrapError: string | null;
  agentId: string;
  conversations: AgentConversation[];
  conversationsLoading: boolean;
  attachments: AgentContextAttachment[];

  open: (options?: { attachment?: AgentContextAttachment; prompt?: string }) => void;
  close: () => void;
  /** The composer is controlled by the store, so a draft survives closing the
   *  panel and a suggested prompt is just a write. */
  draft: string;
  setDraft: (text: string) => void;
  send: (message: string) => void;
  stop: () => void;
  retry: () => void;
  newConversation: () => Promise<void>;
  selectConversation: (id: string) => Promise<void>;
  renameConversation: (id: string, title: string) => Promise<void>;
  togglePin: (id: string, pinned: boolean) => Promise<void>;
  removeConversation: (id: string) => Promise<void>;
  refreshConversations: (query?: string) => Promise<void>;
  setAgent: (agentId: string) => void;
  attach: (attachment: AgentContextAttachment) => void;
  detach: (id: string) => void;
  dismissError: () => void;
};

const AgentStoreContext = createContext<AgentStoreValue | null>(null);

export function AgentProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(agentReducer, initialAgentState);
  const [visible, setVisible] = useState(false);
  const [bootstrap, setBootstrap] = useState<AgentBootstrap | null>(null);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [agentId, setAgentId] = useState('market-assistant');
  const [conversations, setConversations] = useState<AgentConversation[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const [attachments, setAttachments] = useState<AgentContextAttachment[]>([]);
  const [draft, setDraft] = useState('');

  const appContext = useAppContext();
  const abortRef = useRef<AbortController | null>(null);
  const lastMessageRef = useRef<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      abortRef.current?.abort();
    };
  }, []);

  /**
   * Bootstrap is deferred until the panel is first opened.
   *
   * It costs a round trip and registers a device, and the overwhelming majority
   * of app launches never open the agent. Paying for it on every cold start
   * would make the whole application slower to serve a feature most sessions do
   * not use.
   */
  const loadBootstrap = useCallback(async () => {
    try {
      const next = await fetchBootstrap();
      if (!mounted.current) return;
      setBootstrap(next);
      setBootstrapError(null);
      setAgentId((current) =>
        next.agents.some((agent) => agent.id === current) ? current : next.defaultAgentId,
      );
    } catch (error) {
      if (!mounted.current) return;
      setBootstrapError(
        error instanceof AgentApiError ? error.message : 'The agent service is unavailable.',
      );
    }
  }, []);

  const refreshConversations = useCallback(async (query?: string) => {
    setConversationsLoading(true);
    try {
      const page = await listConversations({ limit: 30, q: query });
      if (mounted.current) setConversations(page.items);
    } catch {
      if (mounted.current) setConversations([]);
    } finally {
      if (mounted.current) setConversationsLoading(false);
    }
  }, []);

  const open = useCallback<AgentStoreValue['open']>(
    (options) => {
      setVisible(true);
      if (options?.attachment) {
        setAttachments((current) =>
          current.some((entry) => entry.id === options.attachment!.id)
            ? current
            : [...current, options.attachment!],
        );
      }
      if (options?.prompt) setDraft(options.prompt);
      if (!bootstrap) void loadBootstrap();
      void refreshConversations();
    },
    [bootstrap, loadBootstrap, refreshConversations],
  );

  const close = useCallback(() => setVisible(false), []);

  const newConversation = useCallback(async () => {
    abortRef.current?.abort();
    dispatch({ type: 'reset' });
    setAttachments([]);
    setDraft('');
  }, []);

  /**
   * Open a stored conversation.
   *
   * Both the conversation and its messages are re-read from the server rather
   * than taken from the cached list: the list can be minutes old, and a
   * conversation that has since been renamed or continued on another device
   * should open as it is now, not as it was when the list was fetched.
   */
  const selectConversation = useCallback(async (id: string) => {
    abortRef.current?.abort();
    dispatch({ type: 'reset' });
    dispatch({ type: 'loading' });
    try {
      const [conversation, { messages }] = await Promise.all([
        getConversation(id),
        fetchMessages(id, { limit: 100 }),
      ]);
      if (!mounted.current) return;
      dispatch({ type: 'conversation', conversation });
      setAgentId(conversation.agentId);
      dispatch({ type: 'messages', messages });
    } catch (error) {
      if (!mounted.current) return;
      dispatch({ type: 'local-error', error: toError(error) });
    }
  }, []);

  const runTurn = useCallback(
    async (text: string, conversation: AgentConversation) => {
      const controller = new AbortController();
      abortRef.current = controller;
      lastMessageRef.current = text;

      dispatch({
        type: 'optimistic-user',
        message: {
          id: `local-${Date.now()}`,
          conversationId: conversation.id,
          role: 'user',
          text,
          createdAt: new Date().toISOString(),
          agentId,
          model: null,
          references: [],
          toolRuns: [],
          attachments,
          error: null,
          streaming: false,
        },
      });

      try {
        for await (const event of sendMessage(
          conversation.id,
          {
            message: text,
            agentId,
            attachments,
            context: appContext.snapshot(),
          },
          controller.signal,
        )) {
          if (!mounted.current) return;
          dispatch({ type: 'event', event });
        }
        // Attachments are per-question, not per-conversation: leaving them
        // pinned would silently apply them to every later turn.
        setAttachments([]);
        void refreshConversations();
      } catch (error) {
        if (!mounted.current) return;
        if (controller.signal.aborted) return;
        dispatch({ type: 'local-error', error: toError(error) });
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [agentId, appContext, attachments, refreshConversations],
  );

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || state.status !== 'idle') return;
      setDraft('');

      void (async () => {
        let conversation = state.conversation;
        if (!conversation) {
          try {
            conversation = await createConversation({
              agentId,
              context: appContext.snapshot() as unknown as Record<string, unknown>,
            });
            if (!mounted.current) return;
            dispatch({ type: 'conversation', conversation });
          } catch (error) {
            dispatch({ type: 'local-error', error: toError(error) });
            return;
          }
        }
        await runTurn(trimmed, conversation);
      })();
    },
    [agentId, appContext, runTurn, state.conversation, state.status],
  );

  const stop = useCallback(() => {
    const runId = state.runId;
    // Abort locally first so the interface is interactive immediately; the
    // server call then cancels the work itself rather than the other way round.
    abortRef.current?.abort();
    abortRef.current = null;
    dispatch({ type: 'event', event: { type: 'RUN_CANCELLED', runId: runId ?? '', durationMs: 0 } });
    if (runId) void stopRun(runId).catch(() => undefined);
  }, [state.runId]);

  const retry = useCallback(() => {
    const text = lastMessageRef.current;
    if (!text || !state.conversation) return;
    dispatch({ type: 'clear-error' });
    void runTurn(text, state.conversation);
  }, [runTurn, state.conversation]);

  const renameConversation = useCallback(
    async (id: string, title: string) => {
      await updateConversation(id, { title });
      await refreshConversations();
      if (state.conversation?.id === id) {
        dispatch({ type: 'conversation', conversation: { ...state.conversation, title } });
      }
    },
    [refreshConversations, state.conversation],
  );

  const togglePin = useCallback(
    async (id: string, pinned: boolean) => {
      await updateConversation(id, { pinned });
      await refreshConversations();
    },
    [refreshConversations],
  );

  const removeConversation = useCallback(
    async (id: string) => {
      await deleteConversation(id);
      if (state.conversation?.id === id) dispatch({ type: 'reset' });
      await refreshConversations();
    },
    [refreshConversations, state.conversation],
  );

  const setAgent = useCallback(
    (next: string) => {
      setAgentId(next);
      if (state.conversation) {
        void updateConversation(state.conversation.id, { agentId: next }).catch(() => undefined);
      }
    },
    [state.conversation],
  );

  const value = useMemo<AgentStoreValue>(
    () => ({
      ...state,
      visible,
      bootstrap,
      bootstrapError,
      agentId,
      conversations,
      conversationsLoading,
      attachments,
      draft,
      setDraft,
      open,
      close,
      send,
      stop,
      retry,
      newConversation,
      selectConversation,
      renameConversation,
      togglePin,
      removeConversation,
      refreshConversations,
      setAgent,
      attach: (attachment) =>
        setAttachments((current) =>
          current.some((entry) => entry.id === attachment.id) ? current : [...current, attachment],
        ),
      detach: (id) => setAttachments((current) => current.filter((entry) => entry.id !== id)),
      dismissError: () => dispatch({ type: 'clear-error' }),
    }),
    [
      agentId,
      attachments,
      bootstrap,
      bootstrapError,
      close,
      conversations,
      conversationsLoading,
      draft,
      newConversation,
      open,
      refreshConversations,
      removeConversation,
      renameConversation,
      retry,
      selectConversation,
      send,
      setAgent,
      state,
      stop,
      togglePin,
      visible,
    ],
  );

  return <AgentStoreContext.Provider value={value}>{children}</AgentStoreContext.Provider>;
}

export function useAgentStore(): AgentStoreValue {
  const store = useContext(AgentStoreContext);
  if (!store) throw new Error('useAgentStore must be used within AgentProvider.');
  return store;
}

function toError(error: unknown): NormalizedAgentError {
  if (error instanceof AgentApiError) {
    return {
      code: error.code ?? 'internal',
      message: error.message,
      retryable: error.status === undefined || error.status >= 500,
    };
  }
  return { code: 'internal', message: 'Something went wrong.', retryable: true };
}
