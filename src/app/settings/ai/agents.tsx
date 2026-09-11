import { useCallback, useState } from 'react';

import { updateAgentConfig } from '@/agent/client/agent-api';
import type { AgentSummary } from '@/agent/protocol';
import { useAiSettings } from '@/agent/state/use-ai-settings';
import { Menu, MenuItem } from '@/agent/ui/primitives';
import { SettingsGroup, SettingsRow, SettingsSwitch } from '@/agent/ui/settings-kit';
import { SettingsIntro, SettingsScreen } from '@/agent/ui/settings-screen';

/**
 * Settings → AI & Agents → Agents.
 *
 * Each agent's capabilities are shown as the concrete permissions they are —
 * "Read application news", not "news access" — and can be turned off but never
 * on beyond what the agent's definition allows. That ceiling is enforced by the
 * server; this screen simply does not offer capabilities outside it, so the two
 * cannot disagree.
 */
export default function AgentsScreen() {
  const { settings, loading, error, reload, refresh, refreshing } = useAiSettings();
  const [expanded, setExpanded] = useState<AgentSummary | null>(null);
  const [saving, setSaving] = useState(false);

  const setEnabled = useCallback(
    async (agent: AgentSummary, enabled: boolean) => {
      setSaving(true);
      try {
        await updateAgentConfig(agent.id, { enabled });
        await reload();
      } finally {
        setSaving(false);
      }
    },
    [reload],
  );

  const toggleCapability = useCallback(
    async (agent: AgentSummary, capability: string) => {
      const next = agent.capabilities.includes(capability as never)
        ? agent.capabilities.filter((entry) => entry !== capability)
        : [...agent.capabilities, capability];
      setSaving(true);
      try {
        await updateAgentConfig(agent.id, { capabilities: next });
        await reload();
        setExpanded((current) =>
          current ? { ...current, capabilities: next as AgentSummary['capabilities'] } : current,
        );
      } finally {
        setSaving(false);
      }
    },
    [reload],
  );

  const labels = new Map((settings?.capabilities ?? []).map((entry) => [entry.id, entry.label]));

  return (
    <SettingsScreen
      title="Agents"
      loading={loading}
      error={error}
      onRetry={reload}
      onRefresh={refresh}
      refreshing={refreshing}>
      <SettingsIntro
        icon="info"
        text="Turning a capability off removes the matching tools from that agent entirely — the model is never told they exist."
      />

      {(settings?.agents ?? []).map((agent) => (
        <SettingsGroup key={agent.id} title={agent.name} footer={agent.description}>
          <SettingsSwitch
            first
            title="Enabled"
            value={agent.enabled}
            disabled={saving}
            onChange={(next) => void setEnabled(agent, next)}
          />
          <SettingsRow
            title="Model"
            value={agent.model ? `${agent.model.providerId} · ${agent.model.modelId}` : 'Not configured'}
            detail={`Role: ${agent.modelRole}`}
            status={agent.model ? 'ok' : 'warning'}
            accessory="none"
          />
          {agent.fallbackModel ? (
            <SettingsRow
              title="Fallback"
              value={`${agent.fallbackModel.providerId} · ${agent.fallbackModel.modelId}`}
              accessory="none"
            />
          ) : null}
          <SettingsRow
            title="Capabilities"
            detail={
              agent.capabilities.length > 0
                ? agent.capabilities.map((entry) => labels.get(entry) ?? entry).join(', ')
                : 'None'
            }
            value={`${agent.capabilities.length}`}
            onPress={() => setExpanded(agent)}
          />
          <SettingsRow
            title="Tools"
            value={`${agent.toolNames.length}`}
            detail={agent.toolNames.slice(0, 4).join(', ') + (agent.toolNames.length > 4 ? '…' : '')}
            accessory="none"
          />
        </SettingsGroup>
      ))}

      <Menu visible={expanded !== null} onClose={() => setExpanded(null)} title={expanded?.name}>
        {(settings?.capabilities ?? []).map((capability) => {
          const held = expanded?.capabilities.includes(capability.id) ?? false;
          return (
            <MenuItem
              key={capability.id}
              label={capability.label}
              detail={capability.id}
              selected={held}
              onPress={() => expanded && void toggleCapability(expanded, capability.id)}
            />
          );
        })}
      </Menu>
    </SettingsScreen>
  );
}
