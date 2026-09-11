import { useCallback, useState } from 'react';
import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { addCustomProvider } from '@/agent/client/agent-api';
import { useAiSettings } from '@/agent/state/use-ai-settings';
import { Menu } from '@/agent/ui/primitives';
import {
  SettingsButton,
  SettingsField,
  SettingsGroup,
  SettingsRow,
} from '@/agent/ui/settings-kit';
import { SettingsIntro, SettingsScreen } from '@/agent/ui/settings-screen';

/**
 * Settings → AI & Agents → Providers.
 *
 * One row per provider, with the state that actually matters up front:
 * connected, configured but off, or not configured at all. Everything editable
 * lives one level deeper, so this screen stays a list you can scan.
 */
export default function ProvidersScreen() {
  const router = useRouter();
  const { settings, loading, error, reload, refresh, refreshing } = useAiSettings();
  const [adding, setAdding] = useState(false);
  const [newId, setNewId] = useState('');
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const submit = useCallback(async () => {
    const id = newId.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
    if (!id || !newName.trim()) return;
    setBusy(true);
    setAddError(null);
    try {
      await addCustomProvider({ id, name: newName.trim() });
      setAdding(false);
      setNewId('');
      setNewName('');
      await reload();
      router.push(`/settings/ai/provider/${id}`);
    } catch (cause) {
      setAddError(cause instanceof Error ? cause.message : 'Could not add that provider.');
    } finally {
      setBusy(false);
    }
  }, [newId, newName, reload, router]);

  const providers = settings?.providers ?? [];
  const custom = new Set((settings?.customProviders ?? []).map((entry) => entry.id));

  return (
    <SettingsScreen
      title="Providers"
      subtitle={`${providers.filter((provider) => provider.enabled && provider.configured).length} connected`}
      loading={loading}
      error={error}
      onRetry={reload}
      onRefresh={refresh}
      refreshing={refreshing}>
      <SettingsIntro
        icon="info"
        text="A provider needs a key and at least one model. Keys are written to the server's encrypted store and can never be read back — only replaced."
      />

      <SettingsGroup title="Configured">
        {providers.map((provider, index) => (
          <SettingsRow
            key={provider.id}
            first={index === 0}
            icon="globe"
            title={provider.name}
            detail={statusLine(provider)}
            status={provider.enabled && provider.configured ? 'ok' : provider.configured ? 'warning' : 'muted'}
            value={custom.has(provider.id) ? 'Custom' : undefined}
            onPress={() => router.push(`/settings/ai/provider/${provider.id}`)}
          />
        ))}
      </SettingsGroup>

      <SettingsGroup
        footer="A custom provider is any endpoint that speaks the OpenAI Chat Completions API — a self-hosted gateway, a proxy, or a vendor with a compatible surface.">
        <SettingsButton first label="Add a custom provider" onPress={() => setAdding(true)} />
      </SettingsGroup>

      <Menu visible={adding} onClose={() => setAdding(false)} title="Add a provider">
        <View style={{ paddingBottom: 8 }}>
          <SettingsField
            first
            label="Name"
            value={newName}
            onChange={setNewName}
            placeholder="Internal gateway"
            autoCapitalize="sentences"
          />
          <SettingsField
            label="Id"
            value={newId}
            onChange={setNewId}
            placeholder="internal-gateway"
            help="Lower-case letters, digits and dashes. Used in configuration, not shown to users."
          />
          {addError ? (
            <SettingsRow title={addError} status="error" accessory="none" />
          ) : null}
          <SettingsButton label="Add provider" busy={busy} onPress={() => void submit()} />
        </View>
      </Menu>
    </SettingsScreen>
  );
}

function statusLine(provider: {
  enabled: boolean;
  configured: boolean;
  apiKeyPreview: string | null;
  defaultModel: string | null;
}): string {
  if (!provider.configured) return 'Not configured';
  if (!provider.enabled) return 'Configured, turned off';
  const key = provider.apiKeyPreview ? `Key ${provider.apiKeyPreview}` : 'No key';
  return provider.defaultModel ? `${key} · ${provider.defaultModel}` : key;
}
