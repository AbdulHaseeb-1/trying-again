import { Platform } from 'react-native';

import type { DerivativesResponse } from '@/data/derivatives';

/**
 * Base URL of the market-data service.
 *
 * Set EXPO_PUBLIC_CALENDAR_API_URL for devices and deployments — the
 * derivatives and calendar APIs are served by the same process. Must be read
 * as a static `process.env.X` property for Expo to inline it.
 */
export const DERIVATIVES_API_URL =
  process.env.EXPO_PUBLIC_CALENDAR_API_URL ??
  // The Android emulator maps the host loopback to 10.0.2.2.
  (Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000');

export class DerivativesApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'DerivativesApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${DERIVATIVES_API_URL}${path}`;
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: { accept: 'application/json', ...init?.headers },
    });
  } catch (error) {
    // A network-level failure here almost always means the service is not up,
    // so say that rather than surfacing a bare "Failed to fetch".
    throw new DerivativesApiError(
      `Cannot reach the derivatives service at ${DERIVATIVES_API_URL}. ${
        error instanceof Error ? error.message : ''
      }`.trim(),
    );
  }
  if (!response.ok) {
    throw new DerivativesApiError(
      `Derivatives service responded ${response.status}`,
      response.status,
    );
  }
  return (await response.json()) as T;
}

export function fetchDerivatives(symbol?: string, signal?: AbortSignal): Promise<DerivativesResponse> {
  const query = symbol ? `?symbol=${encodeURIComponent(symbol)}` : '';
  return request<DerivativesResponse>(`/api/derivatives${query}`, { signal });
}

/** Ask the service to scrape now instead of waiting for its interval. */
export function requestDerivativesRefresh(signal?: AbortSignal): Promise<unknown> {
  return request('/api/derivatives/refresh', { method: 'POST', signal });
}

export const derivativesStreamUrl = `${DERIVATIVES_API_URL}/api/derivatives/stream`;
