import { useCallback, useState } from 'react';

import { updatePrivacy } from '@/agent/client/agent-api';
import { useAiSettings } from '@/agent/state/use-ai-settings';
import { SettingsGroup, SettingsSwitch } from '@/agent/ui/settings-kit';
import { SettingsIntro, SettingsScreen } from '@/agent/ui/settings-screen';

/**
 * Settings → AI & Agents → Privacy & permissions.
 *
 * These four switches sit *above* every per-agent grant: turning web access off
 * here removes the web tools from every agent regardless of what its own
 * configuration says. A master switch that can be overridden further down is
 * not a master switch.
 */
export default function PrivacyScreen() {
  const { settings, loading, error, reload, refresh, refreshing } = useAiSettings();
  const [saving, setSaving] = useState(false);

  const save = useCallback(
    async (patch: Record<string, boolean>) => {
      setSaving(true);
      try {
        await updatePrivacy(patch);
        await reload();
      } finally {
        setSaving(false);
      }
    },
    [reload],
  );

  const privacy = settings?.privacy;

  return (
    <SettingsScreen
      title="Privacy & permissions"
      loading={loading}
      error={error}
      onRetry={reload}
      onRefresh={refresh}
      refreshing={refreshing}>
      <SettingsIntro
        icon="eye"
        text="These apply to every agent. An agent cannot hold a capability the switches below have turned off."
      />

      <SettingsGroup
        title="What agents may reach"
        footer="Turning news or web access off removes those tools from every agent, not just from the ones you expect.">
        <SettingsSwitch
          first
          title="Internet access"
          detail="Web search and opening pages"
          value={privacy?.allowWebAccess ?? true}
          disabled={saving}
          onChange={(next) => void save({ allowWebAccess: next })}
        />
        <SettingsSwitch
          title="Application news"
          detail="The news store, including economic releases"
          value={privacy?.allowNewsAccess ?? true}
          disabled={saving}
          onChange={(next) => void save({ allowNewsAccess: next })}
        />
      </SettingsGroup>

      <SettingsGroup
        title="What is sent"
        footer="Context is pointers only — the symbol you are looking at, not the data behind it. Agents read the data through tools when they need it.">
        <SettingsSwitch
          first
          title="Share what I am looking at"
          detail="Selected symbol, timeframe and workspace"
          value={privacy?.shareAppContext ?? true}
          disabled={saving}
          onChange={(next) => void save({ shareAppContext: next })}
        />
      </SettingsGroup>

      <SettingsGroup
        title="What is kept"
        footer="With this off, a conversation exists only for as long as it is on screen and nothing is written to the server's store.">
        <SettingsSwitch
          first
          title="Store conversations"
          detail="Keep history so conversations survive a restart"
          value={privacy?.storeConversations ?? true}
          disabled={saving}
          onChange={(next) => void save({ storeConversations: next })}
        />
      </SettingsGroup>
    </SettingsScreen>
  );
}
