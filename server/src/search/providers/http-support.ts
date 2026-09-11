import type { SearchHealth } from '../search-provider';

/** Shared HTTP plumbing for the search adapters. */

export class SearchHttpError extends Error {
  constructor(readonly status: number) {
    super(`search endpoint responded ${status}`);
    this.name = 'SearchHttpError';
  }
}

export async function searchFetch(
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

export function healthFromStatus(status: number): SearchHealth {
  if (status === 401 || status === 403) {
    return { status: 'auth_failed', message: 'The search provider rejected the API key.' };
  }
  if (status === 429) {
    return { status: 'rate_limited', message: 'The search provider is rate limiting this key.' };
  }
  if (status >= 500) {
    return { status: 'unreachable', message: 'The search provider returned a server error.' };
  }
  return { status: 'error', message: `The search provider rejected the request (${status}).` };
}

export function healthFromTransport(error: unknown): SearchHealth {
  const text = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (text.includes('timeout') || text.includes('abort')) {
    return { status: 'unreachable', message: 'The search provider did not respond in time.' };
  }
  return { status: 'unreachable', message: 'The search provider could not be reached.' };
}
