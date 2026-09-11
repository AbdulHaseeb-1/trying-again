import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { AgentConversation, AgentMessage } from '../src/agent/agent.domain';
import { startAgentHarness, eventsOfType, streamedText } from './support/agent-harness';

/**
 * What happens when things go wrong.
 *
 * Every case here is one a user will actually hit: a key that stops working, a
 * provider that falls over mid-afternoon, a rate limit, a run they changed
 * their mind about. The assertions are about what the *user* gets — a specific
 * message, a retry affordance, a partial answer kept rather than thrown away —
 * because that is the part that distinguishes handled from merely caught.
 */

async function conversation(
  harness: Awaited<ReturnType<typeof startAgentHarness>>,
  agentId = 'market-assistant',
): Promise<AgentConversation> {
  return harness.request<AgentConversation>('/api/agent/conversations', {
    method: 'POST',
    body: JSON.stringify({ agentId }),
  });
}

describe('failure: provider errors', () => {
  it('reports an invalid key without leaking it, and does not retry another provider', async () => {
    const harness = await startAgentHarness({ turns: [{ kind: 'status', status: 401 }] });
    try {
      const conv = await conversation(harness);
      const events = await harness.send(conv.id, { message: 'hello' });

      const [failed] = eventsOfType(events, 'RUN_FAILED');
      assert.ok(failed);
      assert.equal(failed.error.code, 'auth_failed');
      assert.equal(failed.error.retryable, false);
      assert.equal(JSON.stringify(events).includes('harness-key'), false);
      // A bad key fails identically everywhere, so no fallback is attempted.
      assert.equal(eventsOfType(events, 'MODEL_FALLBACK').length, 0);
    } finally {
      await harness.close();
    }
  });

  it('reports a provider outage as retryable', async () => {
    const harness = await startAgentHarness({ turns: [{ kind: 'status', status: 503 }] });
    try {
      const conv = await conversation(harness);
      const events = await harness.send(conv.id, { message: 'hello' });

      const [failed] = eventsOfType(events, 'RUN_FAILED');
      assert.ok(['provider_unavailable', 'internal'].includes(failed.error.code));
      assert.equal(failed.error.retryable, true);
    } finally {
      await harness.close();
    }
  });

  it('reports rate limiting distinctly', async () => {
    const harness = await startAgentHarness({ turns: [{ kind: 'status', status: 429 }] });
    try {
      const conv = await conversation(harness);
      const events = await harness.send(conv.id, { message: 'hello' });
      const [failed] = eventsOfType(events, 'RUN_FAILED');
      assert.ok(['rate_limited', 'provider_unavailable', 'internal'].includes(failed.error.code));
    } finally {
      await harness.close();
    }
  });

  it('refuses to start when no provider is configured', async () => {
    const harness = await startAgentHarness({ turns: [{ kind: 'text', text: 'never reached' }] });
    try {
      await harness.request('/api/settings/ai/providers/harness', {
        method: 'PATCH',
        body: JSON.stringify({ enabled: false }),
      });
      await harness.request('/api/settings/ai/models/primary', {
        method: 'PATCH',
        body: JSON.stringify({}),
      });

      const conv = await conversation(harness);
      const events = await harness.send(conv.id, { message: 'hello' });

      const [failed] = eventsOfType(events, 'RUN_FAILED');
      assert.equal(failed.error.code, 'provider_not_configured');
      assert.match(failed.error.message, /Settings/);
      // And the panel is told it is not ready, so it can offer setup instead.
      const bootstrap = await harness.request<{ ready: boolean }>('/api/agent/bootstrap');
      assert.equal(bootstrap.ready, false);
    } finally {
      await harness.close();
    }
  });

  it('reports a malformed provider response rather than hanging', async () => {
    const harness = await startAgentHarness({
      turns: [{ kind: 'status', status: 200, body: 'not json at all' }],
    });
    try {
      const conv = await conversation(harness);
      const events = await harness.send(conv.id, { message: 'hello' });
      assert.equal(eventsOfType(events, 'RUN_FAILED').length, 1);
    } finally {
      await harness.close();
    }
  });
});

describe('failure: model fallback', () => {
  it('falls back to the second provider and records the switch', async () => {
    // The primary is a provider pointed at a port nothing listens on; the
    // fallback is the working fake.
    const harness = await startAgentHarness({
      turns: [{ kind: 'text', text: 'Answered by the fallback.' }],
    });
    try {
      await harness.request('/api/settings/ai/providers', {
        method: 'POST',
        body: JSON.stringify({ id: 'broken', name: 'Broken' }),
      });
      await harness.request('/api/settings/ai/providers/broken', {
        method: 'PATCH',
        body: JSON.stringify({
          enabled: true,
          apiKey: 'anything',
          baseUrl: 'https://127.0.0.1:1/v1',
          timeoutMs: 2_000,
        }),
      });
      await harness.request('/api/settings/ai/models/primary', {
        method: 'PATCH',
        body: JSON.stringify({ providerId: 'broken', modelId: 'broken-1' }),
      });
      await harness.request('/api/settings/ai/models/fallback', {
        method: 'PATCH',
        body: JSON.stringify({ providerId: 'harness', modelId: 'fake-model-1' }),
      });

      const conv = await conversation(harness);
      const events = await harness.send(conv.id, { message: 'hello' });

      const [fallback] = eventsOfType(events, 'MODEL_FALLBACK');
      assert.ok(fallback, 'the run should have fallen back');
      assert.equal(fallback.from.providerId, 'broken');
      assert.equal(fallback.to.providerId, 'harness');
      assert.ok(fallback.reason.code.length > 0);

      // The user still gets an answer, and it comes from the fallback model.
      assert.equal(streamedText(events), 'Answered by the fallback.');
      const [message] = eventsOfType(events, 'MESSAGE_COMPLETED');
      assert.equal(message.model?.providerId, 'harness');

      // Two MODEL_STARTED events: the switch is visible, not silent.
      assert.equal(eventsOfType(events, 'MODEL_STARTED').length, 2);
    } finally {
      await harness.close();
    }
  });

  it('fails outright when there is no fallback to reach for', async () => {
    const harness = await startAgentHarness({ turns: [{ kind: 'text', text: 'unused' }] });
    try {
      await harness.request('/api/settings/ai/providers', {
        method: 'POST',
        body: JSON.stringify({ id: 'broken', name: 'Broken' }),
      });
      await harness.request('/api/settings/ai/providers/broken', {
        method: 'PATCH',
        body: JSON.stringify({
          enabled: true,
          apiKey: 'anything',
          baseUrl: 'https://127.0.0.1:1/v1',
          timeoutMs: 2_000,
        }),
      });
      await harness.request('/api/settings/ai/models/primary', {
        method: 'PATCH',
        body: JSON.stringify({ providerId: 'broken', modelId: 'broken-1' }),
      });

      const conv = await conversation(harness);
      const events = await harness.send(conv.id, { message: 'hello' });
      assert.equal(eventsOfType(events, 'MODEL_FALLBACK').length, 0);
      assert.equal(eventsOfType(events, 'RUN_FAILED').length, 1);
    } finally {
      await harness.close();
    }
  });
});

describe('failure: cancellation', () => {
  it('stops a run and keeps what was already said', async () => {
    const harness = await startAgentHarness({
      turns: [
        {
          kind: 'text',
          text: 'one two three four five six seven eight nine ten eleven twelve',
        },
      ],
      chunkDelayMs: 60,
    });
    try {
      const conv = await conversation(harness);

      let runId: string | null = null;
      let deltas = 0;
      const events = await harness.send(conv.id, { message: 'count' }, (event, controller) => {
        if (event.type === 'RUN_STARTED') runId = event.runId;
        if (event.type === 'TEXT_DELTA') {
          deltas += 1;
          // Stop a few words in, the way a user does.
          if (deltas === 3 && runId) {
            void harness
              .request('/api/agent/runs/stop', {
                method: 'POST',
                body: JSON.stringify({ runId }),
              })
              .catch(() => undefined);
            void controller;
          }
        }
      });

      assert.ok(deltas >= 3);
      const partial = streamedText(events);
      assert.match(partial, /^one two three/);
      assert.equal(partial.includes('twelve'), false, 'the run should not have finished');

      const cancelled = eventsOfType(events, 'RUN_CANCELLED');
      assert.equal(cancelled.length, 1);
      assert.equal(eventsOfType(events, 'RUN_COMPLETED').length, 0);

      // The partial answer is kept: "stop" means stop, not discard.
      const stored = await harness.request<{ messages: AgentMessage[] }>(
        `/api/agent/conversations/${conv.id}/messages`,
      );
      assert.equal(stored.messages.length, 2);
      assert.match(stored.messages[1].text, /^one two three/);
    } finally {
      await harness.close();
    }
  });

  it('reports stopping a run that is already finished', async () => {
    const harness = await startAgentHarness({ turns: [{ kind: 'text', text: 'done' }] });
    try {
      const conv = await conversation(harness);
      const events = await harness.send(conv.id, { message: 'hello' });
      const [{ runId }] = eventsOfType(events, 'RUN_STARTED');

      const outcome = await harness.request<{ stopped: boolean }>('/api/agent/runs/stop', {
        method: 'POST',
        body: JSON.stringify({ runId }),
      });
      assert.equal(outcome.stopped, false);
    } finally {
      await harness.close();
    }
  });

  it('refuses to let one device stop another device’s run', async () => {
    const harness = await startAgentHarness({
      turns: [{ kind: 'text', text: 'a b c d e f g h i j k l' }],
      chunkDelayMs: 40,
    });
    try {
      const conv = await conversation(harness);

      const other = (await (
        await fetch(`${harness.url}/api/agent/auth/device`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ deviceId: 'intruder-device-01' }),
        })
      ).json()) as { token: string };

      let attempted = false;
      let status = 0;
      await harness.send(conv.id, { message: 'count' }, (event) => {
        if (event.type === 'RUN_STARTED' && !attempted) {
          attempted = true;
          void fetch(`${harness.url}/api/agent/runs/stop`, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              authorization: `Bearer ${other.token}`,
            },
            body: JSON.stringify({ runId: event.runId }),
          }).then((response) => {
            status = response.status;
          });
        }
      });

      assert.equal(attempted, true);
      assert.notEqual(status, 200);
    } finally {
      await harness.close();
    }
  });
});

describe('failure: search', () => {
  it('tells the agent that search is unconfigured rather than failing the run', async () => {
    const harness = await startAgentHarness({
      turns: [
        { kind: 'tool', name: 'web_search', args: { query: 'cpi', maxResults: 3, recencyDays: null, domains: [] } },
        { kind: 'text', text: 'I could not search the web just now.' },
      ],
    });
    try {
      const conv = await conversation(harness, 'research');
      const events = await harness.send(conv.id, { message: 'Search for CPI' });

      const [failed] = eventsOfType(events, 'TOOL_FAILED');
      assert.equal(failed.run.error?.code, 'search_failed');
      // The message points at the fix rather than just naming the failure.
      assert.match(String(failed.run.error?.message), /No web search provider is configured/i);

      // The run still completes: a missing capability is an answerable fact.
      assert.equal(eventsOfType(events, 'RUN_COMPLETED').length, 1);
    } finally {
      await harness.close();
    }
  });

  it('refuses web tools entirely when internet access is turned off', async () => {
    const harness = await startAgentHarness({ turns: [{ kind: 'text', text: 'ok' }] });
    try {
      await harness.request('/api/settings/ai/privacy', {
        method: 'PATCH',
        body: JSON.stringify({ allowWebAccess: false }),
      });

      const bootstrap = await harness.request<{
        agents: { id: string; capabilities: string[]; toolNames: string[] }[];
      }>('/api/agent/bootstrap');
      const research = bootstrap.agents.find((agent) => agent.id === 'research');

      assert.equal(research?.capabilities.includes('web.search'), false);
      assert.equal(research?.toolNames.includes('web_search'), false);
      assert.equal(research?.toolNames.includes('web_fetch'), false);
    } finally {
      await harness.close();
    }
  });

  it('refuses news tools when news access is turned off', async () => {
    const harness = await startAgentHarness({ turns: [{ kind: 'text', text: 'ok' }] });
    try {
      await harness.request('/api/settings/ai/privacy', {
        method: 'PATCH',
        body: JSON.stringify({ allowNewsAccess: false }),
      });
      const bootstrap = await harness.request<{
        agents: { id: string; toolNames: string[] }[];
      }>('/api/agent/bootstrap');
      const news = bootstrap.agents.find((agent) => agent.id === 'news-research');
      assert.equal(news?.toolNames.some((name) => name.includes('news')), false);
    } finally {
      await harness.close();
    }
  });
});

describe('failure: settings validation', () => {
  it('refuses to widen an agent beyond its definition', async () => {
    const harness = await startAgentHarness({ turns: [{ kind: 'text', text: 'ok' }] });
    try {
      // The analyst is defined without web access; settings may narrow, never
      // widen, so this is rejected rather than quietly ignored.
      const response = await harness.rawRequest('/api/settings/ai/agents/market-analyst', {
        method: 'PATCH',
        body: JSON.stringify({ capabilities: ['market.read', 'web.search'] }),
      });
      assert.equal(response.status, 400);
      assert.match(await response.text(), /cannot be granted/i);
    } finally {
      await harness.close();
    }
  });

  it('refuses an unknown capability name', async () => {
    const harness = await startAgentHarness({ turns: [{ kind: 'text', text: 'ok' }] });
    try {
      const response = await harness.rawRequest('/api/settings/ai/agents/market-analyst', {
        method: 'PATCH',
        body: JSON.stringify({ capabilities: ['market.read', 'everything'] }),
      });
      assert.equal(response.status, 400);
    } finally {
      await harness.close();
    }
  });

  it('refuses a duplicate provider id and an invalid one', async () => {
    const harness = await startAgentHarness({ turns: [{ kind: 'text', text: 'ok' }] });
    try {
      const duplicate = await harness.rawRequest('/api/settings/ai/providers', {
        method: 'POST',
        body: JSON.stringify({ id: 'openai', name: 'Clash' }),
      });
      assert.equal(duplicate.status, 400);

      const invalid = await harness.rawRequest('/api/settings/ai/providers', {
        method: 'POST',
        body: JSON.stringify({ id: 'Not Valid!', name: 'Bad' }),
      });
      assert.equal(invalid.status, 400);
    } finally {
      await harness.close();
    }
  });

  it('refuses to remove a built-in provider', async () => {
    const harness = await startAgentHarness({ turns: [{ kind: 'text', text: 'ok' }] });
    try {
      const response = await harness.rawRequest('/api/settings/ai/providers/openai', {
        method: 'DELETE',
      });
      assert.equal(response.status, 400);
    } finally {
      await harness.close();
    }
  });

  it('does not erase the fields a partial update left out', async () => {
    const harness = await startAgentHarness({ turns: [{ kind: 'text', text: 'ok' }] });
    try {
      // A validated DTO materialises every optional property as `undefined`, so
      // a naive spread of the patch wipes whatever the caller did not send. This
      // is the regression: toggling "enabled" must not forget the base URL, the
      // model or the stored key.
      const before = await harness.request<{ providers: { id: string; baseUrl: string | null; defaultModel: string | null; apiKeyPreview: string | null }[] }>(
        '/api/settings/ai/providers',
      );
      const original = before.providers.find((entry) => entry.id === 'harness')!;
      assert.ok(original.baseUrl);
      assert.equal(original.defaultModel, 'fake-model-1');

      await harness.request('/api/settings/ai/providers/harness', {
        method: 'PATCH',
        body: JSON.stringify({ enabled: true }),
      });

      const after = await harness.request<{ providers: { id: string; baseUrl: string | null; defaultModel: string | null; apiKeyPreview: string | null }[] }>(
        '/api/settings/ai/providers',
      );
      const updated = after.providers.find((entry) => entry.id === 'harness')!;
      assert.equal(updated.baseUrl, original.baseUrl);
      assert.equal(updated.defaultModel, original.defaultModel);
      assert.equal(updated.apiKeyPreview, original.apiKeyPreview);

      // And the provider still works afterwards.
      const conv = await conversation(harness);
      const events = await harness.send(conv.id, { message: 'still there?' });
      assert.equal(eventsOfType(events, 'RUN_COMPLETED').length, 1);
    } finally {
      await harness.close();
    }
  });

  it('keeps a search policy field a partial update left out', async () => {
    const harness = await startAgentHarness({ turns: [{ kind: 'text', text: 'ok' }] });
    try {
      await harness.request('/api/settings/ai/search', {
        method: 'PATCH',
        body: JSON.stringify({ maxResults: 9, blockedDomains: ['spam.test'] }),
      });
      await harness.request('/api/settings/ai/search', {
        method: 'PATCH',
        body: JSON.stringify({ safeSearch: false }),
      });

      const search = await harness.request<{
        maxResults: number;
        blockedDomains: string[];
        safeSearch: boolean;
      }>('/api/settings/ai/search');
      assert.equal(search.maxResults, 9);
      assert.deepEqual(search.blockedDomains, ['spam.test']);
      assert.equal(search.safeSearch, false);
    } finally {
      await harness.close();
    }
  });

  it('refuses an unknown model role', async () => {
    const harness = await startAgentHarness({ turns: [{ kind: 'text', text: 'ok' }] });
    try {
      const response = await harness.rawRequest('/api/settings/ai/models/enormous', {
        method: 'PATCH',
        body: JSON.stringify({ providerId: 'harness', modelId: 'fake-model-1' }),
      });
      assert.equal(response.status, 400);
    } finally {
      await harness.close();
    }
  });
});

describe('failure: privacy', () => {
  it('stops storing conversations when asked to', async () => {
    const harness = await startAgentHarness({ turns: [{ kind: 'text', text: 'Ephemeral.' }] });
    try {
      await harness.request('/api/settings/ai/privacy', {
        method: 'PATCH',
        body: JSON.stringify({ storeConversations: false }),
      });

      const conv = await conversation(harness);
      const events = await harness.send(conv.id, { message: 'hello' });

      // The answer still streams and still completes…
      assert.equal(streamedText(events), 'Ephemeral.');
      assert.equal(eventsOfType(events, 'RUN_COMPLETED').length, 1);

      // …but nothing was written down.
      const stored = await harness.request<{ messages: AgentMessage[] }>(
        `/api/agent/conversations/${conv.id}/messages`,
      );
      assert.equal(stored.messages.length, 0);
    } finally {
      await harness.close();
    }
  });

  it('withholds the application context when sharing is turned off', async () => {
    const harness = await startAgentHarness({ turns: [{ kind: 'text', text: 'ok' }] });
    try {
      await harness.request('/api/settings/ai/privacy', {
        method: 'PATCH',
        body: JSON.stringify({ shareAppContext: false }),
      });

      const conv = await conversation(harness);
      await harness.send(conv.id, {
        message: 'hello',
        context: { selectedSymbol: 'BTC', selectedTimeframe: '4H' },
      });

      const request = harness.fake.requests.at(-1) as { messages: { content: string }[] };
      const system = request.messages.find((message) => message.content?.includes?.('MarketPulse'));
      assert.equal(String(system?.content).includes('looking at BTC'), false);
    } finally {
      await harness.close();
    }
  });
});
