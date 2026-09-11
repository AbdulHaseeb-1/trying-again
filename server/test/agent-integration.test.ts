import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { AgentConversation, AgentMessage } from '../src/agent/agent.domain';
import { startAgentHarness, eventsOfType, streamedText } from './support/agent-harness';

/**
 * End to end, through the real application.
 *
 * These boot the actual Nest app and drive it over HTTP: auth guard, validation
 * pipe, the streaming controller, the Agents SDK runner, the tool layer, the
 * citation layer and the conversation store. Only the model's wire is faked,
 * because a test that mocks the SDK proves nothing about the integration.
 */

async function conversation(
  harness: Awaited<ReturnType<typeof startAgentHarness>>,
  agentId = 'market-assistant',
): Promise<AgentConversation> {
  return harness.request<AgentConversation>('/api/agent/conversations', {
    method: 'POST',
    body: JSON.stringify({ agentId, context: { selectedSymbol: 'BTC' } }),
  });
}

describe('agent integration: a streamed answer', () => {
  it('streams text and persists the turn', async () => {
    const harness = await startAgentHarness({
      turns: [{ kind: 'text', text: 'Open interest is building into the print.' }],
    });
    try {
      const conv = await conversation(harness);
      const events = await harness.send(conv.id, { message: 'What is happening?' });

      const types = events.map((event) => event.type);
      assert.equal(types[0], 'RUN_STARTED');
      assert.ok(types.includes('AGENT_STARTED'));
      assert.ok(types.includes('MODEL_STARTED'));
      assert.ok(types.includes('TEXT_DELTA'));
      assert.ok(types.includes('MESSAGE_COMPLETED'));
      assert.equal(types.at(-1), 'RUN_COMPLETED');

      assert.equal(streamedText(events), 'Open interest is building into the print.');

      const [completed] = eventsOfType(events, 'MESSAGE_COMPLETED');
      assert.equal(completed.text, 'Open interest is building into the print.');
      assert.equal(completed.model?.providerId, 'harness');
      assert.equal(completed.model?.modelId, 'fake-model-1');

      const [done] = eventsOfType(events, 'RUN_COMPLETED');
      assert.ok(done.usage.totalTokens > 0);

      const stored = await harness.request<{ messages: AgentMessage[] }>(
        `/api/agent/conversations/${conv.id}/messages`,
      );
      assert.equal(stored.messages.length, 2);
      assert.equal(stored.messages[0].role, 'user');
      assert.equal(stored.messages[0].text, 'What is happening?');
      assert.equal(stored.messages[1].role, 'assistant');
      assert.equal(stored.messages[1].text, 'Open interest is building into the print.');
    } finally {
      await harness.close();
    }
  });

  it('names a new conversation from its first message', async () => {
    const harness = await startAgentHarness({ turns: [{ kind: 'text', text: 'Sure.' }] });
    try {
      const conv = await conversation(harness);
      assert.equal(conv.title, 'New conversation');
      await harness.send(conv.id, { message: 'Brief me on the CPI print' });

      const reloaded = await harness.request<AgentConversation>(
        `/api/agent/conversations/${conv.id}`,
      );
      assert.equal(reloaded.title, 'Brief me on the CPI print');
    } finally {
      await harness.close();
    }
  });

  it('carries history into the next turn', async () => {
    const harness = await startAgentHarness({
      turns: [
        { kind: 'text', text: 'First.' },
        { kind: 'text', text: 'Second.' },
      ],
    });
    try {
      const conv = await conversation(harness);
      await harness.send(conv.id, { message: 'One' });
      await harness.send(conv.id, { message: 'Two' });

      // The second model call must see the first exchange: that is the session
      // store doing its job, not the client resending history.
      const second = harness.fake.requests.at(-1) as { messages: { content: unknown }[] };
      const transcript = JSON.stringify(second.messages);
      assert.match(transcript, /One/);
      assert.match(transcript, /First\./);
      assert.match(transcript, /Two/);

      const stored = await harness.request<{ messages: AgentMessage[] }>(
        `/api/agent/conversations/${conv.id}/messages`,
      );
      assert.equal(stored.messages.length, 4);
    } finally {
      await harness.close();
    }
  });
});

describe('agent integration: application data', () => {
  it('reads market data through a tool and cites it', async () => {
    const harness = await startAgentHarness({
      turns: [
        { kind: 'tool', name: 'get_market_snapshot', args: { symbol: 'BTC' } },
        { kind: 'text', text: 'BTC open interest is elevated [1].' },
      ],
    });
    try {
      const conv = await conversation(harness, 'market-analyst');
      const events = await harness.send(conv.id, { message: 'Read BTC' });

      const [started] = eventsOfType(events, 'TOOL_STARTED');
      assert.equal(started.run.tool, 'get_market_snapshot');
      assert.equal(started.run.label, 'Reading BTC market data');

      const [completed] = eventsOfType(events, 'TOOL_COMPLETED');
      assert.equal(completed.run.status, 'completed');
      assert.ok((completed.run.durationMs ?? 0) >= 0);
      // Collapsed, the card shows a summary and not a payload.
      assert.match(String(completed.run.summary), /BTC/);
      assert.equal(completed.run.output, undefined);

      const references = eventsOfType(events, 'REFERENCE_ADDED');
      assert.equal(references.length, 1);
      assert.equal(references[0].reference.type, 'market_data');
      assert.equal(references[0].citationIndex, 1);

      const [message] = eventsOfType(events, 'MESSAGE_COMPLETED');
      assert.equal(message.text, 'BTC open interest is elevated [1].');
      assert.equal(message.references.length, 1);
    } finally {
      await harness.close();
    }
  });

  it('reads the chart context the client reported', async () => {
    const harness = await startAgentHarness({
      turns: [
        { kind: 'tool', name: 'get_current_chart', args: {} },
        { kind: 'text', text: 'You are on BTC, 4H.' },
      ],
    });
    try {
      const conv = await conversation(harness, 'market-analyst');
      const events = await harness.send(conv.id, {
        message: 'What am I looking at?',
        context: { selectedSymbol: 'BTC', selectedTimeframe: '4H', activeChartId: 'chart_1' },
      });

      const [completed] = eventsOfType(events, 'TOOL_COMPLETED');
      assert.equal(completed.run.tool, 'get_current_chart');
      assert.equal(completed.run.summary, 'BTC · 4H');
    } finally {
      await harness.close();
    }
  });

  it('reads application news and produces an openable citation', async () => {
    const harness = await startAgentHarness({
      turns: [
        { kind: 'tool', name: 'get_latest_news', args: { limit: 5, symbols: [] } },
        { kind: 'text', text: 'The calendar printed several releases [1].' },
      ],
    });
    try {
      // Ingest the seeded calendar into the news store first.
      await harness.request('/api/news/refresh', { method: 'POST' });

      const conv = await conversation(harness, 'news-research');
      const events = await harness.send(conv.id, { message: 'What is the latest?' });

      const references = eventsOfType(events, 'REFERENCE_ADDED');
      assert.ok(references.length > 0);
      const first = references[0].reference;
      assert.equal(first.type, 'news');
      assert.match(String(first.entityId), /^news_/);

      // The promise the citation architecture makes: the id resolves.
      const article = await harness.request<{ id: string; title: string; source: string }>(
        `/api/news/${first.entityId}`,
      );
      assert.equal(article.id, first.entityId);
      assert.equal(article.title, first.title);
      assert.equal(article.source, 'MarketPulse Calendar');
    } finally {
      await harness.close();
    }
  });

  it('reports a missing news article as unavailable rather than inventing one', async () => {
    const harness = await startAgentHarness({
      turns: [
        { kind: 'tool', name: 'get_news_item', args: { id: 'news_does_not_exist' } },
        { kind: 'text', text: 'I could not find that article.' },
      ],
    });
    try {
      const conv = await conversation(harness, 'news-research');
      const events = await harness.send(conv.id, { message: 'Open that story' });

      const [failed] = eventsOfType(events, 'TOOL_FAILED');
      assert.equal(failed.run.error?.code, 'news_unavailable');
      // The run continues: the model is told, and answers honestly.
      assert.equal(eventsOfType(events, 'RUN_COMPLETED').length, 1);
    } finally {
      await harness.close();
    }
  });

  it('delegates to a specialist through an agent tool', async () => {
    const harness = await startAgentHarness({
      turns: [
        // The orchestrator delegates…
        { kind: 'tool', name: 'ask_market_analyst', args: { input: 'Read BTC open interest' } },
        // …the specialist reads a tool…
        { kind: 'tool', name: 'get_open_interest', args: { symbol: 'BTC' } },
        // …answers…
        { kind: 'text', text: 'Open interest is $38B.' },
        // …and the orchestrator folds it in.
        { kind: 'text', text: 'Open interest sits near $38B [1].' },
      ],
    });
    try {
      const conv = await conversation(harness);
      const events = await harness.send(conv.id, { message: 'How is BTC positioned?' });

      const tools = eventsOfType(events, 'TOOL_COMPLETED').map((event) => event.run.tool);
      assert.ok(tools.includes('get_open_interest'));

      const [message] = eventsOfType(events, 'MESSAGE_COMPLETED');
      assert.match(message.text, /38B/);
      // The specialist's reference is carried up into the user-facing answer.
      assert.ok(message.references.length >= 1);
    } finally {
      await harness.close();
    }
  });
});

describe('agent integration: citations cannot be fabricated', () => {
  it('strips a citation index no tool produced', async () => {
    const harness = await startAgentHarness({
      turns: [{ kind: 'text', text: 'Inflation is cooling [1], say analysts [4].' }],
    });
    try {
      const conv = await conversation(harness);
      const events = await harness.send(conv.id, { message: 'Is inflation cooling?' });

      const [message] = eventsOfType(events, 'MESSAGE_COMPLETED');
      // No tool ran, so no index resolves and every marker goes.
      assert.equal(message.text, 'Inflation is cooling, say analysts.');
      assert.equal(message.references.length, 0);

      const stored = await harness.request<{ messages: AgentMessage[] }>(
        `/api/agent/conversations/${conv.id}/messages`,
      );
      assert.equal(stored.messages[1].text.includes('['), false);
    } finally {
      await harness.close();
    }
  });

  it('keeps the citations that do resolve', async () => {
    const harness = await startAgentHarness({
      turns: [
        { kind: 'tool', name: 'get_market_snapshot', args: { symbol: 'BTC' } },
        { kind: 'text', text: 'Price is where it is [1], and elsewhere [5].' },
      ],
    });
    try {
      const conv = await conversation(harness, 'market-analyst');
      const events = await harness.send(conv.id, { message: 'Read BTC' });
      const [message] = eventsOfType(events, 'MESSAGE_COMPLETED');

      assert.match(message.text, /\[1\]/);
      assert.equal(message.text.includes('[5]'), false);
      assert.equal(message.references.length, 1);
      assert.equal(message.references[0].citationIndex, 1);
    } finally {
      await harness.close();
    }
  });
});

describe('agent integration: conversations', () => {
  it('lists, renames, pins and deletes', async () => {
    const harness = await startAgentHarness({ turns: [{ kind: 'text', text: 'ok' }] });
    try {
      const first = await conversation(harness);
      const second = await conversation(harness);

      await harness.request(`/api/agent/conversations/${first.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: 'Funding deep dive', pinned: true }),
      });

      const page = await harness.request<{ items: AgentConversation[] }>(
        '/api/agent/conversations',
      );
      assert.equal(page.items[0].id, first.id, 'pinned conversations sort first');
      assert.equal(page.items[0].title, 'Funding deep dive');
      assert.equal(page.items.length, 2);

      const searched = await harness.request<{ items: AgentConversation[] }>(
        '/api/agent/conversations?q=funding',
      );
      assert.deepEqual(
        searched.items.map((entry) => entry.id),
        [first.id],
      );

      await harness.request(`/api/agent/conversations/${second.id}`, { method: 'DELETE' });
      const after = await harness.request<{ items: AgentConversation[] }>(
        '/api/agent/conversations',
      );
      assert.equal(after.items.length, 1);
    } finally {
      await harness.close();
    }
  });

  it('survives a restart of the client, because the server holds the history', async () => {
    const harness = await startAgentHarness({ turns: [{ kind: 'text', text: 'Remembered.' }] });
    try {
      const conv = await conversation(harness);
      await harness.send(conv.id, { message: 'Remember this' });

      // A brand-new client with the same token — the reload case.
      const reread = await harness.request<{ messages: AgentMessage[] }>(
        `/api/agent/conversations/${conv.id}/messages`,
      );
      assert.equal(reread.messages.length, 2);
      assert.equal(reread.messages[1].text, 'Remembered.');
    } finally {
      await harness.close();
    }
  });
});

describe('agent integration: authorization', () => {
  it('refuses every agent endpoint without a token', async () => {
    const harness = await startAgentHarness({ turns: [{ kind: 'text', text: 'ok' }] });
    try {
      for (const path of [
        '/api/agent/bootstrap',
        '/api/agent/conversations',
        '/api/agent/agents',
        '/api/settings/ai',
        '/api/settings/ai/providers',
      ]) {
        const response = await fetch(`${harness.url}${path}`);
        assert.equal(response.status, 401, path);
      }
    } finally {
      await harness.close();
    }
  });

  it('refuses a forged token', async () => {
    const harness = await startAgentHarness({ turns: [{ kind: 'text', text: 'ok' }] });
    try {
      const response = await fetch(`${harness.url}/api/agent/bootstrap`, {
        headers: { authorization: 'Bearer not.a.real.token' },
      });
      assert.equal(response.status, 401);
    } finally {
      await harness.close();
    }
  });

  it('does not return another device’s conversations', async () => {
    const harness = await startAgentHarness({ turns: [{ kind: 'text', text: 'ok' }] });
    try {
      const mine = await conversation(harness);

      const other = (await (
        await fetch(`${harness.url}/api/agent/auth/device`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ deviceId: 'integration-device-2' }),
        })
      ).json()) as { token: string };

      const theirs = await (
        await fetch(`${harness.url}/api/agent/conversations`, {
          headers: { authorization: `Bearer ${other.token}` },
        })
      ).json();
      assert.deepEqual((theirs as { items: unknown[] }).items, []);

      // And a direct read of the id is a 404, not a leak.
      const direct = await fetch(`${harness.url}/api/agent/conversations/${mine.id}`, {
        headers: { authorization: `Bearer ${other.token}` },
      });
      assert.equal(direct.status, 404);
    } finally {
      await harness.close();
    }
  });

  it('never returns an API key from the settings API', async () => {
    const harness = await startAgentHarness({ turns: [{ kind: 'text', text: 'ok' }] });
    try {
      const settings = await harness.request('/api/settings/ai');
      const serialised = JSON.stringify(settings);
      assert.equal(serialised.includes('harness-key'), false);
      assert.match(serialised, /apiKeyPreview/);
    } finally {
      await harness.close();
    }
  });

  it('rejects a malformed request body at the edge', async () => {
    const harness = await startAgentHarness({ turns: [{ kind: 'text', text: 'ok' }] });
    try {
      const conv = await conversation(harness);
      const response = await harness.rawRequest(`/api/agent/conversations/${conv.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ message: '' }),
      });
      assert.equal(response.status, 400);
    } finally {
      await harness.close();
    }
  });
});

describe('agent integration: bootstrap', () => {
  it('reports readiness, agents and tools in one round trip', async () => {
    const harness = await startAgentHarness({ turns: [{ kind: 'text', text: 'ok' }] });
    try {
      const bootstrap = await harness.request<{
        ready: boolean;
        defaultAgentId: string;
        agents: { id: string; model: unknown; toolNames: string[] }[];
        tools: { name: string; capability: string }[];
      }>('/api/agent/bootstrap');

      assert.equal(bootstrap.ready, true);
      assert.equal(bootstrap.defaultAgentId, 'market-assistant');
      assert.ok(bootstrap.agents.length >= 4);

      const analyst = bootstrap.agents.find((agent) => agent.id === 'market-analyst');
      assert.ok(analyst?.toolNames.includes('get_market_snapshot'));
      // The analyst holds no web capability, so it is never offered web tools.
      assert.equal(analyst?.toolNames.includes('web_search'), false);

      assert.ok(bootstrap.tools.some((tool) => tool.name === 'web_search'));
    } finally {
      await harness.close();
    }
  });
});

describe('agent integration: the run inspector', () => {
  it('records what the run did, and only behind debug mode', async () => {
    const harness = await startAgentHarness({
      turns: [
        { kind: 'tool', name: 'get_market_snapshot', args: { symbol: 'BTC' } },
        { kind: 'text', text: 'Reading the tape [1].' },
      ],
    });
    try {
      const conv = await conversation(harness, 'market-analyst');
      await harness.send(conv.id, { message: 'Read BTC' });

      // Off by default: the inspector is a developer surface, not a default one.
      const hidden = await harness.request<{ debugMode: boolean; runs: unknown[] }>(
        `/api/agent/runs?conversationId=${conv.id}`,
      );
      assert.equal(hidden.debugMode, false);
      assert.deepEqual(hidden.runs, []);

      await harness.request('/api/settings/ai/privacy', {
        method: 'PATCH',
        body: JSON.stringify({ debugMode: true }),
      });

      const shown = await harness.request<{
        debugMode: boolean;
        runs: {
          status: string;
          toolCalls: number;
          referenceCount: number;
          firstTokenMs: number | null;
          model: { providerId: string; modelId: string } | null;
          fallbackFrom: unknown;
        }[];
      }>(`/api/agent/runs?conversationId=${conv.id}`);

      assert.equal(shown.debugMode, true);
      assert.equal(shown.runs.length, 1);
      const [run] = shown.runs;
      assert.equal(run.status, 'completed');
      assert.equal(run.toolCalls, 1);
      assert.equal(run.referenceCount, 1);
      assert.equal(typeof run.firstTokenMs, 'number');
      // The model that actually served the run, recorded whether or not it was
      // the one the run started on.
      assert.equal(run.model?.providerId, 'harness');
      assert.equal(run.model?.modelId, 'fake-model-1');
      assert.equal(run.fallbackFrom, null);

      // Operational numbers only: nothing the user or the model said.
      assert.equal(JSON.stringify(shown).includes('Read BTC'), false);
      assert.equal(JSON.stringify(shown).includes('Reading the tape'), false);
    } finally {
      await harness.close();
    }
  });
});
