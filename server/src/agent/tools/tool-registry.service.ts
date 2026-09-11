import { randomUUID } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';
import { tool, type Tool } from '@openai/agents';

import { AgentError, normalizeError } from '../agent.errors';
import type { AgentToolRun } from '../agent.events';
import type { AgentRunContext } from '../context/agent-run-context';
import { decide, type Capability } from '../permissions/permission';
import type { RunSink } from '../runtime/run-sink';
import {
  APP_TOOL_PROVIDERS,
  type AnyAppTool,
  type AppToolProvider,
  type AppToolSummary,
} from './tool-definition';

/**
 * Where an application capability becomes something a model can call.
 *
 * Everything that must happen around *every* tool call happens here, once:
 * authorization, argument validation, a deadline, cancellation, the events the
 * UI renders, the references a citation can resolve to, and error
 * normalization. A tool author writes none of it.
 *
 * Tools are built per run, because what they close over is per run — the
 * caller's context, the granted capabilities, the event sink and the citation
 * collector. Construction is local and cheap; nothing here touches the network.
 */
@Injectable()
export class AgentToolRegistry {
  private readonly logger = new Logger(AgentToolRegistry.name);
  private readonly tools = new Map<string, AnyAppTool>();

  constructor(@Inject(APP_TOOL_PROVIDERS) providers: AppToolProvider[]) {
    for (const provider of providers) {
      for (const definition of provider.tools()) this.register(definition);
    }
  }

  register(definition: AnyAppTool): void {
    if (this.tools.has(definition.name)) {
      this.logger.warn(`tool "${definition.name}" registered twice; keeping the first`);
      return;
    }
    this.tools.set(definition.name, definition);
  }

  get(name: string): AnyAppTool | null {
    return this.tools.get(name) ?? null;
  }

  all(): AnyAppTool[] {
    return [...this.tools.values()];
  }

  summaries(): AppToolSummary[] {
    return this.all()
      .map((definition) => ({
        name: definition.name,
        description: definition.description,
        domain: definition.domain,
        capability: definition.capability,
        level: definition.level,
        timeoutMs: definition.timeoutMs,
      }))
      .sort((a, b) => a.domain.localeCompare(b.domain) || a.name.localeCompare(b.name));
  }

  /** The tools an agent with this capability set is even told about. */
  allowedFor(granted: readonly Capability[], only?: readonly string[]): AnyAppTool[] {
    return this.all().filter((definition) => {
      if (only && !only.includes(definition.name)) return false;
      return decide(definition.capability, definition.level, granted).allowed;
    });
  }

  /**
   * Build the Agents SDK tools for one run.
   *
   * The capability filter is applied twice on purpose: once when choosing what
   * to expose, and once inside `execute`. The first keeps the model from seeing
   * capabilities it does not hold; the second means that even a replayed or
   * hand-crafted tool call cannot reach past the grant, because authorization
   * does not depend on what the model was shown.
   */
  buildSdkTools(
    context: AgentRunContext,
    granted: readonly Capability[],
    sink: RunSink,
    only?: readonly string[],
  ): Tool<unknown>[] {
    return this.allowedFor(granted, only).map((definition) =>
      this.wrap(definition, context, granted, sink),
    );
  }

  private wrap(
    definition: AnyAppTool,
    context: AgentRunContext,
    granted: readonly Capability[],
    sink: RunSink,
  ): Tool<unknown> {
    // Decided once here for the SDK's own gate, and again inside `execute`:
    // the grant can be edited between building the agent and the model calling
    // the tool, and the second check is the one that actually protects data.
    const upfront = decide(definition.capability, definition.level, granted);

    return tool({
      name: definition.name,
      description: definition.description,
      parameters: definition.parameters,
      strict: true,
      needsApproval: upfront.allowed ? upfront.needsApproval : false,
      execute: async (input: unknown, runContext) => {
        void runContext;
        const decision = decide(definition.capability, definition.level, granted);
        if (!decision.allowed) {
          throw new AgentError('permission_denied', decision.reason);
        }

        const id = `tr_${randomUUID().slice(0, 12)}`;
        const startedAt = new Date();
        const typed = input as never;
        const label = safeLabel(definition, typed, context);

        const started: AgentToolRun = {
          id,
          tool: definition.name,
          label,
          status: 'running',
          startedAt: startedAt.toISOString(),
          input: context.debug ? input : undefined,
        };
        sink.emit({ type: 'TOOL_STARTED', runId: context.runId, run: started });

        // The tool's own deadline, composed with the run's stop signal so that
        // pressing stop cancels in-flight work rather than orphaning it.
        const deadline = new AbortController();
        const timer = setTimeout(
          () => deadline.abort(new AgentError('tool_timeout')),
          definition.timeoutMs,
        );
        const onStop = () => deadline.abort(sink.signal.reason);
        sink.signal.addEventListener('abort', onStop, { once: true });

        try {
          const raw = await definition.execute(typed, { run: context, signal: deadline.signal });
          const durationMs = Date.now() - startedAt.getTime();

          // References are taken from the *raw* result, before the internal
          // fields are stripped: a tool hands the citation layer the provider
          // objects and the model only the summary.
          for (const reference of definition.references?.(raw) ?? []) {
            const entry = sink.citations.add(reference);
            sink.emit({
              type: 'REFERENCE_ADDED',
              runId: context.runId,
              reference,
              citationIndex: entry.citationIndex,
            });
          }

          const visible = stripInternal(raw);
          const completed: AgentToolRun = {
            ...started,
            status: 'completed',
            durationMs,
            summary: safeSummary(definition, raw),
            input: context.debug ? input : undefined,
            output: context.debug ? visible : undefined,
          };
          sink.emit({ type: 'TOOL_COMPLETED', runId: context.runId, run: completed });
          sink.countToolCall(false);

          return JSON.stringify(visible ?? null);
        } catch (error) {
          const durationMs = Date.now() - startedAt.getTime();
          const normalized = normalizeError(
            deadline.signal.aborted && !sink.signal.aborted ? new AgentError('tool_timeout') : error,
            context.debug,
          );
          sink.emit({
            type: 'TOOL_FAILED',
            runId: context.runId,
            run: {
              ...started,
              status: 'failed',
              durationMs,
              error: normalized,
              input: context.debug ? input : undefined,
            },
          });
          sink.countToolCall(true);
          this.logger.warn(`tool ${definition.name} failed: ${normalized.code}`);

          // Returned rather than thrown: a model that hears "that source is
          // unavailable" can say so or try another route, where a thrown error
          // ends the run with nothing useful on screen.
          return JSON.stringify({ error: normalized.code, message: normalized.message });
        } finally {
          clearTimeout(timer);
          sink.signal.removeEventListener('abort', onStop);
        }
      },
    }) as Tool<unknown>;
  }
}

/**
 * Drop `_`-prefixed keys before a result reaches the model.
 *
 * Tools return their provider objects alongside the model-facing summary so the
 * citation layer can build real references from real data. Those objects are
 * large and redundant to the model, so they travel under an underscore and stop
 * here.
 */
export function stripInternal(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripInternal);
  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (key.startsWith('_')) continue;
      output[key] = stripInternal(entry);
    }
    return output;
  }
  return value;
}

function safeLabel(definition: AnyAppTool, input: never, context: AgentRunContext): string {
  try {
    return definition.label(input, context);
  } catch {
    return definition.name.replace(/_/g, ' ');
  }
}

function safeSummary(definition: AnyAppTool, output: unknown): string | undefined {
  try {
    return definition.summary?.(output);
  } catch {
    return undefined;
  }
}
