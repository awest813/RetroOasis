/**
 * cloudAuth.ts — Shared cloud authentication helpers used by both
 * cloudSave.ts and cloudLibrary.ts providers.
 *
 * Extracted to eliminate ~30 lines of duplicated Basic Auth construction
 * and the identical Blomp OpenStack Swift Auth v1 flow across the two modules.
 */

// ── HTTP Basic Auth ───────────────────────────────────────────────────────────

/**
 * Build a standard HTTP Basic Auth header value from a username and password.
 *
 * Encodes the credentials as UTF-8 bytes before base64 so non-ASCII characters
 * in usernames or passwords are transmitted correctly.
 *
 * The iterative String.fromCharCode() loop avoids the argument-count limit
 * that String.fromCharCode.apply() hits with large arrays on older engines.
 */
export function buildBasicAuthHeader(username: string, password: string): string {
  const credentials = `${username}:${password}`;
  const utf8Bytes   = new TextEncoder().encode(credentials);
  let binary = "";
  for (let i = 0; i < utf8Bytes.length; i++) {
    binary += String.fromCharCode(utf8Bytes[i]!);
  }
  return "Basic " + btoa(binary);
}

// ── Blomp OpenStack Swift Auth v1 ────────────────────────────────────────────

const BLOMP_AUTH_URL = "https://authenticate.blomp.com/v1/auth";

export interface BlompAuthResult {
  token: string;
  storageUrl: string;
}

/**
 * Authenticate against Blomp's OpenStack Swift Auth v1 endpoint.
 *
 * Sends X-Auth-User / X-Auth-Key headers and reads X-Auth-Token /
 * X-Storage-Url from the response.
 *
 * @returns The auth token + storage URL on success, null otherwise.
 */
export async function blompAuthenticate(
  username: string,
  password: string,
  signal?: AbortSignal,
): Promise<BlompAuthResult | null> {
  try {
    const r = await fetch(BLOMP_AUTH_URL, {
      method:  "GET",
      headers: { "X-Auth-User": username, "X-Auth-Key": password },
      signal,
    });
    if (!r.ok) return null;
    const token      = r.headers.get("X-Auth-Token");
    const storageUrl = r.headers.get("X-Storage-Url");
    if (!token || !storageUrl) return null;
    return { token, storageUrl };
  } catch {
    return null;
  }
}

// ── OAuth client ID storage (migrated from legacy naming) ────────────────────

/**
 * Helper that reads a value with fallback from an old namespace key to a
 * new namespace key, and cleans up the old key on write.
 *
 * @param newKey  Preferred localStorage key.
 * @param oldKey  Legacy key to fall back to on read and remove on write.
 */
function _getWithMigration(newKey: string, oldKey: string): string | null {
  try {
    const val = localStorage.getItem(newKey);
    if (val) return val;
    const legacy = localStorage.getItem(oldKey);
    if (legacy) {
      // Migrate: write to new key, remove old key
      try {
        localStorage.setItem(newKey, legacy);
        localStorage.removeItem(oldKey);
      } catch { /* non-fatal */ }
      return legacy;
    }
    return null;
  } catch {
    return null;
  }
}

function _setAndCleanOld(newKey: string, oldKey: string, value: string): void {
  try {
    localStorage.setItem(newKey, value);
    try { localStorage.removeItem(oldKey); } catch { /* non-fatal */ }
  } catch { /* quota exceeded or private-browsing restriction */ }
}

// These are the legacy key constants from the old oauthPopup.ts naming prior to
// standardisation on the "retro-oasis-*" namespace prefix.
const LEGACY_GOOGLE_CLIENT_ID_KEY = "retrooasis_google_client_id";
const LEGACY_DROPBOX_APP_KEY_KEY  = "retrooasis_dropbox_app_key";

/** Current (standardised) localStorage keys for OAuth client IDs. */
export const GOOGLE_CLIENT_ID_KEY = "retro-oasis-google-client-id";
export const DROPBOX_APP_KEY_KEY  = "retro-oasis-dropbox-app-key";

export function isGoogleOAuthConfigured(): boolean {
  try {
    const id = localStorage.getItem(GOOGLE_CLIENT_ID_KEY)
            ?? localStorage.getItem(LEGACY_GOOGLE_CLIENT_ID_KEY);
    return !!id && id.trim().length > 0;
  } catch { return false; }
}

export function isDropboxOAuthConfigured(): boolean {
  try {
    const key = localStorage.getItem(DROPBOX_APP_KEY_KEY)
             ?? localStorage.getItem(LEGACY_DROPBOX_APP_KEY_KEY);
    return !!key && key.trim().length > 0;
  } catch { return false; }
}

export function setGoogleClientId(clientId: string): void {
  _setAndCleanOld(GOOGLE_CLIENT_ID_KEY, LEGACY_GOOGLE_CLIENT_ID_KEY, clientId.trim());
}

export function setDropboxAppKey(appKey: string): void {
  _setAndCleanOld(DROPBOX_APP_KEY_KEY, LEGACY_DROPBOX_APP_KEY_KEY, appKey.trim());
}

export function getGoogleClientId(): string {
  return _getWithMigration(GOOGLE_CLIENT_ID_KEY, LEGACY_GOOGLE_CLIENT_ID_KEY)?.trim() ?? "";
}

export function getDropboxAppKey(): string {
  return _getWithMigration(DROPBOX_APP_KEY_KEY, LEGACY_DROPBOX_APP_KEY_KEY)?.trim() ?? "";
}
