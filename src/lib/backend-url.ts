import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';

/**
 * The backend's address, and the one setting that lets a device point
 * somewhere other than the build's compiled-in default.
 *
 * `EXPO_PUBLIC_CALENDAR_API_URL` (or localhost/10.0.2.2) is the *default* —
 * baked in at build time, same as it always was. What is new is a
 * device-local override on top of it: Settings → Backend can point one
 * install at a different host (a staging server, a LAN address that is not
 * the build default) without a rebuild. "Use default backend" is on unless
 * an override is stored, so nothing changes for anyone who never opens that
 * screen.
 */
const OVERRIDE_KEY = 'marketpulse.backend.url.override';

export const DEFAULT_BACKEND_URL =
  process.env.EXPO_PUBLIC_CALENDAR_API_URL ??
  // The Android emulator maps the host loopback to 10.0.2.2.
  (Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000');

/** Strips a trailing slash so `${url}${path}` never doubles one up. */
function normalize(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

let override: string | null = null;
let loaded = false;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

// `useSyncExternalStore` needs `getSnapshot` to return the *same* reference
// until something actually changes — a fresh object on every call reads as a
// change on every render and defeats the point of the hook.
type Snapshot = { url: string; isDefault: boolean };
let snapshot: Snapshot = computeSnapshot();

function computeSnapshot(): Snapshot {
  return { url: getBackendUrl(), isDefault: override === null };
}

function emit(): void {
  snapshot = computeSnapshot();
  listeners.forEach((listener) => listener());
}

/** Read the persisted override once, before anything renders it. */
export function loadBackendUrl(): Promise<void> {
  if (loaded) return Promise.resolve();
  loading ??= (async () => {
    try {
      override = await SecureStore.getItemAsync(OVERRIDE_KEY);
    } catch {
      override = null;
    } finally {
      loaded = true;
      loading = null;
      emit();
    }
  })();
  return loading;
}

/** The URL every request should be built against, right now. */
export function getBackendUrl(): string {
  return override ? normalize(override) : DEFAULT_BACKEND_URL;
}

export function isDefaultBackend(): boolean {
  return override === null;
}

/** `null` (or empty) switches back to the default backend. */
export async function setBackendUrl(url: string | null): Promise<void> {
  const next = url && url.trim() ? normalize(url) : null;
  override = next;
  try {
    if (next) await SecureStore.setItemAsync(OVERRIDE_KEY, next);
    else await SecureStore.deleteItemAsync(OVERRIDE_KEY);
  } catch {
    // Without a usable keychain the override still works for this session;
    // it just will not survive a relaunch.
  }
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Reactive read of the effective backend URL, for the settings screen. */
export function useBackendUrl(): Snapshot {
  return useSyncExternalStore(subscribe, () => snapshot);
}

// Kick the read off as soon as this module loads — every API client imports
// it before making its first request, so the override is very likely in
// place before anything actually goes over the network.
void loadBackendUrl();
