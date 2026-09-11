import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { AgentEvent, AgentMessage } from '@/agent/protocol';
import {
  agentReducer,
  initialAgentState,
  placeholderId,
  type AgentState,
} from '@/agent/state/agent-reducer';

/**
 * The reducer is the contract between the wire and the screen.
 *
 * Every rendering decision the panel makes — is it still typing, which tool
 * card is open, which sources are attached to which message, whether a
 * cancelled run keeps its half-written answer — is decided here, so it is worth
 * testing without a renderer in the way.
 */

const RUN = 'run_1';
const CONVERSATION = 'conv_1';

function apply(state: AgentState, ...events: AgentEvent[]): AgentState {
  return events.reduce((current, event) => agentReducer(current, { type: 'event', event }), state);
}

const started: AgentEvent = {
  type: 'RUN_STARTED',
  runId: RUN,
  conversationId: CONVERSATION,
  agentId: 'market-assistant',
  at: '2026-09-11T12:00:00.000Z',
};

const toolRun = (status: 'running' | 'completed', extra: Record<string, unknown> = {}) => ({
  id: 'tr_1',
  tool: 'get_latest_news',
  label: 'Reading the latest news',
  status,
  startedAt: '2026-09-11T12:00:01.000Z',
  ...extra,
});

describe('agent reducer: streaming', () => {
  it('opens a placeholder assistant turn when a run starts', () => {
    const state = apply(initialAgentState, started);
    assert.equal(state.status, 'streaming');
    assert.equal(state.runId, RUN);
    assert.equal(state.messages.length, 1);
    assert.equal(state.messages[0].id, placeholderId(RUN));
    assert.equal(state.messages[0].streaming, true);
    assert.equal(state.messages[0].text, '');
  });

  it('appends deltas in order', () => {
    const state = apply(
      initialAgentState,
      started,
      { type: 'TEXT_DELTA', runId: RUN, messageId: 'm', delta: 'Open ' },
      { type: 'TEXT_DELTA', runId: RUN, messageId: 'm', delta: 'interest ' },
      { type: 'TEXT_DELTA', runId: RUN, messageId: 'm', delta: 'is building.' },
    );
    assert.equal(state.messages[0].text, 'Open interest is building.');
  });

  it('ignores deltas for a run it is not showing', () => {
    // A late event from an abandoned run must not write into the current one.
    const state = apply(
      initialAgentState,
      started,
      { type: 'TEXT_DELTA', runId: 'run_other', messageId: 'm', delta: 'stray' },
    );
    assert.equal(state.messages[0].text, '');
  });

  it('tracks a tool from running to completed without duplicating the card', () => {
    const state = apply(
      initialAgentState,
      started,
      { type: 'TOOL_STARTED', runId: RUN, run: toolRun('running') },
      {
        type: 'TOOL_COMPLETED',
        runId: RUN,
        run: toolRun('completed', { durationMs: 84, summary: '12 articles' }),
      },
    );
    assert.equal(state.messages[0].toolRuns.length, 1);
    assert.equal(state.messages[0].toolRuns[0].status, 'completed');
    assert.equal(state.messages[0].toolRuns[0].summary, '12 articles');
    assert.equal(state.messages[0].toolRuns[0].durationMs, 84);
  });

  it('collects references and deduplicates them', () => {
    const reference = {
      id: 'ref_1',
      type: 'news' as const,
      title: 'US CPI y/y: 2.9%',
      source: 'MarketPulse Calendar',
    };
    const state = apply(
      initialAgentState,
      started,
      { type: 'REFERENCE_ADDED', runId: RUN, reference, citationIndex: 1 },
      { type: 'REFERENCE_ADDED', runId: RUN, reference, citationIndex: 1 },
    );
    assert.equal(state.messages[0].references.length, 1);
    assert.equal(state.messages[0].references[0].citationIndex, 1);
  });

  it('shows a progress line only while streaming', () => {
    const streaming = apply(initialAgentState, started, {
      type: 'STATUS',
      runId: RUN,
      text: 'Research is working',
    });
    assert.equal(streaming.statusText, 'Research is working');

    const settled = apply(streaming, {
      type: 'RUN_COMPLETED',
      runId: RUN,
      usage: { requests: 1, inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      durationMs: 10,
    });
    assert.equal(settled.statusText, null);
    assert.equal(settled.status, 'idle');
  });

  it('records a handoff and follows the new speaker', () => {
    const state = apply(initialAgentState, started, {
      type: 'HANDOFF',
      runId: RUN,
      from: 'Market Assistant',
      to: 'Research',
      at: '2026-09-11T12:00:02.000Z',
    });
    assert.deepEqual(state.handoff, { from: 'Market Assistant', to: 'Research' });
    assert.equal(state.activeAgentName, 'Research');
  });
});

describe('agent reducer: settling a turn', () => {
  it('replaces the placeholder with the server’s sanitised text', () => {
    const state = apply(
      initialAgentState,
      started,
      { type: 'TEXT_DELTA', runId: RUN, messageId: 'm', delta: 'Cooling [1] and [9].' },
      {
        type: 'MESSAGE_COMPLETED',
        runId: RUN,
        messageId: 'msg_1',
        // The server already removed the citation that resolved to nothing.
        text: 'Cooling [1].',
        references: [
          { id: 'ref_1', type: 'news', title: 'CPI', source: 'Calendar', citationIndex: 1 },
        ],
        toolRuns: [],
        model: { providerId: 'openai', providerName: 'OpenAI', modelId: 'gpt-4.1-mini' },
        agentId: 'market-assistant',
      },
    );

    assert.equal(state.messages.length, 1);
    assert.equal(state.messages[0].id, 'msg_1');
    assert.equal(state.messages[0].text, 'Cooling [1].');
    assert.equal(state.messages[0].streaming, false);
    assert.equal(state.messages[0].references.length, 1);
    assert.equal(state.messages[0].model?.modelId, 'gpt-4.1-mini');
  });

  it('keeps a partial answer when the run is cancelled', () => {
    const state = apply(
      initialAgentState,
      started,
      { type: 'TEXT_DELTA', runId: RUN, messageId: 'm', delta: 'one two three' },
      { type: 'RUN_CANCELLED', runId: RUN, durationMs: 120 },
    );
    assert.equal(state.status, 'idle');
    assert.equal(state.runId, null);
    assert.equal(state.messages.length, 1);
    assert.equal(state.messages[0].text, 'one two three');
    assert.equal(state.messages[0].streaming, false);
  });

  it('drops an empty bubble when a run is cancelled before any text', () => {
    const state = apply(initialAgentState, started, {
      type: 'RUN_CANCELLED',
      runId: RUN,
      durationMs: 5,
    });
    assert.equal(state.messages.length, 0);
  });

  it('keeps an empty bubble that at least shows tool activity', () => {
    const state = apply(
      initialAgentState,
      started,
      { type: 'TOOL_STARTED', runId: RUN, run: toolRun('running') },
      { type: 'RUN_CANCELLED', runId: RUN, durationMs: 5 },
    );
    assert.equal(state.messages.length, 1);
    assert.equal(state.messages[0].toolRuns.length, 1);
  });

  it('surfaces a failure with its retry affordance and drops the empty bubble', () => {
    const state = apply(initialAgentState, started, {
      type: 'RUN_FAILED',
      runId: RUN,
      error: {
        code: 'provider_unavailable',
        message: 'The AI provider could not be reached.',
        retryable: true,
      },
      durationMs: 900,
    });
    assert.equal(state.status, 'idle');
    assert.equal(state.error?.retryable, true);
    assert.equal(state.messages.length, 0);
  });
});

describe('agent reducer: fallback', () => {
  it('records the switch and discards the void draft', () => {
    const from = { providerId: 'openai', providerName: 'OpenAI', modelId: 'gpt-4.1' };
    const to = { providerId: 'openrouter', providerName: 'OpenRouter', modelId: 'claude' };

    const state = apply(
      initialAgentState,
      started,
      { type: 'TEXT_DELTA', runId: RUN, messageId: 'm', delta: 'half a sentence' },
      {
        type: 'MODEL_FALLBACK',
        runId: RUN,
        from,
        to,
        reason: { code: 'timeout', message: 'Timed out.', retryable: true },
        at: '2026-09-11T12:00:03.000Z',
      },
    );

    assert.deepEqual(state.fallback?.from, from);
    assert.deepEqual(state.fallback?.to, to);
    // The restarted answer begins from nothing rather than appending to a draft
    // the new model never wrote.
    assert.equal(state.messages[0].text, '');
  });
});

describe('agent reducer: conversation lifecycle', () => {
  it('shows the user’s own words before the server confirms them', () => {
    const state = agentReducer(initialAgentState, {
      type: 'optimistic-user',
      message: {
        id: 'local-1',
        conversationId: CONVERSATION,
        role: 'user',
        text: 'What is happening?',
        createdAt: '2026-09-11T12:00:00.000Z',
        agentId: 'market-assistant',
        model: null,
        references: [],
        toolRuns: [],
        attachments: [],
        error: null,
        streaming: false,
      },
    });
    assert.equal(state.messages.length, 1);
    assert.equal(state.messages[0].role, 'user');
  });

  it('loads a stored conversation with nothing left streaming', () => {
    const stored: AgentMessage[] = [
      {
        id: 'm1',
        conversationId: CONVERSATION,
        role: 'user',
        text: 'hi',
        createdAt: '2026-09-11T11:00:00.000Z',
        agentId: null,
        model: null,
        references: [],
        toolRuns: [],
        attachments: [],
        error: null,
      },
    ];
    const state = agentReducer(initialAgentState, { type: 'messages', messages: stored });
    assert.equal(state.messages.length, 1);
    assert.equal(state.messages[0].streaming, false);
  });

  it('resets everything for a new conversation', () => {
    const busy = apply(initialAgentState, started, {
      type: 'TEXT_DELTA',
      runId: RUN,
      messageId: 'm',
      delta: 'something',
    });
    const reset = agentReducer(busy, { type: 'reset' });
    assert.deepEqual(reset, initialAgentState);
  });

  it('clears an error without touching the transcript', () => {
    const failed = apply(initialAgentState, started, {
      type: 'RUN_FAILED',
      runId: RUN,
      error: { code: 'timeout', message: 'Timed out.', retryable: true },
      durationMs: 1,
    });
    const cleared = agentReducer(failed, { type: 'clear-error' });
    assert.equal(cleared.error, null);
    assert.deepEqual(cleared.messages, failed.messages);
  });
});
