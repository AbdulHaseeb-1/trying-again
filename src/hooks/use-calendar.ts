import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';

import {
  calendarStreamUrl,
  fetchCalendar,
  requestRefresh,
  CalendarApiError,
} from '@/lib/calendar-api';
import type { CalendarResponse } from '@/data/calendar';

export type CalendarState = {
  data: CalendarResponse | null;
  error: string | null;
  loading: boolean;
  refreshing: boolean;
  /** True while the service is inside a release burst, so the UI can say so. */
  live: boolean;
  refresh: () => Promise<void>;
};

const DEFAULT_POLL_MS = 60_000;

/**
 * Keeps the screen in step with the service.
 *
 * The service does the hard part — scraping on its own schedule and bursting
 * around each release — so the client only has to stay subscribed. On web it
 * opens the SSE stream and re-reads on every push, which surfaces a print
 * within a second of the scraper capturing it. Everywhere else it falls back
 * to polling, since React Native has no EventSource.
 */
export function useCalendar(): CalendarState {
  const [data, setData] = useState<CalendarResponse | null>(null);
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

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const next = await fetchCalendar(signal);
      if (!mounted.current) return;
      setData(next);
      setError(null);
    } catch (cause) {
      if (signal?.aborted || !mounted.current) return;
      setError(cause instanceof CalendarApiError ? cause.message : String(cause));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  // Initial load. Deferred by a microtask so the effect body itself never
  // calls setState synchronously during the commit.
  useEffect(() => {
    const controller = new AbortController();
    const started = Promise.resolve().then(() => load(controller.signal));
    void started;
    return () => controller.abort();
  }, [load]);

  // Background polling. The cadence follows whatever the service reports, so
  // retuning the server's interval retunes every client with it.
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

    const stream = new EventSource(calendarStreamUrl);
    const onPush = () => {
      setLive(true);
      void load();
    };
    stream.addEventListener('release', onPush);
    stream.addEventListener('sync', onPush);
    stream.onerror = () => setLive(false);
    stream.onopen = () => setLive(true);

    return () => {
      stream.removeEventListener('release', onPush);
      stream.removeEventListener('sync', onPush);
      stream.close();
    };
  }, [load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // Ask the service to go and look, then read the result back.
      await requestRefresh().catch(() => undefined);
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

/** A ticking clock for countdowns; one timer for the whole screen. */
export function useNow(intervalMs = 1_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
