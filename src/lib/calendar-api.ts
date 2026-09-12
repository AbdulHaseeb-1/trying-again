import { getBackendUrl } from '@/lib/backend-url';
import type { CalendarHistoryResponse, CalendarResponse } from '@/data/calendar';

export class CalendarApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'CalendarApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const base = getBackendUrl();
  const url = `${base}${path}`;
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: { accept: 'application/json', ...init?.headers },
    });
  } catch (error) {
    // A network-level failure here almost always means the service is not up,
    // so say that rather than surfacing a bare "Failed to fetch".
    throw new CalendarApiError(
      `Cannot reach the calendar service at ${base}. ${
        error instanceof Error ? error.message : ''
      }`.trim(),
    );
  }
  if (!response.ok) {
    throw new CalendarApiError(`Calendar service responded ${response.status}`, response.status);
  }
  return (await response.json()) as T;
}

export function fetchCalendar(signal?: AbortSignal): Promise<CalendarResponse> {
  return request<CalendarResponse>('/api/calendar', { signal });
}

/**
 * Past releases, out of the service's Postgres archive rather than a scrape.
 * Answers 503 when the service is running without one.
 */
export function fetchCalendarHistory(
  params: { from: Date; to: Date; limit?: number },
  signal?: AbortSignal,
): Promise<CalendarHistoryResponse> {
  const query = new URLSearchParams({
    from: params.from.toISOString(),
    to: params.to.toISOString(),
    limit: String(params.limit ?? 500),
  });
  return request<CalendarHistoryResponse>(`/api/calendar/history?${query}`, { signal });
}

/** Ask the service to scrape now instead of waiting for its interval. */
export function requestRefresh(signal?: AbortSignal): Promise<unknown> {
  return request('/api/calendar/refresh', { method: 'POST', signal });
}

export function calendarStreamUrl(): string {
  return `${getBackendUrl()}/api/calendar/stream`;
}
