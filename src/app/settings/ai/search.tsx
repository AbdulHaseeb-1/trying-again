import { useCallback, useState } from 'react';
import { View } from 'react-native';

import {
  addSearchProvider,
  removeSearchProvider,
  testSearchProvider,
  updateSearchProvider,
  updateSearchSettings,
} from '@/agent/client/agent-api';
import type { AiSettings, SearchHealth } from '@/agent/protocol';
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
import { SettingsIntro, SettingsScreen } from '@/agent/ui/settings-screen';

/**
 * Settings → AI & Agents → Search.
 *
 * The policy on this screen is enforced server-side on every result, not just
 * passed to the engine as a query parameter — so a blocked domain stays blocked
 * even when the upstream ignores its own filter. That is worth knowing while
 * reading this form: the allow-list is a rule, not a request.
 */
export default function SearchSettingsScreen() {
  const { settings, loading, error, reload, refresh, refreshing } = useAiSettings();

  const [picking, setPicking] = useState<'default' | 'fallback' | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [health, setHealth] = useState<{ id: string; result: SearchHealth } | null>(null);
  const [adding, setAdding] = useState(false);
  const [newProvider, setNewProvider] = useState({ id: '', name: '', baseUrl: '', kind: 'searxng' as const });
  const [busy, setBusy] = useState(false);

  const savePolicy = useCallback(
    async (patch: Record<string, unknown>) => {
      setBusy(true);
      try {
        await updateSearchSettings(patch);
        await reload();
      } finally {
        setBusy(false);
      }
    },
    [reload],
  );

  const runTest = useCallback(async (id: string) => {
    setBusy(true);
    try {
      setHealth({ id, result: await testSearchProvider(id) });
    } catch (cause) {
      setHealth({
        id,
        result: {
          status: 'error',
          message: cause instanceof Error ? cause.message : 'The test could not run.',
        },
      });
    } finally {
      setBusy(false);
    }
  }, []);

  const providers = settings?.search.providers ?? [];
  const custom = new Set((settings?.search.customProviders ?? []).map((entry) => entry.id));
  const editingProvider = providers.find((provider) => provider.id === editing) ?? null;

  return (
    <SettingsScreen
      title="Search"
      subtitle={settings?.search.defaultProviderId ?? 'No default engine'}
      loading={loading}
      error={error}
      onRetry={reload}
      onRefresh={refresh}
      refreshing={refreshing}>
      <SettingsIntro
        icon="info"
        text="Agents call one tool, web_search. Which engine answers it is decided here, and the fallback is used only when the default fails."
      />

      <SettingsGroup title="Engines">
        {providers.map((provider, index) => (
          <SettingsRow
            key={provider.id}
            first={index === 0}
            icon="search"
            title={provider.name}
            detail={
              provider.configured
                ? provider.enabled
                  ? 'Enabled'
                  : 'Configured, turned off'
                : provider.capabilities.requiresApiKey
                  ? 'Needs an API key'
                  : 'Needs a base URL'
            }
            status={provider.enabled && provider.configured ? 'ok' : provider.configured ? 'warning' : 'muted'}
            value={custom.has(provider.id) ? 'Custom' : undefined}
            onPress={() => {
              setEditing(provider.id);
              setApiKey('');
              setBaseUrl(provider.baseUrl ?? '');
            }}
          />
        ))}
      </SettingsGroup>

      <SettingsGroup title="Routing">
        <SettingsRow
          first
          title="Default engine"
          value={settings?.search.defaultProviderId ?? 'None'}
          status={settings?.search.defaultProviderId ? 'ok' : 'warning'}
          onPress={() => setPicking('default')}
        />
        <SettingsRow
          title="Fallback engine"
          value={settings?.search.fallbackProviderId ?? 'None'}
          detail="Tried when the default fails"
          onPress={() => setPicking('fallback')}
        />
        <SettingsRow
          title="Depth"
          value={settings?.search.depth === 'advanced' ? 'Advanced' : 'Basic'}
          detail="Advanced asks engines that support it for deeper retrieval"
          onPress={() =>
            void savePolicy({ depth: settings?.search.depth === 'advanced' ? 'basic' : 'advanced' })
          }
        />
        <SettingsSwitch
          title="Safe search"
          detail="Where the engine supports it"
          value={settings?.search.safeSearch ?? true}
          onChange={(next) => void savePolicy({ safeSearch: next })}
        />
      </SettingsGroup>

      {settings ? (
        <PolicyForm
          key={policyKey(settings.search)}
          search={settings.search}
          busy={busy}
          onSave={savePolicy}
        />
      ) : null}

      <SettingsGroup footer="A SearXNG instance keeps every query inside your own infrastructure. A REST endpoint is any JSON search API returning titles and URLs.">
        <SettingsButton first label="Add a search engine" onPress={() => setAdding(true)} />
      </SettingsGroup>

      {health ? (
        <ResultBanner
          tone={health.result.status === 'ok' ? 'ok' : health.result.status === 'rate_limited' ? 'warning' : 'error'}
          title={`${health.id}: ${health.result.status === 'ok' ? 'working' : health.result.status.replace(/_/g, ' ')}`}
          detail={health.result.message}
        />
      ) : null}

      <Menu
        visible={picking !== null}
        onClose={() => setPicking(null)}
        title={picking === 'fallback' ? 'Fallback engine' : 'Default engine'}>
        {providers
          .filter((provider) => provider.enabled)
          .map((provider) => (
            <MenuItem
              key={provider.id}
              icon="search"
              label={provider.name}
              onPress={() => {
                const key = picking === 'fallback' ? 'fallbackProviderId' : 'defaultProviderId';
                setPicking(null);
                void savePolicy({ [key]: provider.id });
              }}
            />
          ))}
        {providers.filter((provider) => provider.enabled).length === 0 ? (
          <MenuItem
            label="No engine is enabled"
            detail="Configure one above first"
            onPress={() => setPicking(null)}
          />
        ) : null}
      </Menu>

      <Menu
        visible={editingProvider !== null}
        onClose={() => setEditing(null)}
        title={editingProvider?.name}>
        <View style={{ paddingBottom: 8 }}>
          <SettingsSwitch
            first
            title="Enabled"
            value={editingProvider?.enabled ?? false}
            onChange={(next) =>
              void updateSearchProvider(editingProvider!.id, { enabled: next }).then(reload)
            }
          />
          {editingProvider?.capabilities.requiresApiKey ? (
            <SettingsField
              label="API key"
              value={apiKey}
              onChange={setApiKey}
              secure
              placeholder={editingProvider.apiKeyPreview ?? 'Not set'}
            />
          ) : null}
          {editingProvider?.capabilities.requiresBaseUrl ? (
            <SettingsField label="Base URL" value={baseUrl} onChange={setBaseUrl} keyboardType="url" />
          ) : null}
          <SettingsButton
            label="Save"
            busy={busy}
            onPress={() =>
              void updateSearchProvider(editingProvider!.id, {
                ...(apiKey ? { apiKey } : {}),
                ...(baseUrl ? { baseUrl } : {}),
              })
                .then(reload)
                .then(() => setApiKey(''))
            }
          />
          <SettingsButton
            label="Test search"
            busy={busy}
            onPress={() => {
              const id = editingProvider!.id;
              setEditing(null);
              void runTest(id);
            }}
          />
          {editingProvider && custom.has(editingProvider.id) ? (
            <SettingsButton
              tone="danger"
              label="Remove"
              onPress={() => {
                const id = editingProvider.id;
                setEditing(null);
                void removeSearchProvider(id).then(reload);
              }}
            />
          ) : null}
        </View>
      </Menu>

      <Menu visible={adding} onClose={() => setAdding(false)} title="Add a search engine">
        <View style={{ paddingBottom: 8 }}>
          <SettingsField
            first
            label="Name"
            value={newProvider.name}
            onChange={(value) => setNewProvider((current) => ({ ...current, name: value }))}
            placeholder="My SearXNG"
            autoCapitalize="sentences"
          />
          <SettingsField
            label="Id"
            value={newProvider.id}
            onChange={(value) => setNewProvider((current) => ({ ...current, id: value }))}
            placeholder="my-searxng"
          />
          <SettingsField
            label="Base URL"
            value={newProvider.baseUrl}
            onChange={(value) => setNewProvider((current) => ({ ...current, baseUrl: value }))}
            placeholder="https://searx.example.com"
            keyboardType="url"
          />
          <SettingsButton
            label="Add engine"
            busy={busy}
            onPress={() => {
              const id = newProvider.id.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
              if (!id || !newProvider.name.trim() || !newProvider.baseUrl.trim()) return;
              setBusy(true);
              void addSearchProvider({
                id,
                name: newProvider.name.trim(),
                kind: newProvider.kind,
                baseUrl: newProvider.baseUrl.trim(),
              })
                .then(reload)
                .then(() => {
                  setAdding(false);
                  setNewProvider({ id: '', name: '', baseUrl: '', kind: 'searxng' });
                })
                .finally(() => setBusy(false));
            }}
          />
        </View>
      </Menu>
    </SettingsScreen>
  );
}

/**
 * The policy fields, keyed by their stored values.
 *
 * Seeding a form from asynchronously-loaded settings is the one place a
 * `useState` initialiser cannot help, so the parent gives this component a key
 * derived from those values: a save re-keys it and the fields re-seed, without
 * an effect that writes state on every settings change.
 */
function PolicyForm({
  search,
  busy,
  onSave,
}: {
  search: AiSettings['search'];
  busy: boolean;
  onSave: (patch: Record<string, unknown>) => Promise<void>;
}) {
  const [maxResults, setMaxResults] = useState(String(search.maxResults));
  const [recencyDays, setRecencyDays] = useState(
    search.recencyDays ? String(search.recencyDays) : '',
  );
  const [timeoutMs, setTimeoutMs] = useState(String(search.timeoutMs));
  const [allowed, setAllowed] = useState(search.allowedDomains.join(', '));
  const [blocked, setBlocked] = useState(search.blockedDomains.join(', '));

  return (
    <SettingsGroup
      title="Policy"
      footer="Applied to every result after the engine answers, so an engine that ignores its own filters cannot bypass it.">
      <SettingsField
        first
        label="Max results"
        value={maxResults}
        onChange={setMaxResults}
        keyboardType="numeric"
      />
      <SettingsField
        label="Recency (days)"
        value={recencyDays}
        onChange={setRecencyDays}
        keyboardType="numeric"
        help="Leave empty to allow results of any age."
      />
      <SettingsField
        label="Timeout (ms)"
        value={timeoutMs}
        onChange={setTimeoutMs}
        keyboardType="numeric"
      />
      <SettingsField
        label="Allowed"
        value={allowed}
        onChange={setAllowed}
        placeholder="reuters.com, sec.gov"
        help="When set, only these domains may be returned or opened."
      />
      <SettingsField label="Blocked" value={blocked} onChange={setBlocked} placeholder="example.com" />
      <SettingsButton
        label="Save policy"
        busy={busy}
        onPress={() =>
          void onSave({
            maxResults: Number.parseInt(maxResults, 10) || undefined,
            recencyDays: recencyDays ? Number.parseInt(recencyDays, 10) : undefined,
            timeoutMs: Number.parseInt(timeoutMs, 10) || undefined,
            allowedDomains: splitDomains(allowed),
            blockedDomains: splitDomains(blocked),
          })
        }
      />
    </SettingsGroup>
  );
}

function policyKey(search: AiSettings['search']): string {
  return [
    search.maxResults,
    search.recencyDays ?? '',
    search.timeoutMs,
    search.allowedDomains.join('|'),
    search.blockedDomains.join('|'),
  ].join(':');
}

function splitDomains(value: string): string[] {
  return value
    .split(/[,\s]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}
