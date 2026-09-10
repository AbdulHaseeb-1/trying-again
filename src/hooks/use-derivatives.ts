import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';

import type { DerivativesResponse } from '@/data/derivatives';
import {
  DerivativesApiError,
  derivativesStreamUrl,
  fetchDerivatives,
  requestDerivativesRefresh,
} from '@/lib/derivatives-api';

export type DerivativesState = {
  data: DerivativesResponse | null;
  error: string | null;
  loading: boolean;
  refreshing: boolean;
  /** True while the SSE stream is connected, so the UI can say "live". */
  live: boolean;
  refresh: () => Promise<void>;
};

const DEFAULT_POLL_MS = 60_000;

/**
 * Keeps the derivatives screen in step with the service.
 *
 * The service scrapes on its own schedule, so the client only has to stay
 * subscribed. On web it opens the SSE stream and re-reads on every push;
 * everywhere else it polls, since React Native has no EventSource.
 *
 * Switching asset re-fetches but deliberately keeps the previous payload on
 * screen until the new one lands — the market half of the response is the same
 * either way, and blanking it would make a tap feel like a reload.
 */
export function useDerivatives(symbol: string | null): DerivativesState {
  const [data, setData] = useState<DerivativesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [live, setLive] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const next = await fetchDerivatives(symbol ?? undefined, signal);
        if (!mounted.current) return;
        setData(next);
        setError(null);
      } catch (cause) {
        if (signal?.aborted || !mounted.current) return;
        setError(cause instanceof DerivativesApiError ? cause.message : String(cause));
      } finally {
        if (mounted.current) setLoading(false);
      }
    },
    [symbol],
  );

  // Initial load, and a reload whenever the selected asset changes. Deferred by
  // a microtask so the effect body never calls setState during the commit.
  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => load(controller.signal));
    return () => controller.abort();
  }, [load]);

  // Background polling follows whatever cadence the service reports, so
  // retuning the server retunes every client with it.
  const pollMs = data?.refreshIntervalMs
    ? Math.max(15_000, Math.min(data.refreshIntervalMs, DEFAULT_POLL_MS))
    : DEFAULT_POLL_MS;

  useEffect(() => {
    const timer = setInterval(() => void load(), pollMs);
    return () => clearInterval(timer);
  }, [load, pollMs]);

  // Instant updates where EventSource exists (web).
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof EventSource === 'undefined') return;

    const stream = new EventSource(derivativesStreamUrl);
    const onPush = () => {
      setLive(true);
      void load();
    };
    stream.addEventListener('sync', onPush);
    stream.onerror = () => setLive(false);
    stream.onopen = () => setLive(true);

    return () => {
      stream.removeEventListener('sync', onPush);
      stream.close();
    };
  }, [load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // Ask the service to go and look, then read the result back.
      await requestDerivativesRefresh().catch(() => undefined);
      await load();
    } finally {
      if (mounted.current) setRefreshing(false);
    }
  }, [load]);

  return useMemo(
    () => ({ data, error, loading, refreshing, live, refresh }),
    [data, error, loading, refreshing, live, refresh],
  );
}
