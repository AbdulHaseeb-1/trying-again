import { randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { RunContext, run, type Agent, type RunStreamEvent } from '@openai/agents';

import type { AgentMessage } from '../agent.domain';
import { AgentError, isFailoverWorthy, normalizeError } from '../agent.errors';
import type { AgentEvent, AgentToolRun, AgentUsage, ModelRef } from '../agent.events';
import { RunCitations } from '../citations/citation.service';
import type { AgentContextAttachment, AgentRunContext } from '../context/agent-run-context';
import { RunTelemetry } from '../observability/run-telemetry.service';
import { AgentFactory, type BuiltAgent } from '../registry/agent-factory.service';
import { AgentRegistry } from '../registry/agent-registry.service';
import type { ResolvedModel } from './model-resolver.service';
import { StoredAgentSession } from '../sessions/agent-session';
import { ConversationRepository } from '../sessions/conversation.repository';
import { AiSettingsService } from '../settings/ai-settings.service';
import { DEFAULT_AGENT_ID } from '../specialists/definitions';
import type { RunSink } from './run-sink';
import { RunRegistry } from './run-registry.service';

export type RunRequest = {
  userId: string;
  deviceId: string;
  sessionId: string;
  conversationId: string;
  agentId: string;
  message: string;
  attachments: AgentContextAttachment[];
  context: {
    selectedSymbol: string | null;
    selectedTimeframe: string | null;
    activeChartId: string | null;
    visibleTimeRange: { from: string; to: string } | null;
    activeWorkspace: string | null;
    locale: string;
    timezone: string;
  };
  /** Requested by the client; only honoured when debug mode is on in settings. */
  debug?: boolean;
};

const MAX_TURNS = 16;

/**
 * One run, start to finish.
 *
 * This is the layer the Agents SDK sits *inside*, not the other way round. The
 * SDK owns the agent loop, tool dispatch, handoffs and session replay; this
 * owns everything the product needs around it — identity, permissions, the
 * normalized event stream, citation sanitisation, failover, persistence and
 * telemetry.
 *
 * The failover rule is the one worth stating: a fallback model is tried **only
 * when nothing has been streamed yet**. Once a token has reached the user,
 * restarting on another provider would rewrite an answer they are already
 * reading, which is worse than the failure it is trying to hide.
 */
@Injectable()
export class AgentRuntime {
  private readonly logger = new Logger(AgentRuntime.name);

  constructor(
    private readonly registry: AgentRegistry,
    private readonly factory: AgentFactory,
    private readonly conversations: ConversationRepository,
    private readonly runs: RunRegistry,
    private readonly telemetry: RunTelemetry,
    private readonly settings: AiSettingsService,
  ) {}

  /**
   * Execute a turn, yielding normalized events as they happen.
   *
   * An async generator rather than a callback so back-pressure is the
   * consumer's: if the HTTP client stops reading, this stops producing.
   */
  async *stream(request: RunRequest): AsyncGenerator<AgentEvent> {
    const runId = `run_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
    const startedAt = Date.now();
    const settings = await this.settings.all();
    const debug = settings.privacy.debugMode && request.debug !== false;

    const agentId = this.registry.get(request.agentId) ? request.agentId : DEFAULT_AGENT_ID;
    const capabilities = await this.registry.capabilitiesFor(agentId);

    const context: AgentRunContext = {
      userId: request.userId,
      deviceId: request.deviceId,
      sessionId: request.sessionId,
      conversationId: request.conversationId,
      runId,
      selectedSymbol: settings.privacy.shareAppContext ? request.context.selectedSymbol : null,
      selectedTimeframe: settings.privacy.shareAppContext
        ? request.context.selectedTimeframe
        : null,
      activeChartId: settings.privacy.shareAppContext ? request.context.activeChartId : null,
      visibleTimeRange: settings.privacy.shareAppContext ? request.context.visibleTimeRange : null,
      activeWorkspace: settings.privacy.shareAppContext ? request.context.activeWorkspace : null,
      attachments: request.attachments,
      locale: request.context.locale,
      timezone: request.context.timezone,
      permissions: capabilities,
      debug,
    };

    const controller = new AbortController();
    const citations = new RunCitations();
    const queue = new EventQueue();
    const toolRuns = new Map<string, AgentToolRun>();

    const telemetry = this.telemetry.start({
      runId,
      conversationId: request.conversationId,
      agentId,
      model: null,
    });

    const sink: RunSink = {
      runId,
      citations,
      signal: controller.signal,
      emit: (event) => {
        if (event.type === 'REFERENCE_ADDED') telemetry.markReference();
        if (event.type === 'TOOL_STARTED' || event.type === 'TOOL_COMPLETED' || event.type === 'TOOL_FAILED') {
          toolRuns.set(event.run.id, event.run);
        }
        queue.push(event);
      },
      countToolCall: (failed) => telemetry.markTool(failed),
    };

    this.runs.register({
      runId,
      userId: request.userId,
      conversationId: request.conversationId,
      controller,
    });

    let text = '';
    let usage: AgentUsage = { requests: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    let activeModel: ModelRef | null = null;
    let failure: AgentError | null = null;

    try {
      yield {
        type: 'RUN_STARTED',
        runId,
        conversationId: request.conversationId,
        agentId,
        at: new Date().toISOString(),
      };

      await this.persistUserMessage(request, agentId);

      let built: BuiltAgent;
      try {
        built = await this.factory.build(agentId, context, sink);
      } catch (error) {
        throw error instanceof AgentError ? error : new AgentError('internal', undefined, String(error));
      }
      activeModel = built.model.ref;
      telemetry.markModel(built.model.ref);

      yield { type: 'AGENT_STARTED', runId, agentId, agentName: built.definition.name, at: new Date().toISOString() };
      yield { type: 'MODEL_STARTED', runId, model: built.model.ref, at: new Date().toISOString() };

      const attempts: { agent: Agent<unknown, 'text'>; model: ResolvedModel }[] = [
        { agent: built.agent, model: built.model },
      ];

      let attemptIndex = 0;
      let succeeded = false;

      while (attemptIndex < attempts.length && !succeeded) {
        const attempt = attempts[attemptIndex];
        const runContext = new RunContext(context as unknown);
        let streamedAnything = false;

        try {
          const result = await run(attempt.agent, request.message, {
            stream: true,
            context: runContext,
            signal: controller.signal,
            session: new StoredAgentSession(this.conversations, request.conversationId),
            maxTurns: MAX_TURNS,
          });

          for await (const event of merge(result, queue, controller.signal)) {
            if (isQueued(event)) {
              yield event.event;
              continue;
            }
            for (const normalized of this.translate(event.event, runId, telemetry)) {
              if (normalized.type === 'TEXT_DELTA') {
                if (!streamedAnything) {
                  streamedAnything = true;
                  telemetry.markFirstToken();
                }
                text += normalized.delta;
              }
              yield normalized;
            }
          }

          // A stopped run ends the stream cleanly rather than throwing, so the
          // check has to be explicit — otherwise a cancellation would be
          // reported as a completed answer.
          if (controller.signal.aborted) throw new AgentError('cancelled');

          await result.completed;
          if (result.error) throw result.error;
          if (controller.signal.aborted) throw new AgentError('cancelled');

          text = (result.finalOutput as string | undefined) ?? text;
          usage = readUsage(runContext);
          succeeded = true;
        } catch (error) {
          if (controller.signal.aborted) throw new AgentError('cancelled');

          const normalized = normalizeError(error, debug);
          const fallback = built.fallback;
          const canFailOver =
            !streamedAnything &&
            attemptIndex === 0 &&
            fallback !== null &&
            isFailoverWorthy(normalized);

          if (!canFailOver || !fallback) {
            throw error;
          }

          // Nothing has reached the user, so switching is invisible to them —
          // but it is recorded, because a fallback nobody can see is how a
          // degraded provider stays unnoticed for weeks.
          this.logger.warn(
            `run ${runId}: ${attempt.model.ref.providerId}/${attempt.model.ref.modelId} failed (${normalized.code}); falling back`,
          );
          telemetry.markFallback(attempt.model.ref, fallback.ref);
          activeModel = fallback.ref;
          yield {
            type: 'MODEL_FALLBACK',
            runId,
            from: attempt.model.ref,
            to: fallback.ref,
            reason: normalized,
            at: new Date().toISOString(),
          };
          const rebuilt = await this.factory.build(agentId, context, sink, fallback);
          attempts.push({ agent: rebuilt.agent, model: fallback });
          yield { type: 'MODEL_STARTED', runId, model: fallback.ref, at: new Date().toISOString() };
          text = '';
        }
        attemptIndex += 1;
      }

      // Drain anything a tool emitted after the last model event.
      for (const event of queue.drain()) yield event;

      const clean = citations.sanitize(text);
      const used = citations.used(clean);
      const message = await this.persistAssistantMessage({
        request,
        agentId,
        text: clean,
        model: activeModel,
        references: used.length > 0 ? used : citations.all().slice(0, 0),
        toolRuns: [...toolRuns.values()],
      });

      yield {
        type: 'MESSAGE_COMPLETED',
        runId,
        messageId: message.id,
        text: clean,
        references: message.references,
        toolRuns: message.toolRuns,
        model: activeModel,
        agentId,
      };
      yield { type: 'RUN_COMPLETED', runId, usage, durationMs: Date.now() - startedAt };
      await telemetry.settle(request.userId, 'completed', usage, null);
    } catch (error) {
      const normalized = normalizeError(error, debug);
      failure = error instanceof AgentError ? error : null;
      void failure;

      for (const event of queue.drain()) yield event;

      if (normalized.code === 'cancelled') {
        // A cancelled turn keeps whatever was already said: throwing the
        // partial answer away is not what "stop" means to a reader.
        if (text.trim().length > 0) {
          const clean = citations.sanitize(text);
          await this.persistAssistantMessage({
            request,
            agentId,
            text: clean,
            model: activeModel,
            references: citations.used(clean),
            toolRuns: [...toolRuns.values()],
          });
        }
        yield { type: 'RUN_CANCELLED', runId, durationMs: Date.now() - startedAt };
        await telemetry.settle(request.userId, 'cancelled', usage, 'cancelled');
      } else {
        this.logger.error(`run ${runId} failed: ${normalized.code} — ${normalized.detail ?? ''}`);
        await this.persistAssistantMessage({
          request,
          agentId,
          text: citations.sanitize(text),
          model: activeModel,
          references: [],
          toolRuns: [...toolRuns.values()],
          error: normalized,
        });
        yield { type: 'RUN_FAILED', runId, error: normalized, durationMs: Date.now() - startedAt };
        await telemetry.settle(request.userId, 'failed', usage, normalized.code);
      }
    } finally {
      this.runs.release(runId);
    }
  }

  /**
   * The Agents SDK's stream, mapped onto our protocol.
   *
   * Tool events do not come from here — the tool wrapper emits those, because
   * it is the only place that knows the label, the duration and the references.
   * What the SDK uniquely knows is text, which agent is speaking, and handoffs.
   */
  private *translate(
    event: RunStreamEvent,
    runId: string,
    telemetry: ReturnType<RunTelemetry['start']>,
  ): Generator<AgentEvent> {
    if (event.type === 'raw_model_stream_event') {
      const data = event.data as { type?: string; delta?: string; itemId?: string };
      if (data.type === 'output_text_delta' && typeof data.delta === 'string' && data.delta) {
        yield { type: 'TEXT_DELTA', runId, messageId: data.itemId ?? 'main', delta: data.delta };
      }
      return;
    }

    if (event.type === 'agent_updated_stream_event') {
      yield { type: 'STATUS', runId, text: `${event.agent.name} is working` };
      return;
    }

    if (event.type === 'run_item_stream_event') {
      if (event.name === 'handoff_occurred') {
        telemetry.markHandoff();
        const item = event.item as unknown as {
          sourceAgent?: { name?: string };
          targetAgent?: { name?: string };
        };
        yield {
          type: 'HANDOFF',
          runId,
          from: item.sourceAgent?.name ?? 'assistant',
          to: item.targetAgent?.name ?? 'specialist',
          at: new Date().toISOString(),
        };
      }
      if (event.name === 'reasoning_item_created') {
        // A progress line, never the reasoning itself: chain-of-thought does
        // not leave the server.
        yield { type: 'STATUS', runId, text: 'Thinking' };
      }
    }
  }

  private async persistUserMessage(request: RunRequest, agentId: string): Promise<void> {
    if (!(await this.settings.privacy()).storeConversations) return;
    await this.conversations.appendMessage({
      id: `msg_${randomUUID().replace(/-/g, '').slice(0, 20)}`,
      conversationId: request.conversationId,
      role: 'user',
      text: request.message,
      createdAt: new Date().toISOString(),
      agentId,
      model: null,
      references: [],
      toolRuns: [],
      attachments: request.attachments,
      error: null,
    });
  }

  private async persistAssistantMessage(input: {
    request: RunRequest;
    agentId: string;
    text: string;
    model: ModelRef | null;
    references: AgentMessage['references'];
    toolRuns: AgentToolRun[];
    error?: AgentMessage['error'];
  }): Promise<AgentMessage> {
    const message: AgentMessage = {
      id: `msg_${randomUUID().replace(/-/g, '').slice(0, 20)}`,
      conversationId: input.request.conversationId,
      role: 'assistant',
      text: input.text,
      createdAt: new Date().toISOString(),
      agentId: input.agentId,
      model: input.model,
      references: input.references,
      toolRuns: input.toolRuns,
      attachments: [],
      error: input.error ?? null,
    };
    if ((await this.settings.privacy()).storeConversations) {
      await this.conversations.appendMessage(message);
    }
    return message;
  }
}

/** Events produced by tools, which run outside the SDK's own stream. */
class EventQueue {
  private readonly buffer: AgentEvent[] = [];
  push(event: AgentEvent): void {
    this.buffer.push(event);
  }

  drain(): AgentEvent[] {
    const events = [...this.buffer];
    this.buffer.length = 0;
    return events;
  }

  get length(): number {
    return this.buffer.length;
  }

}

type MergedEvent = { queued: true; event: AgentEvent } | { queued: false; event: RunStreamEvent };

function isQueued(event: MergedEvent): event is { queued: true; event: AgentEvent } {
  return event.queued;
}

/**
 * Interleave the SDK's stream with the tool queue.
 *
 * Tool events are produced inside `execute`, which the runner awaits between
 * model events, so without this a card would appear only after the next token —
 * long after the tool started. Draining the queue on every tick is what makes
 * "Searching news…" show up while the search is actually running.
 */
async function* merge(
  result: AsyncIterable<RunStreamEvent>,
  queue: EventQueue,
  signal: AbortSignal,
): AsyncGenerator<MergedEvent> {
  for await (const event of result) {
    while (queue.length > 0) {
      for (const queued of queue.drain()) yield { queued: true, event: queued };
    }
    if (signal.aborted) return;
    yield { queued: false, event };
  }
  for (const queued of queue.drain()) yield { queued: true, event: queued };
}

function readUsage(context: RunContext<unknown>): AgentUsage {
  const usage = context.usage;
  return {
    requests: usage?.requests ?? 0,
    inputTokens: usage?.inputTokens ?? 0,
    outputTokens: usage?.outputTokens ?? 0,
    totalTokens: usage?.totalTokens ?? 0,
  };
}
