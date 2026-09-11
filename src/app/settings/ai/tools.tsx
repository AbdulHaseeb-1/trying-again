import { useMemo } from 'react';

import type { AgentToolSummary } from '@/agent/protocol';
import { useAiSettings } from '@/agent/state/use-ai-settings';
import { SettingsGroup, SettingsRow } from '@/agent/ui/settings-kit';
import { SettingsIntro, SettingsScreen } from '@/agent/ui/settings-screen';

const DOMAIN_TITLES: Record<string, string> = {
  market: 'Market data',
  chart: 'Chart',
  news: 'News',
  app: 'Application',
  web: 'Internet',
};

/**
 * Settings → AI & Agents → Tools.
 *
 * A read-only inventory, on purpose. Tools are not enabled here — they are
 * granted through an agent's capabilities, which is the only place the decision
 * can be made coherently. What this screen answers is the question an operator
 * actually asks: *what can these things reach, and what does each one need?*
 */
export default function ToolsScreen() {
  const { settings, loading, error, reload, refresh, refreshing } = useAiSettings();

  const grouped = useMemo(() => {
    const buckets = new Map<string, AgentToolSummary[]>();
    for (const tool of settings?.tools ?? []) {
      const bucket = buckets.get(tool.domain) ?? [];
      bucket.push(tool);
      buckets.set(tool.domain, bucket);
    }
    return [...buckets.entries()];
  }, [settings]);

  const labels = new Map((settings?.capabilities ?? []).map((entry) => [entry.id, entry.label]));

  return (
    <SettingsScreen
      title="Tools"
      subtitle={`${settings?.tools.length ?? 0} capabilities`}
      loading={loading}
      error={error}
      onRetry={reload}
      onRefresh={refresh}
      refreshing={refreshing}>
      <SettingsIntro
        icon="info"
        text="Every tool is typed, permission-checked and time-bounded on the server. Grant or revoke them per agent under Agents."
      />

      {grouped.map(([domain, tools]) => (
        <SettingsGroup key={domain} title={DOMAIN_TITLES[domain] ?? domain}>
          {(tools ?? []).map((tool, index) => (
            <SettingsRow
              key={tool.name}
              first={index === 0}
              title={tool.name}
              detail={tool.description}
              value={labels.get(tool.capability) ?? tool.capability}
              status={tool.level === 'EXTERNAL_NETWORK' ? 'warning' : 'muted'}
              accessory="none"
            />
          ))}
        </SettingsGroup>
      ))}
    </SettingsScreen>
  );
}
