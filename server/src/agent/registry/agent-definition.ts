import type { Capability } from '../permissions/permission';
import type { ModelRole } from '../settings/ai-settings.types';

/**
 * What an agent *is*, declared as data.
 *
 * No `new Agent()` appears outside the factory. A specialist is a definition
 * registered at startup; the factory turns it into a runnable agent for one
 * run, with that run's context, permissions and model. That separation is what
 * makes "add a specialist" a one-file change, and what keeps a controller from
 * quietly constructing an agent with a capability set nobody reviewed.
 */
export type AgentDefinition = {
  id: string;
  /** Shown in the panel and in handoff indicators. */
  name: string;
  /** One line; also what the orchestrator reads when deciding to delegate. */
  description: string;
  instructions: string;
  /** The capabilities this agent may ever hold. Settings can only narrow it. */
  capabilities: Capability[];
  /** Restrict to specific tools; omit to allow every tool its capabilities cover. */
  tools?: string[];
  /** Which configured model slot it prefers. */
  modelRole: ModelRole;
  /** Specialists it can call and get an answer back from, without losing the thread. */
  agentTools?: AgentToolBinding[];
  /** Specialists it can hand the conversation over to entirely. */
  handoffs?: string[];
  /** True when a user can select it directly in the panel. */
  userFacing: boolean;
  /**
   * Attach the provider's own hosted web search when the model supports one.
   * Our `web_search` tool stays available either way.
   */
  allowHostedWebSearch?: boolean;
  /** Suggestions the panel offers on an empty conversation. */
  starters?: string[];
};

export type AgentToolBinding = {
  agentId: string;
  /** The name the orchestrator calls it by. */
  toolName: string;
  description: string;
};

export type AgentSummary = {
  id: string;
  name: string;
  description: string;
  capabilities: Capability[];
  modelRole: ModelRole;
  userFacing: boolean;
  starters: string[];
  /** Resolved from settings: which provider/model it will actually run on. */
  model: { providerId: string; modelId: string } | null;
  fallbackModel: { providerId: string; modelId: string } | null;
  enabled: boolean;
  toolNames: string[];
};

export const AGENT_DEFINITIONS = Symbol('AGENT_DEFINITIONS');
