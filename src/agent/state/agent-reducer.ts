import type {
  AgentConversation,
  AgentEvent,
  AgentMessage,
  AgentMessageReference,
  AgentToolRun,
  ModelRef,
  NormalizedAgentError,
} from '@/agent/protocol';

/**
 * The one place a stream of events becomes something React can render.
 *
 * Components read this state and nothing else. They never see the transport,
 * never see a provider's chunk format, and never have to know that a tool card
 * and a token delta arrive through the same channel — which is exactly the
 * coupling that makes streaming UIs rot.
 */

export type StreamingMessage = AgentMessage & {
  /** True while tokens are still arriving for this message. */
  streaming: boolean;
};

export type FallbackNotice = { from: ModelRef; to: ModelRef; reason: NormalizedAgentError };

export type AgentState = {
  conversation: AgentConversation | null;
  messages: StreamingMessage[];
  status: 'idle' | 'loading' | 'streaming';
  runId: string | null;
  /** A short progress line: "Thinking", "Research is working". */
  statusText: string | null;
  error: NormalizedAgentError | null;
  /** Recorded rather than hidden, and surfaced in run details. */
  fallback: FallbackNotice | null;
  activeAgentName: string | null;
  /** Set when a specialist took over the conversation mid-run. */
  handoff: { from: string; to: string } | null;
};

export const initialAgentState: AgentState = {
  conversation: null,
  messages: [],
  status: 'idle',
  runId: null,
  statusText: null,
  error: null,
  fallback: null,
  activeAgentName: null,
  handoff: null,
};

export type AgentAction =
  | { type: 'reset' }
  | { type: 'conversation'; conversation: AgentConversation | null }
  | { type: 'messages'; messages: AgentMessage[] }
  | { type: 'loading' }
  | { type: 'optimistic-user'; message: StreamingMessage }
  | { type: 'event'; event: AgentEvent }
  | { type: 'local-error'; error: NormalizedAgentError }
  | { type: 'clear-error' };

export function agentReducer(state: AgentState, action: AgentAction): AgentState {
  switch (action.type) {
    case 'reset':
      return { ...initialAgentState };

    case 'conversation':
      return { ...state, conversation: action.conversation };

    case 'messages':
      return {
        ...state,
        messages: action.messages.map((message) => ({ ...message, streaming: false })),
      };

    case 'loading':
      return { ...state, status: 'loading', error: null, fallback: null, handoff: null };

    case 'optimistic-user':
      // Echo the user's own words immediately. Waiting for the server to
      // confirm them makes the composer feel broken on a slow connection.
      return { ...state, messages: [...state.messages, action.message], error: null };

    case 'local-error':
      return { ...state, status: 'idle', runId: null, statusText: null, error: action.error };

    case 'clear-error':
      return { ...state, error: null };

    case 'event':
      return applyEvent(state, action.event);

    default:
      return state;
  }
}

function applyEvent(state: AgentState, event: AgentEvent): AgentState {
  switch (event.type) {
    case 'RUN_STARTED':
      return {
        ...state,
        status: 'streaming',
        runId: event.runId,
        statusText: null,
        error: null,
        messages: [...state.messages, placeholder(event.runId, event.conversationId, event.agentId)],
      };

    case 'AGENT_STARTED':
      return { ...state, activeAgentName: event.agentName };

    case 'MODEL_STARTED':
      return withPlaceholder(state, event.runId, (message) => ({ ...message, model: event.model }));

    case 'MODEL_FALLBACK':
      return {
        // A fallback restarts the answer, so anything already drafted is void.
        ...withPlaceholder(state, event.runId, (message) => ({ ...message, text: '' })),
        fallback: { from: event.from, to: event.to, reason: event.reason },
      };

    case 'TEXT_DELTA':
      return withPlaceholder(state, event.runId, (message) => ({
        ...message,
        text: message.text + event.delta,
      }));

    case 'STATUS':
      return { ...state, statusText: event.text };

    case 'TOOL_STARTED':
    case 'TOOL_COMPLETED':
    case 'TOOL_FAILED':
      return withPlaceholder(state, event.runId, (message) => ({
        ...message,
        toolRuns: upsertTool(message.toolRuns, event.run),
      }));

    case 'REFERENCE_ADDED':
      return withPlaceholder(state, event.runId, (message) => ({
        ...message,
        references: upsertReference(message.references, {
          ...event.reference,
          citationIndex: event.citationIndex,
        }),
      }));

    case 'HANDOFF':
      return { ...state, handoff: { from: event.from, to: event.to }, activeAgentName: event.to };

    case 'MESSAGE_COMPLETED':
      return {
        ...state,
        statusText: null,
        messages: state.messages.map((message) =>
          message.id === placeholderId(event.runId)
            ? {
                ...message,
                id: event.messageId,
                // The server's text is authoritative: it is the sanitised copy,
                // with any citation the model invented already removed.
                text: event.text,
                references: event.references,
                toolRuns: event.toolRuns,
                model: event.model,
                agentId: event.agentId,
                streaming: false,
              }
            : message,
        ),
      };

    case 'RUN_COMPLETED':
    case 'RUN_CANCELLED':
      return { ...state, ...settle(state), status: 'idle', runId: null, statusText: null };

    case 'RUN_FAILED':
      return {
        ...state,
        status: 'idle',
        runId: null,
        statusText: null,
        error: event.error,
        // Keep a partial answer if one exists; drop an empty bubble, which
        // would otherwise sit under the error saying nothing.
        messages: state.messages.filter(
          (message) => !(message.streaming && message.text.trim() === ''),
        ),
      };

    default:
      return state;
  }
}

function settle(state: AgentState): Partial<AgentState> {
  return {
    messages: state.messages
      .map((message) => (message.streaming ? { ...message, streaming: false } : message))
      .filter((message) => message.role !== 'assistant' || message.text.trim() !== '' || message.toolRuns.length > 0),
  };
}

function withPlaceholder(
  state: AgentState,
  runId: string,
  update: (message: StreamingMessage) => StreamingMessage,
): AgentState {
  const id = placeholderId(runId);
  if (!state.messages.some((message) => message.id === id)) return state;
  return {
    ...state,
    messages: state.messages.map((message) => (message.id === id ? update(message) : message)),
  };
}

export function placeholderId(runId: string): string {
  return `pending-${runId}`;
}

function placeholder(runId: string, conversationId: string, agentId: string): StreamingMessage {
  return {
    id: placeholderId(runId),
    conversationId,
    role: 'assistant',
    text: '',
    createdAt: new Date().toISOString(),
    agentId,
    model: null,
    references: [],
    toolRuns: [],
    attachments: [],
    error: null,
    streaming: true,
  };
}

function upsertTool(runs: AgentToolRun[], run: AgentToolRun): AgentToolRun[] {
  const index = runs.findIndex((entry) => entry.id === run.id);
  if (index === -1) return [...runs, run];
  const next = [...runs];
  next[index] = { ...next[index], ...run };
  return next;
}

function upsertReference(
  references: AgentMessageReference[],
  reference: AgentMessageReference,
): AgentMessageReference[] {
  if (references.some((entry) => entry.id === reference.id)) return references;
  return [...references, reference];
}
