import { useRouter } from 'expo-router';

import { useAiSettings } from '@/agent/state/use-ai-settings';
import { SettingsGroup, SettingsRow } from '@/agent/ui/settings-kit';
import { SettingsIntro, SettingsScreen } from '@/agent/ui/settings-screen';

/**
 * Settings → AI & Agents.
 *
 * A hub rather than one long screen. Seven concerns that share only a subject
 * do not belong on one page; each row below is a screen with its own state and
 * its own failure modes, and the summary on the right is what tells you whether
 * you need to open it.
 */
export default function AiSettingsHub() {
  const router = useRouter();
  const { settings, loading, error, reload, refresh, refreshing } = useAiSettings();

  const connected = settings?.providers.filter((provider) => provider.enabled && provider.configured) ?? [];
  const searchProviders = settings?.search.providers.filter((provider) => provider.enabled) ?? [];
  const primary = settings?.models.primary;
  const agents = settings?.agents ?? [];

  return (
    <SettingsScreen
      title="AI & Agents"
      subtitle={primary ? `${primary.providerId} · ${primary.modelId}` : 'Not configured'}
      loading={loading}
      error={error}
      onRetry={reload}
      onRefresh={refresh}
      refreshing={refreshing}>
      <SettingsIntro
        icon="info"
        text="Agents run on the providers you configure here. API keys are stored on the server and are never sent back to this device."
      />

      <SettingsGroup title="Connections">
        <SettingsRow
          first
          icon="globe"
          title="Providers"
          detail={
            connected.length > 0
              ? connected.map((provider) => provider.name).join(', ')
              : 'No provider configured yet'
          }
          status={connected.length > 0 ? 'ok' : 'warning'}
          onPress={() => router.push('/settings/ai/providers')}
        />
        <SettingsRow
          icon="zap"
          title="Models"
          detail="Primary, research, fast and fallback"
          value={primary ? primary.modelId : 'None'}
          onPress={() => router.push('/settings/ai/models')}
        />
        <SettingsRow
          icon="search"
          title="Search"
          detail={
            searchProviders.length > 0
              ? searchProviders.map((provider) => provider.name).join(', ')
              : 'No search engine enabled'
          }
          status={searchProviders.length > 0 ? 'ok' : 'muted'}
          onPress={() => router.push('/settings/ai/search')}
        />
      </SettingsGroup>

      <SettingsGroup title="Behaviour">
        <SettingsRow
          first
          icon="sparkles"
          title="Agents"
          detail={`${agents.filter((agent) => agent.enabled).length} of ${agents.length} enabled`}
          onPress={() => router.push('/settings/ai/agents')}
        />
        <SettingsRow
          icon="tool"
          title="Tools"
          detail={`${settings?.tools.length ?? 0} application capabilities`}
          onPress={() => router.push('/settings/ai/tools')}
        />
        <SettingsRow
          icon="eye"
          title="Privacy & permissions"
          detail="What agents may read and what is stored"
          onPress={() => router.push('/settings/ai/privacy')}
        />
      </SettingsGroup>

      <SettingsGroup
        title="Developer"
        footer="Debug mode shows tool inputs, outputs and run details inside the assistant.">
        <SettingsRow
          first
          icon="sliders"
          title="Advanced"
          detail="Run inspector, storage and diagnostics"
          value={settings?.privacy.debugMode ? 'Debug on' : undefined}
          onPress={() => router.push('/settings/ai/advanced')}
        />
      </SettingsGroup>
    </SettingsScreen>
  );
}
