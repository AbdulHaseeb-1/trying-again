import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import type { AgentEvent } from '../../src/agent/agent.events';
import { startFakeOpenAi, type FakeOpenAi, type FakeTurn } from './fake-openai';

/**
 * A real server, a fake model.
 *
 * The integration tests boot the actual Nest application — same modules, same
 * guards, same validation pipe, same streaming controller — and point one
 * provider at a local HTTP endpoint that speaks Chat Completions. Everything
 * between the HTTP request and the model wire is production code.
 *
 * Each harness gets its own working directory, so the settings document, the
 * secret store and the conversation store are per-test rather than shared.
 */
export type AgentHarness = {
  url: string;
  token: string;
  fake: FakeOpenAi;
  request: <T>(path: string, init?: RequestInit) => Promise<T>;
  rawRequest: (path: string, init?: RequestInit) => Promise<Response>;
  /** POST a message and collect the normalized event stream. */
  send: (
    conversationId: string,
    body: Record<string, unknown>,
    onEvent?: (event: AgentEvent, controller: AbortController) => void,
  ) => Promise<AgentEvent[]>;
  close: () => Promise<void>;
};

export async function startAgentHarness(
  options: { turns: FakeTurn[]; chunkDelayMs?: number; env?: Record<string, string> } = {
    turns: [{ kind: 'text', text: 'ok' }],
  },
): Promise<AgentHarness> {
  const workspace = await mkdtemp(join(tmpdir(), 'agent-harness-'));
  const previousCwd = process.cwd();
  process.chdir(workspace);

  const previousEnv = { ...process.env };
  // Cleared before the overrides are applied, so a case that *wants* Postgres
  // can ask for it through `options.env` without being undone here.
  delete process.env.DATABASE_URL;
  Object.assign(process.env, {
    CALENDAR_REFRESH_ON_BOOT: 'false',
    CALENDAR_WATCH_ENABLED: 'false',
    DERIVATIVES_REFRESH_ON_BOOT: 'false',
    NEWS_REFRESH_ON_BOOT: 'false',
    NEWS_RSS_FEEDS: '',
    AGENT_SECRET_KEY: 'integration-tests',
    AGENT_TRACING: 'off',
    // Seeds live next to the source, not next to the temporary workspace.
    CALENDAR_SNAPSHOT_SEED_PATH: join(previousCwd, 'seed/calendar-snapshot.json'),
    DERIVATIVES_SNAPSHOT_SEED_PATH: join(previousCwd, 'seed/derivatives-snapshot.json'),
    ...options.env,
  });

  /** What the boot got as far as creating, so a failure can still undo it. */
  const started: { app?: INestApplication; fake?: FakeOpenAi } = {};

  const restore = async () => {
    process.chdir(previousCwd);
    for (const key of Object.keys(process.env)) {
      if (!(key in previousEnv)) delete process.env[key];
    }
    Object.assign(process.env, previousEnv);
    await rm(workspace, { recursive: true, force: true });
  };

  const boot = async (): Promise<AgentHarness> => {
    const fake = await startFakeOpenAi({
      turns: options.turns,
      chunkDelayMs: options.chunkDelayMs,
      apiKey: 'harness-key',
    });
    started.fake = fake;

    /**
     * The **compiled** application, imported lazily.
     *
     * Two reasons, both load-bearing:
     *
     *  - Nest resolves constructor dependencies from `design:paramtypes`, which
     *    only `tsc` emits. The test runner transpiles with esbuild, which does not
     *    support `emitDecoratorMetadata` — so importing `src/app.module` here
     *    gives a graph whose dependencies are all `undefined`. Importing `dist`
     *    runs exactly what production runs.
     *  - The import must happen after the environment above is in place, because
     *    configuration is read as the module loads.
     *
     * `npm test` builds first; run `npm run build` if you are invoking the runner
     * directly.
     */
    // Resolved at runtime from the original working directory: the harness has
    // already chdir'd into its temporary workspace, and a literal specifier would
    // also make the type checker look for declarations the build does not emit.
    const compiled = pathToFileURL(join(previousCwd, 'dist/app.module.js')).href;
    const { AppModule } = (await import(compiled)) as { AppModule: new () => unknown };
    // `abortOnError` defaults to true, which turns a module wiring mistake into
    // a silent `process.exit(1)` with no stack — useless in a test run.
    const app: INestApplication = await NestFactory.create(AppModule as never, {
      logger: false,
      abortOnError: false,
    });
    started.app = app;
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.listen(0, '127.0.0.1');
    const url = (await app.getUrl()).replace('[::1]', '127.0.0.1');

    const registered = (await (
      await fetch(`${url}/api/agent/auth/device`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ deviceId: 'integration-device-1' }),
      })
    ).json()) as { token: string };

    const headers = {
      'content-type': 'application/json',
      authorization: `Bearer ${registered.token}`,
    };

    const rawRequest = (path: string, init: RequestInit = {}) =>
      fetch(`${url}${path}`, { ...init, headers: { ...headers, ...init.headers } });

    const request = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
      const response = await rawRequest(path, init);
      if (!response.ok) {
        throw new Error(`${init.method ?? 'GET'} ${path} → ${response.status}: ${await response.text()}`);
      }
      return (await response.json()) as T;
    };

    /**
     * Register the fake as a custom provider and make it the primary model.
     *
     * Creating it is allowed to fail with "already exists". Each harness gets a
     * fresh working directory, so on the file backing the settings document is
     * always new — but with a database configured the settings live in Postgres
     * and outlive the workspace, so the second harness in a suite finds what the
     * first one wrote. The PATCH below is what actually configures the provider,
     * and it is idempotent either way.
     */
    const created = await rawRequest('/api/settings/ai/providers', {
      method: 'POST',
      body: JSON.stringify({ id: 'harness', name: 'Harness' }),
    });
    if (!created.ok) {
      const detail = await created.text();
      if (!detail.includes('already exists')) {
        throw new Error(`POST /api/settings/ai/providers → ${created.status}: ${detail}`);
      }
    }
    await request('/api/settings/ai/providers/harness', {
      method: 'PATCH',
      body: JSON.stringify({
        enabled: true,
        apiKey: 'harness-key',
        baseUrl: fake.url,
        defaultModel: 'fake-model-1',
      }),
    });
    await request('/api/settings/ai/models/primary', {
      method: 'PATCH',
      body: JSON.stringify({ providerId: 'harness', modelId: 'fake-model-1' }),
    });

    const send: AgentHarness['send'] = async (conversationId, body, onEvent) => {
      const controller = new AbortController();
      const response = await fetch(`${url}/api/agent/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`send → ${response.status}: ${await response.text()}`);
      }

      const events: AgentEvent[] = [];
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let newline = buffer.indexOf('\n');
          while (newline >= 0) {
            const line = buffer.slice(0, newline).trim();
            buffer = buffer.slice(newline + 1);
            if (line) {
              const event = JSON.parse(line) as AgentEvent;
              events.push(event);
              onEvent?.(event, controller);
            }
            newline = buffer.indexOf('\n');
          }
        }
      } catch (error) {
        // An aborted read is how the "stop" cases end; the events collected so
        // far are the point of the test.
        if (!controller.signal.aborted) throw error;
      } finally {
        await reader.cancel().catch(() => undefined);
      }
      return events;
    };

    return {
      url,
      token: registered.token,
      fake,
      request,
      rawRequest,
      send,
      async close() {
        await app.close();
        await fake.close();
        await restore();
      },
    };
  };

  try {
    return await boot();
  } catch (error) {
    // A harness that fails to start must still put the process back where it
    // found it. It has already chdir'd into a temporary directory, and leaving
    // it there turns one broken test into a whole file of module-resolution
    // failures that say nothing about the actual cause.
    await started.app?.close().catch(() => undefined);
    await started.fake?.close().catch(() => undefined);
    await restore();
    throw error;
  }
}

/** Every text delta in a run, joined — what the user would have seen. */
export function streamedText(events: AgentEvent[]): string {
  return events
    .filter((event): event is Extract<AgentEvent, { type: 'TEXT_DELTA' }> => event.type === 'TEXT_DELTA')
    .map((event) => event.delta)
    .join('');
}

export function eventsOfType<T extends AgentEvent['type']>(
  events: AgentEvent[],
  type: T,
): Extract<AgentEvent, { type: T }>[] {
  return events.filter((event): event is Extract<AgentEvent, { type: T }> => event.type === type);
}
