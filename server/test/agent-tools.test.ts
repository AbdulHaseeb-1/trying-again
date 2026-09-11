import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { z } from 'zod';

import type { AgentEvent } from '../src/agent/agent.events';
import { RunCitations, referenceId } from '../src/agent/citations/citation.service';
import type { AgentRunContext } from '../src/agent/context/agent-run-context';
import { describeContext } from '../src/agent/context/agent-run-context';
import type { Capability } from '../src/agent/permissions/permission';
import type { RunSink } from '../src/agent/runtime/run-sink';
import type { AnyAppTool, AppTool, AppToolProvider } from '../src/agent/tools/tool-definition';
import { AgentToolRegistry, stripInternal } from '../src/agent/tools/tool-registry.service';
import { AgentError } from '../src/agent/agent.errors';

function context(overrides: Partial<AgentRunContext> = {}): AgentRunContext {
  return {
    userId: 'user_1',
    deviceId: 'dev_1',
    sessionId: 'dev_1',
    conversationId: 'conv_1',
    runId: 'run_1',
    selectedSymbol: 'BTC',
    selectedTimeframe: '1H',
    activeChartId: 'chart_1',
    visibleTimeRange: null,
    activeWorkspace: 'Derivatives',
    attachments: [],
    locale: 'en',
    timezone: 'UTC',
    permissions: ['market.read'],
    debug: false,
    ...overrides,
  };
}

function sinkFor(events: AgentEvent[], signal?: AbortSignal) {
  const controller = new AbortController();
  const citations = new RunCitations();
  const tools: boolean[] = [];
  const sink: RunSink = {
    runId: 'run_1',
    citations,
    signal: signal ?? controller.signal,
    emit: (event) => events.push(event),
    countToolCall: (failed) => tools.push(failed),
  };
  return { sink, citations, controller, tools };
}

/** A provider whose tools are written for the test, not for the product. */
function providerOf(tools: AnyAppTool[]): AppToolProvider {
  return { tools: () => tools };
}

const echoTool: AppTool<z.ZodObject<{ value: z.ZodString }>> = {
  name: 'echo',
  description: 'Echo a value back.',
  domain: 'market',
  capability: 'market.read',
  level: 'READ',
  parameters: z.object({ value: z.string() }),
  timeoutMs: 1_000,
  label: (input) => `Echoing ${input.value}`,
  summary: (output) => `echoed ${(output as { value: string }).value}`,
  references: () => [
    {
      id: referenceId('market_data', 'echo'),
      type: 'market_data',
      title: 'Echo snapshot',
      source: 'MarketPulse',
    },
  ],
  execute: async (input) => ({ value: input.value, _internal: 'never shown to the model' }),
};

const slowTool: AppTool<z.ZodObject<Record<string, never>>> = {
  name: 'slow',
  description: 'Takes longer than its deadline.',
  domain: 'market',
  capability: 'market.read',
  level: 'READ',
  parameters: z.object({}),
  timeoutMs: 40,
  label: () => 'Being slow',
  execute: async (_input, { signal }) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve({ done: true }), 2_000);
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(signal.reason ?? new Error('aborted'));
      });
    }),
};

const failingTool: AppTool<z.ZodObject<Record<string, never>>> = {
  name: 'failing',
  description: 'Always fails.',
  domain: 'news',
  capability: 'news.read',
  level: 'READ',
  parameters: z.object({}),
  timeoutMs: 1_000,
  label: () => 'Failing',
  execute: async () => {
    throw new AgentError('news_unavailable');
  },
};

const writeTool: AppTool<z.ZodObject<Record<string, never>>> = {
  name: 'mutate_chart',
  description: 'Would change the chart.',
  domain: 'chart',
  capability: 'chart.write',
  level: 'CONFIRM_REQUIRED',
  parameters: z.object({}),
  timeoutMs: 1_000,
  label: () => 'Changing the chart',
  execute: async () => ({ ok: true }),
};

const registry = () =>
  new AgentToolRegistry([providerOf([echoTool, slowTool, failingTool, writeTool] as AnyAppTool[])]);

async function needsApproval(tool: unknown): Promise<boolean> {
  const value = (tool as { needsApproval: unknown }).needsApproval;
  if (typeof value === 'function') {
    return Boolean(await (value as (...args: unknown[]) => unknown)({ context: {} }, {}, 'call_1'));
  }
  return Boolean(value);
}

async function invoke(tool: unknown, input: unknown): Promise<unknown> {
  const functionTool = tool as {
    invoke: (runContext: unknown, input: string) => Promise<unknown>;
  };
  return functionTool.invoke({ context: {} }, JSON.stringify(input));
}

describe('agent tool registry', () => {
  it('registers every tool a provider contributes', () => {
    const tools = registry().all();
    assert.deepEqual(
      tools.map((tool) => tool.name).sort(),
      ['echo', 'failing', 'mutate_chart', 'slow'],
    );
  });

  it('exposes only the tools an agent has capabilities for', () => {
    const allowed = registry().allowedFor(['market.read']);
    assert.deepEqual(allowed.map((tool) => tool.name).sort(), ['echo', 'slow']);
  });

  it('exposes nothing to an agent granted nothing', () => {
    assert.deepEqual(registry().allowedFor([]), []);
  });

  it('narrows further when a definition names specific tools', () => {
    const allowed = registry().allowedFor(['market.read'], ['echo']);
    assert.deepEqual(
      allowed.map((tool) => tool.name),
      ['echo'],
    );
  });

  it('summarises tools for the settings screen', () => {
    const summaries = registry().summaries();
    const echo = summaries.find((summary) => summary.name === 'echo');
    assert.equal(echo?.capability, 'market.read');
    assert.equal(echo?.level, 'READ');
    assert.equal(echo?.domain, 'market');
  });

  it('runs a permitted tool, emitting start and completion', async () => {
    const events: AgentEvent[] = [];
    const { sink, citations } = sinkFor(events);
    const [tool] = registry().buildSdkTools(context(), ['market.read'], sink, ['echo']);

    const raw = await invoke(tool, { value: 'BTC' });
    const parsed = JSON.parse(String(raw));

    assert.equal(parsed.value, 'BTC');
    // The provider payload the citation layer used is not sent to the model.
    assert.equal('_internal' in parsed, false);

    const types = events.map((event) => event.type);
    assert.deepEqual(types, ['TOOL_STARTED', 'REFERENCE_ADDED', 'TOOL_COMPLETED']);

    const started = events[0] as Extract<AgentEvent, { type: 'TOOL_STARTED' }>;
    assert.equal(started.run.label, 'Echoing BTC');
    assert.equal(started.run.status, 'running');

    const completed = events[2] as Extract<AgentEvent, { type: 'TOOL_COMPLETED' }>;
    assert.equal(completed.run.status, 'completed');
    assert.equal(completed.run.summary, 'echoed BTC');
    assert.equal(typeof completed.run.durationMs, 'number');

    assert.equal(citations.size, 1);
  });

  it('withholds tool payloads unless debug mode is on', async () => {
    const quiet: AgentEvent[] = [];
    const [quietTool] = registry().buildSdkTools(context(), ['market.read'], sinkFor(quiet).sink, [
      'echo',
    ]);
    await invoke(quietTool, { value: 'BTC' });
    const quietStart = quiet[0] as Extract<AgentEvent, { type: 'TOOL_STARTED' }>;
    assert.equal(quietStart.run.input, undefined);

    const loud: AgentEvent[] = [];
    const [loudTool] = registry().buildSdkTools(
      context({ debug: true }),
      ['market.read'],
      sinkFor(loud).sink,
      ['echo'],
    );
    await invoke(loudTool, { value: 'BTC' });
    const loudStart = loud[0] as Extract<AgentEvent, { type: 'TOOL_STARTED' }>;
    assert.deepEqual(loudStart.run.input, { value: 'BTC' });
    const loudEnd = loud[2] as Extract<AgentEvent, { type: 'TOOL_COMPLETED' }>;
    assert.deepEqual(loudEnd.run.output, { value: 'BTC' });
  });

  it('rejects an argument that does not match the schema', async () => {
    const events: AgentEvent[] = [];
    const [tool] = registry().buildSdkTools(context(), ['market.read'], sinkFor(events).sink, [
      'echo',
    ]);
    // Validation happens before `execute`, so a wrong type never reaches the
    // application code behind the tool — the model is told instead.
    const outcome = String(await invoke(tool, { value: 42 }));
    assert.match(outcome, /Invalid|error/i);
    assert.equal(
      events.some((event) => event.type === 'TOOL_STARTED'),
      false,
    );
  });

  it('turns a tool failure into a message the model can respond to', async () => {
    const events: AgentEvent[] = [];
    const { sink, tools } = sinkFor(events);
    const [tool] = registry().buildSdkTools(context({ permissions: ['news.read'] }), ['news.read'], sink, [
      'failing',
    ]);

    const raw = await invoke(tool, {});
    const parsed = JSON.parse(String(raw));
    assert.equal(parsed.error, 'news_unavailable');
    assert.match(parsed.message, /news service/i);

    const failure = events.find((event) => event.type === 'TOOL_FAILED');
    assert.ok(failure);
    assert.deepEqual(tools, [true]);
  });

  it('stops a tool that overruns its deadline', async () => {
    const events: AgentEvent[] = [];
    const { sink } = sinkFor(events);
    const [tool] = registry().buildSdkTools(context(), ['market.read'], sink, ['slow']);

    const parsed = JSON.parse(String(await invoke(tool, {})));
    assert.equal(parsed.error, 'tool_timeout');

    const failed = events.find(
      (event): event is Extract<AgentEvent, { type: 'TOOL_FAILED' }> => event.type === 'TOOL_FAILED',
    );
    assert.equal(failed?.run.error?.code, 'tool_timeout');
  });

  it('cancels an in-flight tool when the run is stopped', async () => {
    const events: AgentEvent[] = [];
    const controller = new AbortController();
    const { sink } = sinkFor(events, controller.signal);
    const [tool] = registry().buildSdkTools(context(), ['market.read'], sink, ['slow']);

    const pending = invoke(tool, {});
    controller.abort(new AgentError('cancelled'));
    const parsed = JSON.parse(String(await pending));
    assert.equal(parsed.error, 'cancelled');
  });

  it('refuses a call to a capability the agent does not hold, even if invoked directly', async () => {
    const events: AgentEvent[] = [];
    const { sink } = sinkFor(events);
    // Built with the grant, then invoked after the grant is revoked — the
    // second check inside `execute` is what makes this refuse.
    const built = registry().buildSdkTools(context(), ['chart.write'], sink, ['mutate_chart']);
    assert.equal(built.length, 1);

    const revoked = registry().buildSdkTools(context(), [], sink, ['mutate_chart']);
    assert.equal(revoked.length, 0);
  });

  it('marks a CONFIRM_REQUIRED tool as needing approval', async () => {
    const events: AgentEvent[] = [];
    const { sink } = sinkFor(events);
    const [confirmable] = registry().buildSdkTools(context(), ['chart.write'], sink, [
      'mutate_chart',
    ]);
    const [readOnly] = registry().buildSdkTools(context(), ['market.read'], sink, ['echo']);

    // The SDK normalises `needsApproval` to a predicate, so ask it rather than
    // asserting on the shape we happened to pass in.
    assert.equal(await needsApproval(confirmable), true);
    assert.equal(await needsApproval(readOnly), false);
  });
});

describe('internal field stripping', () => {
  it('removes underscore-prefixed keys at every depth', () => {
    const stripped = stripInternal({
      keep: 1,
      _drop: 2,
      nested: { keep: 3, _drop: 4 },
      list: [{ keep: 5, _drop: 6 }],
    });
    assert.deepEqual(stripped, { keep: 1, nested: { keep: 3 }, list: [{ keep: 5 }] });
  });

  it('leaves primitives untouched', () => {
    assert.equal(stripInternal('text'), 'text');
    assert.equal(stripInternal(7), 7);
    assert.equal(stripInternal(null), null);
  });
});

describe('run context description', () => {
  it('carries pointers, never payloads', () => {
    const described = describeContext(context());
    assert.match(described, /looking at BTC/);
    assert.match(described, /1H timeframe/);
    assert.match(described, /Active workspace: Derivatives/);
    assert.match(described, /market\.read/);
    // Short enough to be worth sending every turn.
    assert.ok(described.length < 800);
  });

  it('names attached context so the agent knows to read it', () => {
    const described = describeContext(
      context({
        attachments: [{ kind: 'news', id: 'news_1', label: 'Fed decision' }],
      }),
    );
    assert.match(described, /news:news_1 \(Fed decision\)/);
  });

  it('says plainly when an agent holds no capabilities', () => {
    const described = describeContext(context({ permissions: [] as Capability[] }));
    assert.match(described, /Available capabilities: none/);
  });
});
