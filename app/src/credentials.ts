import * as SecureStore from 'expo-secure-store';

export type Credentials = { url: string; token: string };

const URL_KEY = 'babomap.url';
const TOKEN_KEY = 'babomap.token';

// AFTER_FIRST_UNLOCK: the background task must read the token while the
// phone is locked. The default (WHEN_UNLOCKED) would fail every upload that
// happens with the screen off.
const opts: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

export async function loadCredentials(): Promise<Credentials | null> {
  const [url, token] = await Promise.all([
    SecureStore.getItemAsync(URL_KEY),
    SecureStore.getItemAsync(TOKEN_KEY),
  ]);
  return url && token ? { url, token } : null;
}

export async function saveCredentials(c: Credentials): Promise<void> {
  await SecureStore.setItemAsync(URL_KEY, c.url, opts);
  await SecureStore.setItemAsync(TOKEN_KEY, c.token, opts);
}

export async function clearCredentials(): Promise<void> {
  await SecureStore.deleteItemAsync(URL_KEY);
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

/**
 * The setup QR encodes {"url": "...", "token": "..."} (see backend
 * scripts/token.sh). A bare token is accepted too, with the URL typed by hand.
 */
export function parseSetupPayload(text: string, fallbackUrl?: string): Credentials | null {
  const t = text.trim();
  try {
    const o = JSON.parse(t) as { url?: unknown; token?: unknown };
    if (typeof o.url === 'string' && typeof o.token === 'string') {
      return normalize({ url: o.url, token: o.token });
    }
  } catch {
    // not JSON; fall through
  }
  if (/^[A-Za-z0-9_-]{32,}$/.test(t) && fallbackUrl) {
    return normalize({ url: fallbackUrl, token: t });
  }
  return null;
}

function normalize(c: Credentials): Credentials | null {
  const url = c.url.trim().replace(/\/+$/, '');
  if (!/^https?:\/\/\S+$/.test(url)) return null;
  const token = c.token.trim();
  if (token.length < 32) return null;
  return { url, token };
}
