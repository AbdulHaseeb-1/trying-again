import { useCallback, useState } from 'react';

import { fetchProviderModels, setModelRole } from '@/agent/client/agent-api';
import type { ModelDescriptor } from '@/agent/protocol';
import { useAiSettings } from '@/agent/state/use-ai-settings';
import { Menu, MenuItem } from '@/agent/ui/primitives';
import { SettingsGroup, SettingsRow } from '@/agent/ui/settings-kit';
import { SettingsIntro, SettingsScreen } from '@/agent/ui/settings-screen';

const ROLES = [
  {
    id: 'primary',
    title: 'Primary',
    detail: 'The default for conversation and market analysis',
  },
  { id: 'research', title: 'Research', detail: 'News and web investigation' },
  { id: 'fast', title: 'Fast', detail: 'Short, latency-sensitive work' },
  {
    id: 'fallback',
    title: 'Fallback',
    detail: 'Used when the primary provider fails before answering',
  },
] as const;

/**
 * Settings → AI & Agents → Models.
 *
 * Roles rather than a single model choice, because the right model for reading
 * a funding curve is rarely the right model for a twelve-source research pass.
 * Picking a provider first and a model second mirrors how the resolution
 * actually works, and makes a cross-provider setup — primary on OpenAI,
 * research on OpenRouter — a two-tap operation rather than a concept.
 */
export default function ModelsScreen() {
  const { settings, loading, error, reload, refresh, refreshing } = useAiSettings();
  const [pickingRole, setPickingRole] = useState<string | null>(null);
  const [pickingProvider, setPickingProvider] = useState<string | null>(null);
  const [models, setModels] = useState<ModelDescriptor[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  const chooseProvider = useCallback(async (role: string, providerId: string) => {
    setPickingProvider(providerId);
    setLoadingModels(true);
    try {
      const listed = await fetchProviderModels(providerId);
      setModels(listed.models);
    } catch {
      setModels([]);
    } finally {
      setLoadingModels(false);
    }
    void role;
  }, []);

  const assign = useCallback(
    async (role: string, providerId: string, modelId: string) => {
      await setModelRole(role, { providerId, modelId });
      setPickingRole(null);
      setPickingProvider(null);
      await reload();
    },
    [reload],
  );

  const clear = useCallback(
    async (role: string) => {
      await setModelRole(role, {});
      setPickingRole(null);
      setPickingProvider(null);
      await reload();
    },
    [reload],
  );

  const available = (settings?.providers ?? []).filter((provider) => provider.enabled);

  return (
    <SettingsScreen
      title="Models"
      loading={loading}
      error={error}
      onRetry={reload}
      onRefresh={refresh}
      refreshing={refreshing}>
      <SettingsIntro
        icon="info"
        text="Each role can sit on a different provider. An agent uses its own model if it has one, then its role, then Primary."
      />

      <SettingsGroup title="Roles">
        {ROLES.map((role, index) => {
          const selection = settings?.models[role.id];
          return (
            <SettingsRow
              key={role.id}
              first={index === 0}
              title={role.title}
              detail={role.detail}
              value={selection ? `${selection.providerId} · ${selection.modelId}` : 'Not set'}
              status={selection ? 'ok' : role.id === 'primary' ? 'warning' : 'muted'}
              onPress={() => {
                setPickingRole(role.id);
                setPickingProvider(null);
                setModels([]);
              }}
            />
          );
        })}
      </SettingsGroup>

      <Menu
        visible={pickingRole !== null && pickingProvider === null}
        onClose={() => setPickingRole(null)}
        title="Choose a provider">
        {available.length === 0 ? (
          <MenuItem
            label="No provider is enabled"
            detail="Enable one under Providers first"
            onPress={() => setPickingRole(null)}
          />
        ) : (
          available.map((provider) => (
            <MenuItem
              key={provider.id}
              icon="globe"
              label={provider.name}
              detail={provider.defaultModel ?? provider.kind}
              onPress={() => void chooseProvider(pickingRole!, provider.id)}
            />
          ))
        )}
        {pickingRole && settings?.models[pickingRole as 'primary'] ? (
          <MenuItem
            icon="close"
            label="Clear this role"
            destructive
            onPress={() => void clear(pickingRole)}
          />
        ) : null}
      </Menu>

      <Menu
        visible={pickingProvider !== null}
        onClose={() => setPickingProvider(null)}
        title={loadingModels ? 'Loading models…' : 'Choose a model'}>
        {loadingModels ? (
          <MenuItem label="Asking the provider…" onPress={() => undefined} />
        ) : models.length === 0 ? (
          <MenuItem
            label="No models reported"
            detail="The provider could not list models. Set a default model on its own screen instead."
            onPress={() => setPickingProvider(null)}
          />
        ) : (
          models.map((model) => (
            <MenuItem
              key={model.id}
              label={model.label}
              detail={model.contextWindow ? `${model.contextWindow.toLocaleString()} tokens` : model.id}
              onPress={() => void assign(pickingRole!, pickingProvider!, model.id)}
            />
          ))
        )}
      </Menu>
    </SettingsScreen>
  );
}
