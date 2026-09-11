import type { z } from 'zod';

import type { AgentReference } from '../citations/reference.types';
import type { AgentRunContext } from '../context/agent-run-context';
import type { Capability, PermissionLevel } from '../permissions/permission';

/**
 * What an application capability looks like to an agent.
 *
 * Agents do not get database access; they get these. Every one declares its
 * schema, its permission, its timeout and — importantly — how to describe
 * itself in one line, because the chat shows "Reading BTC market data…" rather
 * than a JSON blob.
 *
 * Adding a capability is writing one of these and registering it. Nothing in
 * the runtime, the factory or the UI needs to learn its name.
 */
export type AppToolContext = {
  run: AgentRunContext;
  /** Cancelled when the user presses stop, or when the tool's deadline passes. */
  signal: AbortSignal;
};

export type AppTool<TInput extends z.ZodTypeAny = z.ZodTypeAny, TOutput = unknown> = {
  /** Snake case, because that is what models are trained to call. */
  name: string;
  description: string;
  /** Grouping for the settings UI: market, chart, news, app, web. */
  domain: string;
  capability: Capability;
  level: PermissionLevel;
  parameters: TInput;
  timeoutMs: number;

  /** The line the chat shows while it runs. Present tense, no trailing period. */
  label: (input: z.infer<TInput>, context: AgentRunContext) => string;
  /** One line shown when the card is collapsed after it finishes. */
  summary?: (output: TOutput) => string;
  /**
   * Sources this call produced. The *only* way a citation comes into existence:
   * a reference the UI renders always traces back to data a tool returned.
   */
  references?: (output: TOutput) => AgentReference[];

  execute: (input: z.infer<TInput>, context: AppToolContext) => Promise<TOutput>;
};

/** Any tool, for the registry's purposes. */
export type AnyAppTool = AppTool<z.ZodTypeAny, unknown>;

/** A module contributing tools. Collected by the registry through one token. */
export interface AppToolProvider {
  tools(): AnyAppTool[];
}

export const APP_TOOL_PROVIDERS = Symbol('APP_TOOL_PROVIDERS');

/** What Settings → Tools renders. */
export type AppToolSummary = {
  name: string;
  description: string;
  domain: string;
  capability: Capability;
  level: PermissionLevel;
  timeoutMs: number;
};
