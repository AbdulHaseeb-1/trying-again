import { useCallback, useState } from 'react';
import { Linking } from 'react-native';
import { useRouter } from 'expo-router';

import { useAiSettings } from '@/agent/state/use-ai-settings';
import { resetAgentSession } from '@/agent/client/agent-api';
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
import { useAppTheme } from '@/hooks/use-theme';
import { DEFAULT_BACKEND_URL, setBackendUrl, useBackendUrl } from '@/lib/backend-url';

const APP_VERSION = '1.0.0';

/**
 * Settings, the root of it.
 *
 * One screen per concern, grouped the way iOS groups its own Settings app:
 * a caption, a card of rows, and — where a setting needs one — a footer
 * explaining the consequence rather than the mechanism. "AI & Agents" stays
 * its own multi-screen hub behind a single row here; everything else on this
 * page is small enough to live directly in its group.
 */
export default function SettingsHub() {
  const router = useRouter();
  const { fontScale, setFontScale } = useAppTheme();
  const { settings } = useAiSettings();
  const { url: backendUrl, isDefault: usingDefaultBackend } = useBackendUrl();

  const connected = settings?.providers.filter((provider) => provider.enabled && provider.configured) ?? [];

  return (
    <SettingsScreen title="Settings">
      <SettingsGroup title="Display">
        <FontSizeRow first value={fontScale} onChange={setFontScale} />
      </SettingsGroup>

      <SettingsGroup
        title="AI"
        footer="Providers, models, agents, search and permissions for the market assistant.">
        <SettingsRow
          first
          icon="sparkles"
          title="AI & Agents"
          detail={connected.length > 0 ? connected.map((provider) => provider.name).join(', ') : 'Not configured'}
          status={connected.length > 0 ? 'ok' : 'warning'}
          onPress={() => router.push('/settings/ai')}
        />
      </SettingsGroup>

      <BackendGroup url={backendUrl} usingDefault={usingDefaultBackend} />

      <SettingsGroup title="About">
        <SettingsRow first title="Version" value={APP_VERSION} accessory="none" />
        <SettingsRow
          icon="link"
          title="Source"
          detail="github.com/AbdulHaseeb-1/trying-again"
          onPress={() => void Linking.openURL('https://github.com/AbdulHaseeb-1/trying-again')}
        />
      </SettingsGroup>
    </SettingsScreen>
  );
}

const FONT_OPTIONS = [
  ['Compact', 0.9],
  ['Standard', 1],
  ['Large', 1.1],
] as const;

function FontSizeRow({
  first,
  value,
  onChange,
}: {
  first?: boolean;
  value: number;
  onChange: (scale: 0.9 | 1 | 1.1) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <SettingsRow
        first={first}
        title="Reading size"
        detail="Applies across the whole app"
        value={FONT_OPTIONS.find(([, scale]) => scale === value)?.[0] ?? 'Standard'}
        onPress={() => setOpen(true)}
      />
      <Menu visible={open} onClose={() => setOpen(false)} title="Reading size">
        {FONT_OPTIONS.map(([label, scale]) => (
          <MenuItem
            key={label}
            label={label}
            selected={scale === value}
            onPress={() => {
              setOpen(false);
              onChange(scale);
            }}
          />
        ))}
      </Menu>
    </>
  );
}

/**
 * Where the app gets its data.
 *
 * Off by default in the sense that nobody has to touch it: "Use default
 * backend" starts on, pointed at the build's compiled-in address. Turning it
 * off reveals a field for a different host — a staging server, a LAN address
 * that is not the build default — persisted on this device only.
 */
function BackendGroup({ url, usingDefault }: { url: string; usingDefault: boolean }) {
  const [draft, setDraft] = useState(usingDefault ? '' : url);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const applyOverride = useCallback(async (next: string | null) => {
    setBusy(true);
    setResult(null);
    try {
      await setBackendUrl(next);
      // A stored session token belongs to whichever backend issued it; a
      // different host would just reject it with 401 until relaunch.
      await resetAgentSession();
    } finally {
      setBusy(false);
    }
  }, []);

  const toggleDefault = useCallback(
    (useDefault: boolean) => {
      if (useDefault) {
        setDraft('');
        void applyOverride(null);
      }
      // Turning it off just reveals the field below; nothing is applied until Save.
    },
    [applyOverride],
  );

  const save = useCallback(async () => {
    if (!draft.trim()) return;
    await applyOverride(draft.trim());
    setResult({ ok: true, message: 'Saved. The app now points at this address.' });
  }, [applyOverride, draft]);

  return (
    <SettingsGroup
      title="Backend"
      footer={
        usingDefault
          ? `Using the default: ${DEFAULT_BACKEND_URL}`
          : 'Using a custom address on this device only.'
      }>
      <SettingsSwitch
        first
        title="Use default backend"
        detail="Off to point this device at a different address"
        value={usingDefault}
        onChange={toggleDefault}
        disabled={busy}
      />
      {!usingDefault ? (
        <>
          <SettingsField
            label="Backend URL"
            value={draft}
            onChange={setDraft}
            placeholder={DEFAULT_BACKEND_URL}
            keyboardType="url"
          />
          <SettingsButton label="Save" busy={busy} disabled={!draft.trim()} onPress={() => void save()} />
        </>
      ) : null}
      {result ? <ResultBanner tone={result.ok ? 'ok' : 'error'} title={result.message} /> : null}
    </SettingsGroup>
  );
}
