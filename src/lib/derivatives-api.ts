import { getBackendUrl } from '@/lib/backend-url';
import type { DerivativesResponse, LiquidityMapResponse } from '@/data/derivatives';

export class DerivativesApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'DerivativesApiError';
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
    throw new DerivativesApiError(
      `Cannot reach the derivatives service at ${base}. ${
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

/**
 * The liquidation heatmap for one symbol. Fetched on its own rather than with
 * the overview: it is tens of kilobytes and only one view ever draws it.
 */
export function fetchLiquidityMap(symbol?: string, signal?: AbortSignal): Promise<LiquidityMapResponse> {
  const query = symbol ? `?symbol=${encodeURIComponent(symbol)}` : '';
  return request<LiquidityMapResponse>(`/api/derivatives/liquidity-map${query}`, { signal });
}

/** Ask the service to scrape now instead of waiting for its interval. */
export function requestDerivativesRefresh(signal?: AbortSignal): Promise<unknown> {
  return request('/api/derivatives/refresh', { method: 'POST', signal });
}

export function derivativesStreamUrl(): string {
  return `${getBackendUrl()}/api/derivatives/stream`;
}
