import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';

import { AgentError } from '../agent.errors';

type ActiveRun = {
  runId: string;
  userId: string;
  conversationId: string;
  controller: AbortController;
  startedAt: number;
};

/**
 * Stop, made real.
 *
 * Cancellation is an `AbortSignal` from end to end: the runtime passes it to
 * the SDK runner, the runner passes it to the model call, and the tool wrapper
 * composes it with each tool's own deadline. Pressing stop therefore cancels
 * the in-flight HTTP request and any search or page fetch underneath it, rather
 * than leaving them running while the UI pretends otherwise.
 *
 * A run is owned by the principal that started it: stopping is checked against
 * `userId`, so a run id is not a capability to cancel someone else's work.
 */
@Injectable()
export class RunRegistry implements OnModuleDestroy {
  private readonly logger = new Logger(RunRegistry.name);
  private readonly runs = new Map<string, ActiveRun>();

  register(run: Omit<ActiveRun, 'startedAt'>): void {
    this.runs.set(run.runId, { ...run, startedAt: Date.now() });
  }

  release(runId: string): void {
    this.runs.delete(runId);
  }

  /** True when this call actually stopped something. */
  stop(runId: string, userId: string): boolean {
    const run = this.runs.get(runId);
    if (!run) return false;
    if (run.userId !== userId) {
      throw new AgentError('permission_denied', 'That run belongs to another session.');
    }
    run.controller.abort(new AgentError('cancelled'));
    this.runs.delete(runId);
    return true;
  }

  /** Stop everything in one conversation — used when it is deleted mid-run. */
  stopConversation(conversationId: string, userId: string): number {
    let stopped = 0;
    for (const run of [...this.runs.values()]) {
      if (run.conversationId !== conversationId || run.userId !== userId) continue;
      run.controller.abort(new AgentError('cancelled'));
      this.runs.delete(run.runId);
      stopped += 1;
    }
    return stopped;
  }

  active(userId: string): { runId: string; conversationId: string; ageMs: number }[] {
    return [...this.runs.values()]
      .filter((run) => run.userId === userId)
      .map((run) => ({
        runId: run.runId,
        conversationId: run.conversationId,
        ageMs: Date.now() - run.startedAt,
      }));
  }

  onModuleDestroy(): void {
    for (const run of this.runs.values()) {
      run.controller.abort(new AgentError('cancelled', 'The server is shutting down.'));
    }
    this.runs.clear();
  }
}
