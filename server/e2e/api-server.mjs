/**
 * The API the end-to-end tests run against.
 *
 * It boots the **real** compiled service — the same `AppModule` production
 * runs — and points one provider at a local Chat Completions stand-in, so the
 * browser exercises the whole stack: auth, streaming, tools, citations and
 * persistence. Only the model is fake.
 *
 * A small control surface lets a spec script the next model turns:
 *
 *     POST /__e2e/turns   { "turns": [ … ], "chunkDelayMs": 40 }
 *
 * That endpoint exists only in this file and is never mounted by the service.
 */
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { startFakeOpenAi } from '../test/support/fake-openai.ts';

const API_PORT = Number(process.env.E2E_API_PORT ?? 4021);
const CONTROL_PORT = Number(process.env.E2E_CONTROL_PORT ?? 4023);
const SERVER_DIR = new URL('../', import.meta.url).pathname;

const workspace = await mkdtemp(join(tmpdir(), 'marketpulse-e2e-'));
process.chdir(workspace);

Object.assign(process.env, {
  CALENDAR_REFRESH_ON_BOOT: 'false',
  CALENDAR_WATCH_ENABLED: 'false',
  DERIVATIVES_REFRESH_ON_BOOT: 'false',
  NEWS_REFRESH_ON_BOOT: 'false',
  NEWS_RSS_FEEDS: '',
  AGENT_SECRET_KEY: 'end-to-end-tests',
  AGENT_TRACING: 'off',
  CORS_ORIGIN: '*',
  CALENDAR_SNAPSHOT_SEED_PATH: join(SERVER_DIR, 'seed/calendar-snapshot.json'),
  DERIVATIVES_SNAPSHOT_SEED_PATH: join(SERVER_DIR, 'seed/derivatives-snapshot.json'),
});
delete process.env.DATABASE_URL;

const fake = await startFakeOpenAi({
  turns: [{ kind: 'text', text: 'Ready.' }],
  apiKey: 'e2e-key',
});

const { AppModule } = await import(pathToFileURL(join(SERVER_DIR, 'dist/app.module.js')).href);

// Warnings and errors are kept: when an end-to-end run fails, the service's
// own log is the fastest way to tell a product bug from a harness one.
const app = await NestFactory.create(AppModule, {
  logger: ['warn', 'error'],
  abortOnError: false,
});
app.enableCors({ origin: '*' });
app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
await app.listen(API_PORT, '127.0.0.1');

// Configure the fake as the primary provider, exactly as a user would.
const registered = await (
  await fetch(`http://127.0.0.1:${API_PORT}/api/agent/auth/device`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ deviceId: 'e2e-bootstrap-device' }),
  })
).json();

const authed = (path, init = {}) =>
  fetch(`http://127.0.0.1:${API_PORT}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${registered.token}`,
      ...init.headers,
    },
  });

await authed('/api/settings/ai/providers', {
  method: 'POST',
  body: JSON.stringify({ id: 'e2e', name: 'E2E Provider' }),
});
await authed('/api/settings/ai/providers/e2e', {
  method: 'PATCH',
  body: JSON.stringify({
    enabled: true,
    apiKey: 'e2e-key',
    baseUrl: fake.url,
    defaultModel: 'fake-model-1',
  }),
});
await authed('/api/settings/ai/models/primary', {
  method: 'PATCH',
  body: JSON.stringify({ providerId: 'e2e', modelId: 'fake-model-1' }),
});
// Seed the news store from the checked-in calendar so citations have something
// real to resolve to.
await fetch(`http://127.0.0.1:${API_PORT}/api/news/refresh`, { method: 'POST' });

const control = createServer((request, response) => {
  response.setHeader('access-control-allow-origin', '*');
  response.setHeader('access-control-allow-headers', 'content-type');
  if (request.method === 'OPTIONS') {
    response.writeHead(204).end();
    return;
  }
  if (request.method !== 'POST' || !request.url?.startsWith('/__e2e/turns')) {
    response.writeHead(404).end();
    return;
  }
  const chunks = [];
  request.on('data', (chunk) => chunks.push(chunk));
  request.on('end', () => {
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      fake.reset(body.turns);
      fake.setChunkDelay?.(body.chunkDelayMs ?? 0);
      response.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}');
    } catch (error) {
      response.writeHead(400).end(JSON.stringify({ error: String(error) }));
    }
  });
});
control.listen(CONTROL_PORT, '127.0.0.1');

process.stdout.write(`e2e api listening on ${API_PORT}, control on ${CONTROL_PORT}\n`);

const shutdown = async () => {
  await app.close().catch(() => undefined);
  await fake.close().catch(() => undefined);
  control.close();
  await rm(workspace, { recursive: true, force: true }).catch(() => undefined);
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
