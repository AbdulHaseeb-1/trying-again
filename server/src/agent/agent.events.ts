import type { NormalizedAgentError } from './agent.errors';
import type { AgentMessageReference, AgentReference } from './citations/reference.types';

/**
 * The one protocol between the runtime and any client.
 *
 * The Agents SDK emits provider-shaped streams; React components must never
 * see one. Everything a run can do is flattened into the discriminated union
 * below, serialised as newline-delimited JSON, and rendered by a reducer that
 * knows nothing about OpenAI, Anthropic or the AI SDK.
 */

export type AgentEventType =
  | 'RUN_STARTED'
  | 'AGENT_STARTED'
  | 'MODEL_STARTED'
  | 'MODEL_FALLBACK'
  | 'TEXT_DELTA'
  | 'STATUS'
  | 'TOOL_STARTED'
  | 'TOOL_COMPLETED'
  | 'TOOL_FAILED'
  | 'HANDOFF'
  | 'REFERENCE_ADDED'
  | 'MESSAGE_COMPLETED'
  | 'RUN_COMPLETED'
  | 'RUN_FAILED'
  | 'RUN_CANCELLED';

export type ModelRef = { providerId: string; providerName: string; modelId: string };

export type AgentToolStatus = 'running' | 'completed' | 'failed';

export type AgentToolRun = {
  id: string;
  tool: string;
  /** "Searching news…" — what the chat shows before anyone expands it. */
  label: string;
  status: AgentToolStatus;
  startedAt: string;
  durationMs?: number;
  /** One line of what came back: "12 articles". Never the payload. */
  summary?: string;
  /** Debug mode only. */
  input?: unknown;
  output?: unknown;
  error?: NormalizedAgentError;
};

export type AgentUsage = {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type AgentEvent =
  | { type: 'RUN_STARTED'; runId: string; conversationId: string; agentId: string; at: string }
  | { type: 'AGENT_STARTED'; runId: string; agentId: string; agentName: string; at: string }
  | { type: 'MODEL_STARTED'; runId: string; model: ModelRef; at: string }
  | {
      type: 'MODEL_FALLBACK';
      runId: string;
      from: ModelRef;
      to: ModelRef;
      reason: NormalizedAgentError;
      at: string;
    }
  | { type: 'TEXT_DELTA'; runId: string; messageId: string; delta: string }
  /** A short human-readable progress line, e.g. while a specialist is thinking. */
  | { type: 'STATUS'; runId: string; text: string }
  | { type: 'TOOL_STARTED'; runId: string; run: AgentToolRun }
  | { type: 'TOOL_COMPLETED'; runId: string; run: AgentToolRun }
  | { type: 'TOOL_FAILED'; runId: string; run: AgentToolRun }
  | { type: 'HANDOFF'; runId: string; from: string; to: string; at: string }
  | { type: 'REFERENCE_ADDED'; runId: string; reference: AgentReference; citationIndex: number }
  | {
      type: 'MESSAGE_COMPLETED';
      runId: string;
      messageId: string;
      text: string;
      references: AgentMessageReference[];
      toolRuns: AgentToolRun[];
      model: ModelRef | null;
      agentId: string;
    }
  | { type: 'RUN_COMPLETED'; runId: string; usage: AgentUsage; durationMs: number }
  | { type: 'RUN_FAILED'; runId: string; error: NormalizedAgentError; durationMs: number }
  | { type: 'RUN_CANCELLED'; runId: string; durationMs: number };

/** Newline-delimited JSON — one event per line, flushed as it happens. */
export function encodeEvent(event: AgentEvent): string {
  return `${JSON.stringify(event)}\n`;
}
