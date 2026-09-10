import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { LiquidityMap } from '@/data/derivatives';
import { DerivativesApiError, fetchLiquidityMap } from '@/lib/derivatives-api';

export type LiquidityMapState = {
  map: LiquidityMap | null;
  loading: boolean;
  error: string | null;
  /** True when the service has no map for this symbol (CoinGlass only serves some). */
  unavailable: boolean;
};

/**
 * The heatmap, fetched only while its view is on screen.
 *
 * It is an order of magnitude bigger than the rest of the derivatives payload
 * and only one tab draws it, so it is deliberately not part of the overview
 * poll: `enabled` goes true when the view opens and false when it closes.
 */
export function useLiquidityMap(symbol: string | null, enabled: boolean, pollMs = 60_000): LiquidityMapState {
  const [map, setMap] = useState<LiquidityMap | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!enabled) return;
      setLoading(true);
      try {
        const response = await fetchLiquidityMap(symbol ?? undefined, signal);
        if (!mounted.current) return;
        setMap(response.map);
        setError(null);
        setUnavailable(false);
      } catch (cause) {
        if (signal?.aborted || !mounted.current) return;
        // A 404 is not a failure: CoinGlass simply does not publish a map for
        // every coin, and saying so beats an error the user cannot act on.
        if (cause instanceof DerivativesApiError && cause.status === 404) {
          setUnavailable(true);
          setMap(null);
          setError(null);
        } else {
          setError(cause instanceof DerivativesApiError ? cause.message : String(cause));
        }
      } finally {
        if (mounted.current) setLoading(false);
      }
    },
    [enabled, symbol],
  );

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void Promise.resolve().then(() => load(controller.signal));
    return () => controller.abort();
  }, [enabled, load]);

  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => void load(), Math.max(30_000, pollMs));
    return () => clearInterval(timer);
  }, [enabled, load, pollMs]);

  return useMemo(() => ({ map, loading, error, unavailable }), [map, loading, error, unavailable]);
}
