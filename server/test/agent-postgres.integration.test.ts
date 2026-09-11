import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { AgentConversation, AgentMessage } from '../src/agent/agent.domain';
import { startAgentHarness, eventsOfType } from './support/agent-harness';

/**
 * The same flows, against a real Postgres.
 *
 * Everything else runs on the file backing, which is the default when no
 * database is configured. This suite is the proof that the *other* path is real
 * too: that conversations, messages, citations, session items and run telemetry
 * survive a round trip through Prisma, and that reads are scoped by principal
 * in SQL and not only in JavaScript.
 *
 * Opt-in, like the archive tests it sits beside:
 *
 *     TEST_DATABASE_URL=postgresql://…/marketpulse_test npm test
 */
const DATABASE_URL = process.env.TEST_DATABASE_URL;
const reason = 'set TEST_DATABASE_URL to run the Postgres agent tests';

async function truncate(url: string): Promise<void> {
  const { PrismaClient } = (await import('../src/generated/prisma/client')) as {
    PrismaClient: new (options: unknown) => {
      $executeRawUnsafe: (sql: string) => Promise<unknown>;
      $disconnect: () => Promise<void>;
    };
  };
  const { PrismaPg } = await import('@prisma/adapter-pg');
  const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    await client.$executeRawUnsafe(
      'TRUNCATE TABLE agent_message_reference, agent_reference, agent_message, agent_session_item, agent_run, agent_conversation, agent_device, agent_secret, app_setting, news_item RESTART IDENTITY CASCADE',
    );
  } finally {
    await client.$disconnect();
  }
}

describe('agent persistence on Postgres', { skip: DATABASE_URL ? false : reason }, () => {
  before(async () => {
    await truncate(DATABASE_URL!);
  });

  after(async () => {
    await truncate(DATABASE_URL!);
  });

  it('reports Postgres as the storage backend', async () => {
    const harness = await startAgentHarness({
      turns: [{ kind: 'text', text: 'ok' }],
      env: { DATABASE_URL: DATABASE_URL! },
    });
    try {
      const bootstrap = await harness.request<{ storage: string; newsStorage: string }>(
        '/api/agent/bootstrap',
      );
      assert.equal(bootstrap.storage, 'postgres');
      assert.equal(bootstrap.newsStorage, 'postgres');
    } finally {
      await harness.close();
    }
  });

  it('stores a turn, its citations and its tool activity', async () => {
    const harness = await startAgentHarness({
      turns: [
        { kind: 'tool', name: 'get_market_snapshot', args: { symbol: 'BTC' } },
        { kind: 'text', text: 'BTC is where the snapshot says [1].' },
      ],
      env: { DATABASE_URL: DATABASE_URL! },
    });
    try {
      const conversation = await harness.request<AgentConversation>('/api/agent/conversations', {
        method: 'POST',
        body: JSON.stringify({ agentId: 'market-analyst' }),
      });
      const events = await harness.send(conversation.id, { message: 'Read BTC' });
      assert.equal(eventsOfType(events, 'RUN_COMPLETED').length, 1);

      const stored = await harness.request<{ messages: AgentMessage[] }>(
        `/api/agent/conversations/${conversation.id}/messages`,
      );
      assert.equal(stored.messages.length, 2);

      const answer = stored.messages[1];
      assert.match(answer.text, /\[1\]/);
      // The join row came back: the citation index survived the round trip.
      assert.equal(answer.references.length, 1);
      assert.equal(answer.references[0].citationIndex, 1);
      assert.equal(answer.references[0].type, 'market_data');
      assert.equal(answer.toolRuns[0].tool, 'get_market_snapshot');
      assert.equal(answer.model?.modelId, 'fake-model-1');
    } finally {
      await harness.close();
    }
  });

  it('replays history from stored session items on the next turn', async () => {
    const harness = await startAgentHarness({
      turns: [
        { kind: 'text', text: 'First answer.' },
        { kind: 'text', text: 'Second answer.' },
      ],
      env: { DATABASE_URL: DATABASE_URL! },
    });
    try {
      const conversation = await harness.request<AgentConversation>('/api/agent/conversations', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      await harness.send(conversation.id, { message: 'Remember: the code word is halibut.' });
      await harness.send(conversation.id, { message: 'What was the code word?' });

      const second = harness.fake.requests.at(-1) as { messages: unknown[] };
      assert.match(JSON.stringify(second.messages), /halibut/);
      assert.match(JSON.stringify(second.messages), /First answer/);
    } finally {
      await harness.close();
    }
  });

  it('scopes conversations by principal in SQL', async () => {
    const harness = await startAgentHarness({
      turns: [{ kind: 'text', text: 'ok' }],
      env: { DATABASE_URL: DATABASE_URL! },
    });
    try {
      const mine = await harness.request<AgentConversation>('/api/agent/conversations', {
        method: 'POST',
        body: JSON.stringify({ title: 'Mine alone' }),
      });

      const other = (await (
        await fetch(`${harness.url}/api/agent/auth/device`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ deviceId: 'postgres-other-device' }),
        })
      ).json()) as { token: string };

      const theirs = (await (
        await fetch(`${harness.url}/api/agent/conversations`, {
          headers: { authorization: `Bearer ${other.token}` },
        })
      ).json()) as { items: AgentConversation[] };
      assert.deepEqual(theirs.items, []);

      const direct = await fetch(`${harness.url}/api/agent/conversations/${mine.id}`, {
        headers: { authorization: `Bearer ${other.token}` },
      });
      assert.equal(direct.status, 404);
    } finally {
      await harness.close();
    }
  });

  it('records run telemetry without recording the conversation', async () => {
    const harness = await startAgentHarness({
      turns: [
        { kind: 'tool', name: 'get_market_snapshot', args: { symbol: 'BTC' } },
        { kind: 'text', text: 'Telemetry check.' },
      ],
      env: { DATABASE_URL: DATABASE_URL! },
    });
    try {
      await harness.request('/api/settings/ai/privacy', {
        method: 'PATCH',
        body: JSON.stringify({ debugMode: true }),
      });

      const conversation = await harness.request<AgentConversation>('/api/agent/conversations', {
        method: 'POST',
        body: JSON.stringify({ agentId: 'market-analyst' }),
      });
      await harness.send(conversation.id, { message: 'Read BTC' });

      const runs = await harness.request<{
        debugMode: boolean;
        runs: {
          status: string;
          toolCalls: number;
          referenceCount: number;
          firstTokenMs: number | null;
          model: { modelId: string } | null;
        }[];
      }>(`/api/agent/runs?conversationId=${conversation.id}`);

      assert.equal(runs.debugMode, true);
      assert.equal(runs.runs.length, 1);
      const [run] = runs.runs;
      assert.equal(run.status, 'completed');
      assert.equal(run.toolCalls, 1);
      assert.equal(run.referenceCount, 1);
      assert.equal(run.model?.modelId, 'fake-model-1');
      assert.equal(typeof run.firstTokenMs, 'number');

      // Telemetry is operational, not a transcript: no prompt or completion
      // text is anywhere in the run record.
      assert.equal(JSON.stringify(runs).includes('Read BTC'), false);
      assert.equal(JSON.stringify(runs).includes('Telemetry check'), false);
    } finally {
      await harness.close();
    }
  });

  it('stores news items and resolves a citation back to one', async () => {
    const harness = await startAgentHarness({
      turns: [
        { kind: 'tool', name: 'get_latest_news', args: { limit: 3, symbols: [] } },
        { kind: 'text', text: 'Recent releases [1].' },
      ],
      env: { DATABASE_URL: DATABASE_URL! },
    });
    try {
      const sync = await harness.request<{ added: number }>('/api/news/refresh', {
        method: 'POST',
      });
      assert.ok(sync.added > 0);

      const conversation = await harness.request<AgentConversation>('/api/agent/conversations', {
        method: 'POST',
        body: JSON.stringify({ agentId: 'news-research' }),
      });
      const events = await harness.send(conversation.id, { message: 'Latest news?' });

      const [reference] = eventsOfType(events, 'REFERENCE_ADDED');
      const article = await harness.request<{ id: string; provider: string }>(
        `/api/news/${reference.reference.entityId}`,
      );
      assert.equal(article.id, reference.reference.entityId);
      assert.equal(article.provider, 'app-calendar');

      // Re-syncing the same calendar adds nothing: identity is deterministic.
      const again = await harness.request<{ added: number }>('/api/news/refresh', {
        method: 'POST',
      });
      assert.equal(again.added, 0);
    } finally {
      await harness.close();
    }
  });

  it('deletes a conversation and everything hanging off it', async () => {
    const harness = await startAgentHarness({
      turns: [{ kind: 'text', text: 'Temporary.' }],
      env: { DATABASE_URL: DATABASE_URL! },
    });
    try {
      const conversation = await harness.request<AgentConversation>('/api/agent/conversations', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      await harness.send(conversation.id, { message: 'delete me' });

      await harness.request(`/api/agent/conversations/${conversation.id}`, { method: 'DELETE' });

      const response = await harness.rawRequest(`/api/agent/conversations/${conversation.id}`);
      assert.equal(response.status, 404);

      const list = await harness.request<{ items: AgentConversation[] }>(
        '/api/agent/conversations',
      );
      assert.equal(
        list.items.some((entry) => entry.id === conversation.id),
        false,
      );
    } finally {
      await harness.close();
    }
  });
});
