import type { AgentToolRun, AgentUsage, ModelRef } from './agent.events';
import type { AgentMessageReference } from './citations/reference.types';
import type { NormalizedAgentError } from './agent.errors';
import type { AgentContextAttachment } from './context/agent-run-context';

/** A stored conversation turn. The same shape the client renders. */
export type AgentMessageRole = 'user' | 'assistant' | 'system';

export type AgentMessage = {
  id: string;
  conversationId: string;
  role: AgentMessageRole;
  text: string;
  createdAt: string;
  agentId: string | null;
  model: ModelRef | null;
  references: AgentMessageReference[];
  toolRuns: AgentToolRun[];
  attachments: AgentContextAttachment[];
  error: NormalizedAgentError | null;
};

export type AgentConversation = {
  id: string;
  title: string;
  agentId: string;
  createdAt: string;
  updatedAt: string;
  pinned: boolean;
  messageCount: number;
  /** Chart/workspace context the conversation was started from. */
  context: {
    symbol: string | null;
    timeframe: string | null;
    workspace: string | null;
  };
  lastModel: ModelRef | null;
};

export type AgentRunRecord = {
  id: string;
  conversationId: string;
  agentId: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  firstTokenMs: number | null;
  usage: AgentUsage;
  model: ModelRef | null;
  fallbackFrom: ModelRef | null;
  toolCalls: number;
  toolFailures: number;
  handoffs: number;
  searchProvider: string | null;
  referenceCount: number;
  errorCode: string | null;
};
