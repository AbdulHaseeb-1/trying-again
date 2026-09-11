/**
 * The web build's token store.
 *
 * `expo-secure-store` has no web implementation, so this is the honest
 * substitute: `localStorage`, which is origin-scoped and survives a reload.
 * It is weaker than a keychain, and it is the strongest thing a browser offers
 * for a credential the page itself must read.
 *
 * Every accessor is guarded: `localStorage` throws in a sandboxed iframe and in
 * some private-browsing modes, and an agent panel that cannot remember a token
 * should register again, not crash the app.
 */
const KEY = 'marketpulse.agent.deviceToken';
const DEVICE_KEY = 'marketpulse.agent.deviceId';

function read(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // Session-only is an acceptable degradation here.
  }
}

export async function readToken(): Promise<string | null> {
  return read(KEY);
}

export async function writeToken(token: string): Promise<void> {
  write(KEY, token);
}

export async function clearToken(): Promise<void> {
  try {
    globalThis.localStorage?.removeItem(KEY);
  } catch {
    // Nothing to do.
  }
}

export async function readDeviceId(): Promise<string | null> {
  return read(DEVICE_KEY);
}

export async function writeDeviceId(deviceId: string): Promise<void> {
  write(DEVICE_KEY, deviceId);
}
