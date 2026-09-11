import type { AgentEvent } from '../agent.events';
import type { RunCitations } from '../citations/citation.service';

/**
 * One run's outward channel.
 *
 * Tools, the factory and the runtime all need the same three things — somewhere
 * to emit normalized events, the citation collector for this run, and the abort
 * signal that stop flips — and none of them should reach into the runtime to
 * get them. This is that bundle, passed down rather than looked up.
 */
export type RunSink = {
  runId: string;
  emit(event: AgentEvent): void;
  citations: RunCitations;
  /** Aborted when the user stops the run, or when the request disconnects. */
  signal: AbortSignal;
  /** Telemetry counters, kept here so tools do not depend on the run record. */
  countToolCall(failed: boolean): void;
};
