import { useCallback, useEffect, useState } from 'react';

import { fetchBootstrap, fetchRuns, updatePrivacy } from '@/agent/client/agent-api';
import type { AgentBootstrap, AgentRunRecord } from '@/agent/protocol';
import { useAiSettings } from '@/agent/state/use-ai-settings';
import { SettingsGroup, SettingsRow, SettingsSwitch } from '@/agent/ui/settings-kit';
import { SettingsIntro, SettingsScreen } from '@/agent/ui/settings-screen';

/**
 * Settings → AI & Agents → Advanced.
 *
 * The run inspector lives here, behind debug mode, and shows the numbers that
 * actually diagnose a bad experience: time to first token, which model finished
 * the run, how many tools ran and how many failed. It shows no prompts and no
 * completions — those are the user's conversation, not diagnostics.
 */
export default function AdvancedScreen() {
  const { settings, loading, error, reload, refresh, refreshing } = useAiSettings();
  const [runs, setRuns] = useState<AgentRunRecord[]>([]);
  const [bootstrap, setBootstrap] = useState<AgentBootstrap | null>(null);
  const [saving, setSaving] = useState(false);

  const debug = settings?.privacy.debugMode ?? false;

  useEffect(() => {
    void fetchBootstrap()
      .then(setBootstrap)
      .catch(() => setBootstrap(null));
  }, []);

  useEffect(() => {
    if (!debug) return;
    void fetchRuns()
      .then((page) => setRuns(page.runs))
      .catch(() => setRuns([]));
  }, [debug, refreshing]);

  // Derived rather than cleared in the effect: turning debug off should hide
  // the inspector immediately, not on the next render pass.
  const visibleRuns = debug ? runs : [];

  const toggleDebug = useCallback(
    async (next: boolean) => {
      setSaving(true);
      try {
        await updatePrivacy({ debugMode: next });
        await reload();
      } finally {
        setSaving(false);
      }
    },
    [reload],
  );

  return (
    <SettingsScreen
      title="Advanced"
      loading={loading}
      error={error}
      onRetry={reload}
      onRefresh={refresh}
      refreshing={refreshing}>
      <SettingsIntro
        icon="sliders"
        text="Debug mode adds tool inputs and outputs to the assistant's tool cards and unlocks the run inspector below."
      />

      <SettingsGroup>
        <SettingsSwitch
          first
          title="Debug mode"
          detail="Show tool payloads and run details"
          value={debug}
          disabled={saving}
          onChange={(next) => void toggleDebug(next)}
        />
      </SettingsGroup>

      <SettingsGroup title="Service">
        <SettingsRow
          first
          title="Conversation storage"
          value={bootstrap?.storage ?? '—'}
          detail={
            bootstrap?.storage === 'postgres'
              ? 'Postgres'
              : 'A durable JSON store — set DATABASE_URL for Postgres'
          }
          accessory="none"
        />
        <SettingsRow
          title="News storage"
          value={bootstrap?.newsStorage ?? '—'}
          accessory="none"
        />
        <SettingsRow
          title="Device"
          value={bootstrap?.principal.deviceId.slice(0, 14) ?? '—'}
          detail="Conversations are scoped to this device"
          accessory="none"
        />
      </SettingsGroup>

      {debug ? (
        <SettingsGroup
          title="Recent runs"
          footer="Latency, model and tool counts only. No prompts or completions are recorded here.">
          {visibleRuns.length === 0 ? (
            <SettingsRow first title="No runs recorded yet" accessory="none" />
          ) : (
            visibleRuns.map((run, index) => (
              <SettingsRow
                key={run.id}
                first={index === 0}
                title={`${run.agentId} · ${run.status}`}
                detail={describeRun(run)}
                value={run.durationMs ? `${(run.durationMs / 1000).toFixed(1)}s` : '—'}
                status={run.status === 'completed' ? 'ok' : run.status === 'failed' ? 'error' : 'muted'}
                accessory="none"
              />
            ))
          )}
        </SettingsGroup>
      ) : null}
    </SettingsScreen>
  );
}

function describeRun(run: AgentRunRecord): string {
  const parts: string[] = [];
  if (run.model) parts.push(`${run.model.providerId}/${run.model.modelId}`);
  if (run.fallbackFrom) {
    // The one line that makes a silent failover visible after the fact.
    parts.push(`fell back from ${run.fallbackFrom.providerId}/${run.fallbackFrom.modelId}`);
  }
  if (run.firstTokenMs !== null) parts.push(`first token ${run.firstTokenMs} ms`);
  if (run.toolCalls > 0) {
    parts.push(`${run.toolCalls} tool${run.toolCalls === 1 ? '' : 's'}${run.toolFailures > 0 ? `, ${run.toolFailures} failed` : ''}`);
  }
  if (run.handoffs > 0) parts.push(`${run.handoffs} handoff${run.handoffs === 1 ? '' : 's'}`);
  if (run.referenceCount > 0) parts.push(`${run.referenceCount} sources`);
  if (run.usage.totalTokens > 0) parts.push(`${run.usage.totalTokens} tokens`);
  if (run.errorCode) parts.push(run.errorCode);
  return parts.join(' · ');
}
