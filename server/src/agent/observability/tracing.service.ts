import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { setTraceProcessors, setTracingDisabled } from '@openai/agents';

/**
 * The Agents SDK's tracing, turned on deliberately rather than by accident.
 *
 * The SDK uploads traces to OpenAI by default when an OpenAI key is present.
 * That is a reasonable default for a script and the wrong default for a product
 * that might be running entirely on Anthropic or a self-hosted gateway —
 * sending prompts to a vendor the operator did not choose is not a decision to
 * make silently.
 *
 * So tracing is **off unless `AGENT_TRACING=on`**, and when it is on it is on
 * for a reason the operator chose. Application-level observability does not
 * depend on it: `RunTelemetry` records latency, tools, usage and failover to
 * our own store either way.
 */
@Injectable()
export class AgentTracing implements OnModuleInit {
  private readonly logger = new Logger(AgentTracing.name);

  onModuleInit(): void {
    const enabled = (process.env.AGENT_TRACING ?? 'off').toLowerCase() === 'on';
    if (!enabled) {
      setTracingDisabled(true);
      return;
    }
    setTracingDisabled(false);
    if (!process.env.OPENAI_API_KEY && !process.env.AGENT_TRACING_API_KEY) {
      // Exporting to OpenAI needs an OpenAI key. Without one, keep the spans
      // local rather than letting the exporter fail on every run.
      setTraceProcessors([]);
      this.logger.log('tracing enabled locally (no export key configured)');
      return;
    }
    this.logger.log('tracing enabled and exporting');
  }
}
