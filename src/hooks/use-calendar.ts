import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';

import {
  calendarStreamUrl,
  fetchCalendar,
  fetchCalendarHistory,
  requestRefresh,
  CalendarApiError,
} from '@/lib/calendar-api';
import type { CalendarEvent, CalendarResponse } from '@/data/calendar';

export type CalendarState = {
  data: CalendarResponse | null;
  error: string | null;
  loading: boolean;
  refreshing: boolean;
  /** True while the service is inside a release burst, so the UI can say so. */
  live: boolean;
  refresh: () => Promise<void>;
  /** Past releases pulled from the archive, oldest first. */
  history: CalendarEvent[];
  loadingHistory: boolean;
  historyError: string | null;
  /** True once a page came back empty: the archive goes no further back. */
  historyExhausted: boolean;
  /** False when the service has no archive to ask. */
  canLoadEarlier: boolean;
  loadEarlier: () => Promise<void>;
};

const DEFAULT_POLL_MS = 60_000;
/** How far back one tap reaches. */
const HISTORY_STEP_DAYS = 7;

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

  // Past releases live in the service's Postgres archive, not in the live
  // window, so they are fetched on demand and kept beside it rather than
  // merged into it — the window keeps refreshing underneath, and history does
  // not change.
  const [history, setHistory] = useState<CalendarEvent[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyExhausted, setHistoryExhausted] = useState(false);

  const earliestLoaded = history[0]?.scheduledAt ?? data?.window.from ?? null;

  const loadEarlier = useCallback(async () => {
    if (!earliestLoaded || loadingHistory) return;
    setLoadingHistory(true);
    setHistoryError(null);
    try {
      const to = new Date(new Date(earliestLoaded).getTime() - 1);
      const from = new Date(to.getTime() - HISTORY_STEP_DAYS * 86_400_000);
      const page = await fetchCalendarHistory({ from, to });
      if (!mounted.current) return;
      // An empty page means the archive has nothing older — which is the usual
      // answer on a young database, and worth saying rather than leaving a
      // button that appears to do nothing.
      if (page.events.length === 0) setHistoryExhausted(true);
      setHistory((current) => {
        const seen = new Set(current.map((event) => event.id));
        const merged = [...page.events.filter((event) => !seen.has(event.id)), ...current];
        return merged.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
      });
    } catch (cause) {
      if (!mounted.current) return;
      setHistoryError(
        cause instanceof CalendarApiError && cause.status === 503
          ? 'The service is running without its archive, so there is no history to show.'
          : cause instanceof CalendarApiError
            ? cause.message
            : String(cause),
      );
    } finally {
      if (mounted.current) setLoadingHistory(false);
    }
  }, [earliestLoaded, loadingHistory]);

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
    () => ({
      data,
      error,
      loading,
      refreshing,
      live,
      refresh,
      history,
      loadingHistory,
      historyError,
      historyExhausted,
      canLoadEarlier: data?.archiveEnabled !== false,
      loadEarlier,
    }),
    [
      data,
      error,
      loading,
      refreshing,
      live,
      refresh,
      history,
      loadingHistory,
      historyError,
      historyExhausted,
      loadEarlier,
    ],
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
