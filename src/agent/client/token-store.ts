import * as SecureStore from 'expo-secure-store';

/**
 * Where the device token lives on a phone.
 *
 * The token is a session credential, so it belongs in the keychain/keystore
 * rather than in ordinary app storage. `expo-secure-store` is the supported way
 * to reach both, and the web build gets its own implementation next to this
 * file — the library does not support web, and pretending otherwise would fail
 * at runtime rather than at build time.
 */
const KEY = 'marketpulse.agent.deviceToken';
const DEVICE_KEY = 'marketpulse.agent.deviceId';

export async function readToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(KEY);
  } catch {
    return null;
  }
}

export async function writeToken(token: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEY, token);
  } catch {
    // A device without a usable keychain still works for this session; it just
    // registers again next launch.
  }
}

export async function clearToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch {
    // Nothing to do: the token is already unreachable.
  }
}

export async function readDeviceId(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(DEVICE_KEY);
  } catch {
    return null;
  }
}

export async function writeDeviceId(deviceId: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(DEVICE_KEY, deviceId);
  } catch {
    // As above.
  }
}
