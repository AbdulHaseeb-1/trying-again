import { Logger } from '@nestjs/common';

import type {
  ConnectionResult,
  ModelDescriptor,
  ProviderConfig,
  ValidationIssue,
} from './llm-provider';

/**
 * The parts every provider adapter would otherwise rewrite: a bounded HTTP
 * probe, the mapping from a status code to something a person can act on, and
 * the rule that a message shown in Settings never carries a key, a full URL or
 * a provider payload.
 */

/**
 * Connection failures are logged here and sanitised on the way out.
 *
 * The message a user sees must not carry the endpoint or the upstream body, but
 * an operator staring at "Endpoint unreachable" needs the actual reason — so it
 * goes to the log, where it is already an operator-only surface.
 */
const logger = new Logger('LLMProvider');

export class ProviderHttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'ProviderHttpError';
  }
}

export function requireApiKey(config: ProviderConfig, label = 'API key'): ValidationIssue[] {
  if (config.apiKey && config.apiKey.trim().length > 0) return [];
  return [{ field: 'apiKey', message: `${label} is required.` }];
}

export function validateBaseUrl(
  config: ProviderConfig,
  { required }: { required: boolean },
): ValidationIssue[] {
  if (!config.baseUrl) {
    return required ? [{ field: 'baseUrl', message: 'Base URL is required.' }] : [];
  }
  try {
    const url = new URL(config.baseUrl);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
      return [{ field: 'baseUrl', message: 'Base URL must use HTTPS.' }];
    }
    return [];
  } catch {
    return [{ field: 'baseUrl', message: 'Base URL is not a valid URL.' }];
  }
}

/** A fetch with a deadline that composes with an outer abort signal. */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);
  const onAbort = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/**
 * One HTTP round trip, turned into the five outcomes Settings can render.
 *
 * Deliberately says nothing beyond the outcome: "Authentication failed" rather
 * than the body the provider returned, which routinely echoes the key prefix.
 */
export function describeStatus(status: number): ConnectionResult {
  if (status === 401 || status === 403) {
    return { status: 'auth_failed', message: 'Authentication failed. Check the API key.' };
  }
  if (status === 404) {
    return { status: 'unsupported_model', message: 'The endpoint or model was not found.' };
  }
  if (status === 429) {
    return { status: 'rate_limited', message: 'Rate limited by the provider. Try again shortly.' };
  }
  if (status >= 500) {
    return { status: 'unreachable', message: 'The provider returned a server error.' };
  }
  return { status: 'error', message: `The provider rejected the request (${status}).` };
}

export function describeTransportFailure(error: unknown): ConnectionResult {
  const cause = error instanceof Error ? (error as { cause?: unknown }).cause : undefined;
  logger.warn(
    `connection test failed: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}` +
      (cause instanceof Error ? ` <- ${cause.name}: ${cause.message}` : ''),
  );
  const text = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (text.includes('timeout') || text.includes('abort')) {
    return { status: 'unreachable', message: 'The endpoint did not respond in time.' };
  }
  return { status: 'unreachable', message: 'The endpoint could not be reached.' };
}

/**
 * `GET {base}/models` — the de-facto listing endpoint for OpenAI and everything
 * that speaks its dialect (OpenRouter included).
 */
export async function listOpenAIStyleModels(
  baseUrl: string,
  headers: Record<string, string>,
  config: ProviderConfig,
  signal?: AbortSignal,
): Promise<ModelDescriptor[]> {
  const response = await fetchWithTimeout(
    `${baseUrl.replace(/\/$/, '')}/models`,
    { method: 'GET', headers },
    config.timeoutMs,
    signal,
  );
  if (!response.ok) throw new ProviderHttpError(response.status, `models listing failed`);
  const body = (await response.json()) as { data?: unknown[] };
  const rows = Array.isArray(body.data) ? body.data : [];
  return rows
    .map((row) => row as Record<string, unknown>)
    .filter((row) => typeof row.id === 'string')
    .map((row) => ({
      id: row.id as string,
      label: typeof row.name === 'string' ? (row.name as string) : (row.id as string),
      contextWindow:
        typeof row.context_length === 'number'
          ? (row.context_length as number)
          : typeof row.context_window === 'number'
            ? (row.context_window as number)
            : null,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Merge configured custom headers over the adapter's own, never under them. */
export function mergeHeaders(
  base: Record<string, string>,
  custom: Record<string, string> | undefined | null,
): Record<string, string> {
  const reserved = new Set(['authorization', 'content-type']);
  const merged = { ...base };
  for (const [key, value] of Object.entries(custom ?? {})) {
    // A custom header must not be able to replace the credential the adapter
    // just attached; that would turn "custom headers" into a key-exfiltration
    // primitive for anyone who can edit settings but not read secrets.
    if (reserved.has(key.toLowerCase())) continue;
    merged[key] = value;
  }
  return merged;
}
