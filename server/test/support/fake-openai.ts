import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import { AddressInfo } from 'node:net';

/**
 * A stand-in for an OpenAI-compatible Chat Completions endpoint.
 *
 * The integration tests need to exercise the *whole* path — our runtime, the
 * Agents SDK, the provider layer, tool dispatch, streaming — without a network
 * call or a key. Mocking the SDK would test our mock; mocking the wire protocol
 * tests everything above it.
 *
 * It lives only in `test/` and is never importable from `src/`, so there is no
 * route by which a fake model reaches a production path.
 */

export type FakeTurn =
  | { kind: 'text'; text: string }
  | { kind: 'tool'; name: string; args: Record<string, unknown> }
  | { kind: 'status'; status: number; body?: string }
  | { kind: 'hang'; ms: number };

export type FakeOpenAiOptions = {
  /** One entry per model call, consumed in order. The last repeats. */
  turns: FakeTurn[];
  /** Milliseconds between streamed chunks, to make cancellation testable. */
  chunkDelayMs?: number;
  apiKey?: string;
};

export type FakeOpenAi = {
  url: string;
  close(): Promise<void>;
  /** Every request body the server saw, parsed. */
  requests: Record<string, unknown>[];
  /** Reset the turn cursor between cases. */
  reset(turns?: FakeTurn[]): void;
  /** Retune the streaming pace, so a case can make cancellation observable. */
  setChunkDelay(ms: number): void;
};

export async function startFakeOpenAi(options: FakeOpenAiOptions): Promise<FakeOpenAi> {
  let turns = [...options.turns];
  let cursor = 0;
  let chunkDelayMs = options.chunkDelayMs ?? 0;
  const requests: Record<string, unknown>[] = [];

  const nextTurn = (): FakeTurn => {
    const turn = turns[Math.min(cursor, turns.length - 1)] ?? { kind: 'text', text: 'ok' };
    cursor += 1;
    return turn;
  };

  const server: Server = createServer((request, response) => {
    void handle(request, response).catch(() => {
      if (!response.writableEnded) response.end();
    });
  });

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = request.url ?? '';

    if (request.method === 'GET' && url.replace(/\?.*$/, '').endsWith('/models')) {
      if (options.apiKey && request.headers.authorization !== `Bearer ${options.apiKey}`) {
        response.writeHead(401).end(JSON.stringify({ error: 'bad key' }));
        return;
      }
      response
        .writeHead(200, { 'content-type': 'application/json' })
        .end(JSON.stringify({ data: [{ id: 'fake-model-1' }, { id: 'fake-model-2' }] }));
      return;
    }

    if (request.method !== 'POST' || !url.includes('/chat/completions')) {
      response.writeHead(404).end();
      return;
    }

    const body = await readJson(request);
    requests.push(body);

    if (options.apiKey && request.headers.authorization !== `Bearer ${options.apiKey}`) {
      response.writeHead(401).end(JSON.stringify({ error: { message: 'invalid api key' } }));
      return;
    }

    const turn = nextTurn();

    if (turn.kind === 'status') {
      response
        .writeHead(turn.status, { 'content-type': 'application/json' })
        .end(turn.body ?? JSON.stringify({ error: { message: 'upstream failure' } }));
      return;
    }

    if (turn.kind === 'hang') {
      await new Promise((resolve) => setTimeout(resolve, turn.ms));
      response.writeHead(504).end();
      return;
    }

    const base = {
      id: `chatcmpl-${cursor}`,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: String(body.model ?? 'fake-model-1'),
    };

    /**
     * Honour the request's own `stream` flag.
     *
     * The Agents SDK streams the top-level run but calls a sub-agent (an agent
     * exposed with `asTool`) without streaming. A fake that always answers with
     * SSE therefore looks like a model that returns nothing at all to a
     * specialist, and the run loops until it exceeds its turn limit — which is
     * exactly the failure this branch exists to avoid.
     */
    if (body.stream !== true) {
      const message =
        turn.kind === 'tool'
          ? {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: `call_${cursor}`,
                  type: 'function',
                  function: { name: turn.name, arguments: JSON.stringify(turn.args) },
                },
              ],
            }
          : { role: 'assistant', content: turn.text };

      response.writeHead(200, { 'content-type': 'application/json' }).end(
        JSON.stringify({
          ...base,
          object: 'chat.completion',
          choices: [
            {
              index: 0,
              message,
              finish_reason: turn.kind === 'tool' ? 'tool_calls' : 'stop',
            },
          ],
          usage: { prompt_tokens: 42, completion_tokens: 7, total_tokens: 49 },
        }),
      );
      return;
    }

    response.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });

    const send = (payload: unknown) => {
      if (!response.writableEnded) response.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    if (turn.kind === 'tool') {
      send({
        ...base,
        choices: [
          {
            index: 0,
            delta: {
              role: 'assistant',
              tool_calls: [
                {
                  index: 0,
                  id: `call_${cursor}`,
                  type: 'function',
                  function: { name: turn.name, arguments: JSON.stringify(turn.args) },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      });
      send({ ...base, choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] });
    } else {
      // Word by word, so a test can stop mid-answer and assert on the partial.
      const words = turn.text.split(' ');
      for (const [index, word] of words.entries()) {
        if (response.writableEnded) return;
        send({
          ...base,
          choices: [
            {
              index: 0,
              delta: { role: 'assistant', content: index === 0 ? word : ` ${word}` },
              finish_reason: null,
            },
          ],
        });
        if (chunkDelayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, chunkDelayMs));
        }
      }
      send({ ...base, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] });
    }

    send({
      ...base,
      choices: [],
      usage: { prompt_tokens: 42, completion_tokens: 7, total_tokens: 49 },
    });
    if (!response.writableEnded) {
      response.write('data: [DONE]\n\n');
      response.end();
    }
  }

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}/v1`,
    requests,
    reset(next) {
      cursor = 0;
      if (next) turns = [...next];
      requests.length = 0;
    },
    setChunkDelay(ms) {
      chunkDelayMs = ms;
    },
    async close() {
      server.closeAllConnections?.();
      server.close();
      await once(server, 'close').catch(() => undefined);
    },
  };
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}
