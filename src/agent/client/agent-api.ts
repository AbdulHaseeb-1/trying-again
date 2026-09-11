import { Platform } from 'react-native';
import { fetch as expoFetch } from 'expo/fetch';

import type {
  AgentBootstrap,
  AgentConversation,
  AgentEvent,
  AgentMessage,
  AgentRunRecord,
  AiSettings,
  ConnectionResult,
  ModelDescriptor,
  NewsItem,
  NewsPage,
  ProviderSummary,
  SearchHealth,
} from '@/agent/protocol';
import { readDeviceId, readToken, writeDeviceId, writeToken } from '@/agent/client/token-store';

/**
 * The agent service's base URL.
 *
 * Deliberately the same variable the calendar and derivatives clients read:
 * all three are served by one process, and a second variable would only be a
 * second thing to get wrong. Must be read as a static `process.env.X` property
 * for Expo to inline it.
 */
export const AGENT_API_URL =
  process.env.EXPO_PUBLIC_CALENDAR_API_URL ??
  (Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000');

/**
 * The join code, when the service is configured to want one.
 *
 * `AGENT_REGISTRATION_SECRET` on the server turns device registration from open
 * to gated; this is the matching value a build is given so it can pass the gate.
 * It is a deployment gate rather than a user credential — anything shipped in a
 * client bundle is readable by whoever holds the bundle — and it is the *token*
 * issued in exchange that authorizes everything afterwards.
 */
const REGISTRATION_SECRET = process.env.EXPO_PUBLIC_AGENT_REGISTRATION_SECRET ?? null;

export class AgentApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'AgentApiError';
  }
}

/**
 * `expo/fetch` on native, the platform's own on web.
 *
 * React Native's built-in `fetch` does not give a readable body, so a streamed
 * answer would arrive all at once at the end. `expo/fetch` is WinterCG-compliant
 * and does, which is what makes token-by-token rendering work on a phone rather
 * than only in a browser.
 */
const streamingFetch: typeof globalThis.fetch =
  Platform.OS === 'web' ? globalThis.fetch : (expoFetch as unknown as typeof globalThis.fetch);

let cachedToken: string | null = null;
let registration: Promise<string> | null = null;

function newDeviceId(): string {
  // A device id only needs to be unique and stable, not unguessable: it is not
  // the credential. The signed token is.
  const random = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  return `dev_${Date.now().toString(36)}${random}`.slice(0, 48).padEnd(12, '0');
}

/** Register once, then reuse. Concurrent callers share one registration. */
export async function ensureToken(): Promise<string> {
  if (cachedToken) return cachedToken;
  if (registration) return registration;

  registration = (async () => {
    const stored = await readToken();
    if (stored) {
      cachedToken = stored;
      return stored;
    }
    let deviceId = await readDeviceId();
    if (!deviceId) {
      deviceId = newDeviceId();
      await writeDeviceId(deviceId);
    }
    const response = await fetch(`${AGENT_API_URL}/api/agent/auth/device`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        deviceId,
        platform: Platform.OS,
        ...(REGISTRATION_SECRET ? { secret: REGISTRATION_SECRET } : {}),
      }),
    });
    if (!response.ok) {
      throw new AgentApiError(
        response.status === 401
          ? 'This build is not allowed to register with the agent service.'
          : 'Could not register with the agent service.',
        response.status,
      );
    }
    const body = (await response.json()) as { token: string };
    await writeToken(body.token);
    cachedToken = body.token;
    return body.token;
  })();

  try {
    return await registration;
  } finally {
    registration = null;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await ensureToken();
  let response: Response;
  try {
    response = await fetch(`${AGENT_API_URL}${path}`, {
      ...init,
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
        ...init.headers,
      },
    });
  } catch {
    throw new AgentApiError(
      `Cannot reach the agent service at ${AGENT_API_URL}.`,
      undefined,
      'unreachable',
    );
  }

  if (response.status === 401) {
    // The signing key rotated, or the token was issued by another install.
    cachedToken = null;
    throw new AgentApiError('This device needs to register again.', 401, 'auth_failed');
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new AgentApiError(readableError(detail, response.status), response.status);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function readableError(body: string, status: number): string {
  try {
    const parsed = JSON.parse(body) as { message?: string | string[] };
    const message = Array.isArray(parsed.message) ? parsed.message[0] : parsed.message;
    if (message) return message;
  } catch {
    // Fall through to the generic message.
  }
  return `The agent service responded ${status}.`;
}

// ---------------------------------------------------------------- bootstrap

export function fetchBootstrap(): Promise<AgentBootstrap> {
  return request<AgentBootstrap>('/api/agent/bootstrap');
}

// ------------------------------------------------------------- conversations

export function listConversations(params: { limit?: number; cursor?: string; q?: string } = {}) {
  const query = new URLSearchParams();
  if (params.limit) query.set('limit', String(params.limit));
  if (params.cursor) query.set('cursor', params.cursor);
  if (params.q) query.set('q', params.q);
  const suffix = query.toString() ? `?${query}` : '';
  return request<{ items: AgentConversation[]; nextCursor: string | null }>(
    `/api/agent/conversations${suffix}`,
  );
}

export function createConversation(body: {
  agentId?: string;
  title?: string;
  context?: Record<string, unknown>;
}): Promise<AgentConversation> {
  return request<AgentConversation>('/api/agent/conversations', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function getConversation(id: string): Promise<AgentConversation> {
  return request<AgentConversation>(`/api/agent/conversations/${id}`);
}

export function updateConversation(
  id: string,
  body: { title?: string; pinned?: boolean; agentId?: string },
): Promise<AgentConversation> {
  return request<AgentConversation>(`/api/agent/conversations/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function deleteConversation(id: string): Promise<{ deleted: boolean }> {
  return request<{ deleted: boolean }>(`/api/agent/conversations/${id}`, { method: 'DELETE' });
}

export function fetchMessages(
  id: string,
  params: { limit?: number; before?: string } = {},
): Promise<{ messages: AgentMessage[] }> {
  const query = new URLSearchParams();
  if (params.limit) query.set('limit', String(params.limit));
  if (params.before) query.set('before', params.before);
  const suffix = query.toString() ? `?${query}` : '';
  return request<{ messages: AgentMessage[] }>(`/api/agent/conversations/${id}/messages${suffix}`);
}

export function stopRun(runId: string): Promise<{ stopped: boolean }> {
  return request<{ stopped: boolean }>('/api/agent/runs/stop', {
    method: 'POST',
    body: JSON.stringify({ runId }),
  });
}

export function fetchRuns(conversationId?: string) {
  const suffix = conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : '';
  return request<{ debugMode: boolean; active: unknown[]; runs: AgentRunRecord[] }>(
    `/api/agent/runs${suffix}`,
  );
}

/**
 * Send a message and yield normalized events as they arrive.
 *
 * The response is newline-delimited JSON. A partial line is held over between
 * chunks — a token boundary lands mid-object often enough that parsing each
 * chunk independently would drop text at random.
 */
export async function* sendMessage(
  conversationId: string,
  body: {
    message: string;
    agentId?: string;
    attachments?: unknown[];
    context?: Record<string, unknown>;
    debug?: boolean;
  },
  signal?: AbortSignal,
): AsyncGenerator<AgentEvent> {
  const token = await ensureToken();
  const response = await streamingFetch(
    `${AGENT_API_URL}/api/agent/conversations/${conversationId}/messages`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/x-ndjson',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal,
    },
  );

  if (!response.ok) {
    if (response.status === 401) cachedToken = null;
    throw new AgentApiError(
      readableError(await response.text().catch(() => ''), response.status),
      response.status,
    );
  }

  const reader = response.body?.getReader();
  if (!reader) {
    // No streaming body at all: still deliver the events rather than nothing.
    const text = await response.text();
    for (const line of text.split('\n')) {
      const event = parseLine(line);
      if (event) yield event;
    }
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf('\n');
      while (newline >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        const event = parseLine(line);
        if (event) yield event;
        newline = buffer.indexOf('\n');
      }
    }
    const tail = parseLine(buffer);
    if (tail) yield tail;
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

function parseLine(line: string): AgentEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as AgentEvent;
  } catch {
    return null;
  }
}

// -------------------------------------------------------------------- news

export function fetchNewsItem(id: string): Promise<NewsItem> {
  return request<NewsItem>(`/api/news/${encodeURIComponent(id)}`);
}

export function fetchRelatedNews(id: string): Promise<{ items: NewsItem[] }> {
  return request<{ items: NewsItem[] }>(`/api/news/${encodeURIComponent(id)}/related`);
}

export function fetchNews(params: { limit?: number; q?: string; symbols?: string[] } = {}) {
  const query = new URLSearchParams();
  if (params.limit) query.set('limit', String(params.limit));
  if (params.q) query.set('q', params.q);
  if (params.symbols?.length) query.set('symbols', params.symbols.join(','));
  const suffix = query.toString() ? `?${query}` : '';
  return request<NewsPage>(`/api/news${suffix}`);
}

// ---------------------------------------------------------------- settings

export function fetchAiSettings(): Promise<AiSettings> {
  return request<AiSettings>('/api/settings/ai');
}

export function updateProvider(
  id: string,
  body: Record<string, unknown>,
): Promise<ProviderSummary> {
  return request<ProviderSummary>(`/api/settings/ai/providers/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function testProvider(
  id: string,
  body: { apiKey?: string; baseUrl?: string; model?: string } = {},
): Promise<ConnectionResult> {
  return request<ConnectionResult>(`/api/settings/ai/providers/${id}/test`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function fetchProviderModels(
  id: string,
): Promise<{ source: string; models: ModelDescriptor[] }> {
  return request<{ source: string; models: ModelDescriptor[] }>(
    `/api/settings/ai/providers/${id}/models`,
  );
}

export function addCustomProvider(body: { id: string; name: string }): Promise<ProviderSummary> {
  return request<ProviderSummary>('/api/settings/ai/providers', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function removeCustomProvider(id: string): Promise<{ removed: boolean }> {
  return request<{ removed: boolean }>(`/api/settings/ai/providers/${id}`, { method: 'DELETE' });
}

export function setModelRole(
  role: string,
  body: { providerId?: string; modelId?: string },
): Promise<unknown> {
  return request(`/api/settings/ai/models/${role}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function updateAgentConfig(id: string, body: Record<string, unknown>): Promise<unknown> {
  return request(`/api/settings/ai/agents/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
}

export function updateSearchSettings(body: Record<string, unknown>): Promise<unknown> {
  return request('/api/settings/ai/search', { method: 'PATCH', body: JSON.stringify(body) });
}

export function updateSearchProvider(
  id: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  return request(`/api/settings/ai/search/providers/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function addSearchProvider(body: {
  id: string;
  name: string;
  kind: 'searxng' | 'rest';
  baseUrl: string;
}): Promise<unknown> {
  return request('/api/settings/ai/search/providers', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function removeSearchProvider(id: string): Promise<unknown> {
  return request(`/api/settings/ai/search/providers/${id}`, { method: 'DELETE' });
}

export function testSearchProvider(id: string): Promise<SearchHealth> {
  return request<SearchHealth>(`/api/settings/ai/search/providers/${id}/test`, { method: 'POST' });
}

export function updatePrivacy(body: Record<string, unknown>): Promise<unknown> {
  return request('/api/settings/ai/privacy', { method: 'PATCH', body: JSON.stringify(body) });
}
