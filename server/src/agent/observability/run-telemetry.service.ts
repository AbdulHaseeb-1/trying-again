import { Injectable, Logger } from '@nestjs/common';

import type { AgentRunRecord } from '../agent.domain';
import type { AgentUsage, ModelRef } from '../agent.events';
import { ConversationRepository } from '../sessions/conversation.repository';

/**
 * What happened, in numbers.
 *
 * Two things are tracked that a naive implementation forgets and an operator
 * always wants: **first-token latency**, because that is the number a user
 * actually feels, and **which model finished the run**, because a silent
 * failover that nobody records is indistinguishable from a provider that is
 * quietly worse than you think.
 *
 * What is deliberately *not* tracked: prompts, completions, tool arguments and
 * reasoning. This is operational telemetry, not a transcript store — the
 * conversation repository already holds what the user said, under the user's
 * own controls.
 */
@Injectable()
export class RunTelemetry {
  private readonly logger = new Logger(RunTelemetry.name);

  constructor(private readonly repository: ConversationRepository) {}

  start(input: {
    runId: string;
    conversationId: string;
    agentId: string;
    model: ModelRef | null;
  }): RunTelemetryHandle {
    return new RunTelemetryHandle(this, input);
  }

  async persist(userId: string, record: AgentRunRecord): Promise<void> {
    try {
      await this.repository.recordRun(userId, record);
    } catch (error) {
      // Telemetry must never fail a run the user already received.
      this.logger.warn(`failed to record run ${record.id}: ${String(error)}`);
    }
  }
}

/** A single run's counters, mutated as it goes and frozen when it settles. */
export class RunTelemetryHandle {
  readonly startedAt = Date.now();
  private firstTokenAt: number | null = null;
  private toolCalls = 0;
  private toolFailures = 0;
  private handoffs = 0;
  private references = 0;
  private searchProvider: string | null = null;
  private fallbackFrom: ModelRef | null = null;
  private model: ModelRef | null;

  constructor(
    private readonly telemetry: RunTelemetry,
    private readonly input: {
      runId: string;
      conversationId: string;
      agentId: string;
      model: ModelRef | null;
    },
  ) {
    this.model = input.model;
  }

  markFirstToken(): void {
    this.firstTokenAt ??= Date.now();
  }

  markTool(failed: boolean): void {
    this.toolCalls += 1;
    if (failed) this.toolFailures += 1;
  }

  markHandoff(): void {
    this.handoffs += 1;
  }

  markReference(): void {
    this.references += 1;
  }

  markSearchProvider(provider: string): void {
    this.searchProvider = provider;
  }

  /**
   * The model the run actually started on.
   *
   * The handle is opened before the agent is built — the event sink needs it —
   * so the model is not known yet at that point. Without this the inspector
   * would report a model only for runs that happened to fail over, which is
   * precisely backwards.
   */
  markModel(model: ModelRef): void {
    this.model = model;
  }

  markFallback(from: ModelRef, to: ModelRef): void {
    this.fallbackFrom = from;
    this.model = to;
  }

  get firstTokenMs(): number | null {
    return this.firstTokenAt ? this.firstTokenAt - this.startedAt : null;
  }

  async settle(
    userId: string,
    status: AgentRunRecord['status'],
    usage: AgentUsage,
    errorCode: string | null,
  ): Promise<AgentRunRecord> {
    const finishedAt = new Date();
    const record: AgentRunRecord = {
      id: this.input.runId,
      conversationId: this.input.conversationId,
      agentId: this.input.agentId,
      status,
      startedAt: new Date(this.startedAt).toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - this.startedAt,
      firstTokenMs: this.firstTokenMs,
      usage,
      model: this.model,
      fallbackFrom: this.fallbackFrom,
      toolCalls: this.toolCalls,
      toolFailures: this.toolFailures,
      handoffs: this.handoffs,
      searchProvider: this.searchProvider,
      referenceCount: this.references,
      errorCode,
    };
    await this.telemetry.persist(userId, record);
    return record;
  }
}
