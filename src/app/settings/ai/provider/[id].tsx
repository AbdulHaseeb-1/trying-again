import { useCallback, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';

import {
  fetchProviderModels,
  removeCustomProvider,
  testProvider,
  updateProvider,
} from '@/agent/client/agent-api';
import type { ConnectionResult, ModelDescriptor, ProviderSummary } from '@/agent/protocol';
import { useAiSettings } from '@/agent/state/use-ai-settings';
import { Menu, MenuItem } from '@/agent/ui/primitives';
import {
  ResultBanner,
  SettingsButton,
  SettingsField,
  SettingsGroup,
  SettingsRow,
  SettingsSwitch,
} from '@/agent/ui/settings-kit';
import { SettingsScreen } from '@/agent/ui/settings-screen';

/**
 * One provider's configuration.
 *
 * The form is generated from the provider's own `configFields`, not hard-coded
 * per vendor — OpenAI shows organization and project, a compatible endpoint
 * shows custom headers, Google shows neither. That is what makes "add a
 * provider" a server-side change with no client work.
 *
 * "Test connection" deliberately accepts the key currently in the field rather
 * than the stored one, so a wrong key never has to be saved to be found out.
 */
export default function ProviderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { settings, loading, error, reload, refresh, refreshing } = useAiSettings();

  const provider = useMemo<ProviderSummary | null>(
    () => settings?.providers.find((entry) => entry.id === id) ?? null,
    [id, settings],
  );
  const isCustom = (settings?.customProviders ?? []).some((entry) => entry.id === id);

  if (!loading && !provider) {
    return (
      <SettingsScreen title="Provider" error={`No provider "${id}".`} onRetry={reload}>
        <></>
      </SettingsScreen>
    );
  }

  return (
    <SettingsScreen
      title={provider?.name ?? 'Provider'}
      subtitle={provider?.kind}
      loading={loading || !provider}
      error={error}
      onRetry={reload}
      onRefresh={refresh}
      refreshing={refreshing}>
      {provider ? (
        // Keyed by identity *and* by the values it seeds from, so a save that
        // changes the stored configuration re-seeds the form rather than
        // leaving it showing what was typed three screens ago.
        <ProviderForm
          key={`${provider.id}:${provider.baseUrl ?? ''}:${provider.timeoutMs}:${provider.maxRetries}`}
          provider={provider}
          isCustom={isCustom}
          onSaved={reload}
        />
      ) : null}
    </SettingsScreen>
  );
}

function ProviderForm({
  provider,
  isCustom,
  onSaved,
}: {
  provider: ProviderSummary;
  isCustom: boolean;
  onSaved: () => Promise<void>;
}) {
  const router = useRouter();

  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState(provider.baseUrl ?? '');
  const [organization, setOrganization] = useState('');
  const [project, setProject] = useState('');
  const [timeoutMs, setTimeoutMs] = useState(String(provider.timeoutMs));
  const [maxRetries, setMaxRetries] = useState(String(provider.maxRetries));
  const [result, setResult] = useState<ConnectionResult | null>(null);
  const [models, setModels] = useState<ModelDescriptor[]>([]);
  const [modelPicker, setModelPicker] = useState(false);
  const [busy, setBusy] = useState<'save' | 'test' | 'models' | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const fields = useMemo(
    () => new Set(provider.configFields.map((field) => field.key)),
    [provider.configFields],
  );

  const save = useCallback(
    async (patch: Record<string, unknown>) => {
      setBusy('save');
      setSaveError(null);
      try {
        await updateProvider(provider.id, patch);
        setApiKey('');
        await onSaved();
      } catch (cause) {
        setSaveError(cause instanceof Error ? cause.message : 'Could not save.');
      } finally {
        setBusy(null);
      }
    },
    [onSaved, provider.id],
  );

  const runTest = useCallback(async () => {
    setBusy('test');
    setResult(null);
    try {
      setResult(
        await testProvider(provider.id, {
          apiKey: apiKey || undefined,
          baseUrl: baseUrl || undefined,
          model: provider.defaultModel ?? undefined,
        }),
      );
    } catch (cause) {
      setResult({
        status: 'error',
        message: cause instanceof Error ? cause.message : 'The test could not run.',
      });
    } finally {
      setBusy(null);
    }
  }, [apiKey, baseUrl, provider.defaultModel, provider.id]);

  const loadModels = useCallback(async () => {
    setBusy('models');
    try {
      const listed = await fetchProviderModels(provider.id);
      setModels(listed.models);
    } catch {
      setModels(provider.suggestedModels);
    } finally {
      setModelPicker(true);
      setBusy(null);
    }
  }, [provider.id, provider.suggestedModels]);

  return (
    <>
      {saveError ? <ResultBanner tone="error" title="Could not save" detail={saveError} /> : null}

      <SettingsGroup>
        <SettingsSwitch
          first
          title="Enabled"
          detail="Agents may use this provider"
          value={provider.enabled}
          onChange={(next) => void save({ enabled: next })}
        />
        <SettingsRow
          title="Default model"
          value={provider.defaultModel ?? 'Not set'}
          detail="Used when no role or agent names a model"
          onPress={() => void loadModels()}
        />
      </SettingsGroup>

      <SettingsGroup
        title="Credentials"
        footer="Keys are encrypted at rest on the server. This screen can replace a key but never read one.">
        {fields.has('apiKey') ? (
          <SettingsField
            first
            label="API key"
            value={apiKey}
            onChange={setApiKey}
            secure
            placeholder={provider.apiKeyPreview ?? 'Not set'}
            help={
              provider.apiKeyPreview
                ? `A key is stored (${provider.apiKeyPreview}). Enter a new one to replace it.`
                : undefined
            }
          />
        ) : null}
        {fields.has('baseUrl') ? (
          <SettingsField
            first={!fields.has('apiKey')}
            label="Base URL"
            value={baseUrl}
            onChange={setBaseUrl}
            placeholder={
              provider.configFields.find((field) => field.key === 'baseUrl')?.placeholder ??
              'https://…'
            }
            keyboardType="url"
          />
        ) : null}
        {fields.has('organization') ? (
          <SettingsField label="Organization" value={organization} onChange={setOrganization} />
        ) : null}
        {fields.has('project') ? (
          <SettingsField label="Project" value={project} onChange={setProject} />
        ) : null}
        <SettingsButton
          label="Save credentials"
          busy={busy === 'save'}
          onPress={() =>
            void save({
              // An empty field means "leave it alone", which is the only sane
              // reading when the current value cannot be displayed.
              ...(apiKey ? { apiKey } : {}),
              ...(fields.has('baseUrl') && baseUrl ? { baseUrl } : {}),
              ...(organization ? { organization } : {}),
              ...(project ? { project } : {}),
            })
          }
        />
      </SettingsGroup>

      <SettingsGroup title="Connection">
        <SettingsButton
          first
          label="Test connection"
          busy={busy === 'test'}
          onPress={() => void runTest()}
        />
      </SettingsGroup>

      {result ? (
        <ResultBanner
          tone={
            result.status === 'connected' ? 'ok' : result.status === 'rate_limited' ? 'warning' : 'error'
          }
          title={connectionTitle(result)}
          detail={result.latencyMs ? `${result.message} · ${result.latencyMs} ms` : result.message}
        />
      ) : null}

      <SettingsGroup title="Limits">
        <SettingsField
          first
          label="Timeout (ms)"
          value={timeoutMs}
          onChange={setTimeoutMs}
          keyboardType="numeric"
        />
        <SettingsField
          label="Retries"
          value={maxRetries}
          onChange={setMaxRetries}
          keyboardType="numeric"
        />
        <SettingsButton
          label="Save limits"
          busy={busy === 'save'}
          onPress={() =>
            void save({
              timeoutMs: Number.parseInt(timeoutMs, 10) || undefined,
              maxRetries: Number.parseInt(maxRetries, 10) || 0,
            })
          }
        />
      </SettingsGroup>

      <SettingsGroup
        title="Capabilities"
        footer="Reported by the provider. Parameters it does not support are hidden elsewhere in settings.">
        {capabilityRows(provider).map((row, index) => (
          <SettingsRow
            key={row.label}
            first={index === 0}
            title={row.label}
            value={row.value ? 'Yes' : 'No'}
            accessory="none"
          />
        ))}
      </SettingsGroup>

      {isCustom ? (
        <SettingsGroup>
          <SettingsButton
            first
            tone="danger"
            label="Remove this provider"
            onPress={() =>
              void removeCustomProvider(provider.id).then(() => {
                router.back();
              })
            }
          />
        </SettingsGroup>
      ) : null}

      <Menu visible={modelPicker} onClose={() => setModelPicker(false)} title="Default model">
        {models.length === 0 ? (
          <MenuItem
            label="No models reported"
            detail="Check the key and base URL"
            onPress={() => setModelPicker(false)}
          />
        ) : (
          models.map((model) => (
            <MenuItem
              key={model.id}
              label={model.label}
              detail={
                model.contextWindow ? `${model.contextWindow.toLocaleString()} token context` : model.id
              }
              selected={model.id === provider.defaultModel}
              onPress={() => {
                setModelPicker(false);
                void save({ defaultModel: model.id });
              }}
            />
          ))
        )}
      </Menu>
    </>
  );
}

function connectionTitle(result: ConnectionResult): string {
  switch (result.status) {
    case 'connected':
      return 'Connected';
    case 'auth_failed':
      return 'Authentication failed';
    case 'unreachable':
      return 'Endpoint unreachable';
    case 'unsupported_model':
      return 'Unsupported model';
    case 'rate_limited':
      return 'Rate limited';
    case 'not_configured':
      return 'Not configured';
    default:
      return 'Test failed';
  }
}

function capabilityRows(provider: ProviderSummary) {
  const capabilities = provider.capabilities;
  return [
    { label: 'Streaming', value: capabilities.streaming },
    { label: 'Tool calling', value: capabilities.toolCalling },
    { label: 'Structured output', value: capabilities.structuredOutput },
    { label: 'Reasoning', value: capabilities.reasoning },
    { label: 'Vision', value: capabilities.vision },
    { label: 'Hosted web search', value: capabilities.webSearch },
    { label: 'Usage reporting', value: capabilities.usageReporting },
  ];
}
