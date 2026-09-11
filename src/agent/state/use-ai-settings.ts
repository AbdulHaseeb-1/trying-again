import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { AgentApiError, fetchAiSettings } from '@/agent/client/agent-api';
import type { AiSettings } from '@/agent/protocol';

export type AiSettingsState = {
  settings: AiSettings | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  reload: () => Promise<void>;
  refresh: () => Promise<void>;
};

/**
 * The AI configuration, loaded once per screen and re-read after every write.
 *
 * Writes return the updated row, but the screens re-read rather than patching
 * state locally: a provider change can move the resolved model for four agents
 * and flip the "ready" state of the whole panel, and reproducing those
 * derivations on the client is exactly the kind of duplicated logic that drifts.
 * One extra round trip per save is a good trade for never showing a stale
 * configuration.
 */
export function useAiSettings(): AiSettingsState {
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async (mode: 'initial' | 'refresh') => {
    if (mode === 'refresh') setRefreshing(true);
    try {
      const next = await fetchAiSettings();
      if (!mounted.current) return;
      setSettings(next);
      setError(null);
    } catch (cause) {
      if (!mounted.current) return;
      setError(
        cause instanceof AgentApiError
          ? cause.message
          : 'The agent service could not be reached.',
      );
    } finally {
      if (!mounted.current) return;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => load('initial'));
  }, [load]);

  /**
   * Re-read when the screen comes back into focus.
   *
   * These screens push into each other — the provider list opens a provider,
   * which can rename, reconfigure or delete it — so returning to a list that
   * still shows the old state is the default behaviour and the wrong one. The
   * first focus is skipped, because the mount effect above has already read.
   */
  const focusedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!focusedOnce.current) {
        focusedOnce.current = true;
        return;
      }
      void load('refresh');
    }, [load]),
  );

  return {
    settings,
    loading,
    refreshing,
    error,
    reload: useCallback(() => load('initial'), [load]),
    refresh: useCallback(() => load('refresh'), [load]),
  };
}
