import { Platform } from 'react-native';

import type { CalendarResponse } from '@/data/calendar';

/**
 * Base URL of the calendar service.
 *
 * Set EXPO_PUBLIC_CALENDAR_API_URL for devices and deployments — a physical
 * phone cannot reach the dev machine's localhost, so it needs the LAN address.
 * Must be read as a static `process.env.X` property for Expo to inline it.
 */
export const CALENDAR_API_URL =
  process.env.EXPO_PUBLIC_CALENDAR_API_URL ??
  // The Android emulator maps the host loopback to 10.0.2.2.
  (Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000');

export class CalendarApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'CalendarApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${CALENDAR_API_URL}${path}`;
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
      `Cannot reach the calendar service at ${CALENDAR_API_URL}. ${
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

/** Ask the service to scrape now instead of waiting for its interval. */
export function requestRefresh(signal?: AbortSignal): Promise<unknown> {
  return request('/api/calendar/refresh', { method: 'POST', signal });
}

export const calendarStreamUrl = `${CALENDAR_API_URL}/api/calendar/stream`;
