/**
 * profileSnapshot.ts — Export / import bundles of cloud connections and API keys.
 *
 * This is the first step toward a full profile system. See docs/PROFILE_SYSTEM_PLAN.md.
 */

import type { Settings, CloudLibraryConnection, CloudProviderId } from "./types/settings.js";
import type { ApiKeyStore } from "./apiKeyStore.js";
import { getCloudSaveManager } from "./cloudSaveSingleton.js";
import { getGoogleClientId, getDropboxAppKey } from "./oauthPopup.js";
import { parseCloudLibraryConnectionConfig } from "./cloudLibrary.js";
import { isValidProfileColor } from "./profileColors.js";
import { getTaggedGameIds, sanitizeLibraryGameIds } from "./profileGameTags.js";
import {
  pickDisplayPrefs,
  displayPrefsToSettingsPatch,
  resolveDisplayPrefs,
  type ProfileDisplayPrefs,
} from "./profileDisplayPrefs.js";

export const PROFILE_SNAPSHOT_VERSION = 1 as const;

/** localStorage keys used by CloudSaveManager credential persistence. */
export const CLOUD_SAVE_STORAGE_KEYS = [
  "retro-oasis-cloud",
  "retro-oasis-cloud-webdav",
  "retro-oasis-cloud-gdrive",
  "retro-oasis-cloud-dropbox",
  "retro-oasis-cloud-pcloud",
  "retro-oasis-cloud-blomp",
  "retro-oasis-cloud-box",
  "retro-oasis-cloud-onedrive",
  "retro-oasis-cloud-mega",
  "retro-oasis-cloud-nextcloud",
] as const;

function readCloudSaveStorage(): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof localStorage === "undefined") return out;
  for (const key of CLOUD_SAVE_STORAGE_KEYS) {
    try {
      const value = localStorage.getItem(key);
      if (value) out[key] = value;
    } catch { /* ignore */ }
  }
  return out;
}

/** Remove all persisted CloudSaveManager credential keys. */
export function clearCloudSaveStorage(): void {
  if (typeof localStorage === "undefined") return;
  for (const key of CLOUD_SAVE_STORAGE_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch { /* ignore */ }
  }
}

export function restoreCloudSaveStorage(storage: Record<string, string> | undefined): void {
  clearCloudSaveStorage();
  if (!storage || typeof localStorage === "undefined") return;
  for (const key of CLOUD_SAVE_STORAGE_KEYS) {
    const value = storage[key];
    if (typeof value !== "string") continue;
    try {
      localStorage.setItem(key, value);
    } catch { /* ignore */ }
  }
}

/** Replace API key store contents with snapshot keys; removes providers absent from the snapshot. */
export function syncApiKeyStoreFromSnapshot(
  apiKeyStore: ApiKeyStore,
  snapshot: ProfileSnapshotV1,
): void {
  for (const provider of apiKeyStore.listProviders()) {
    const entry = snapshot.apiKeys[provider.id];
    if (entry?.key) {
      apiKeyStore.setKey(provider.id, entry.key);
      apiKeyStore.setEnabled(provider.id, entry.enabled !== false);
    } else {
      apiKeyStore.removeKey(provider.id);
    }
  }
}

export interface ProfileSnapshotV1 {
  version: typeof PROFILE_SNAPSHOT_VERSION;
  name: string;
  exportedAt: number;
  cloudLibraries: CloudLibraryConnection[];
  apiKeys: Record<string, { key: string; enabled: boolean }>;
  oauth: {
    googleClientId: string;
    dropboxAppKey: string;
  };
  cloudSave: {
    providerId: string;
    connected: boolean;
  };
  /** Raw CloudSaveManager localStorage credential blobs (optional in older exports). */
  cloudSaveStorage?: Record<string, string>;
  /** Library game ids tagged to this profile (optional; for portable library filter). */
  libraryGameIds?: string[];
  settingsSubset: {
    libretroMatchingServerUrl: string;
    netplayEnabled: boolean;
    netplayServerUrl: string;
    netplayUsername: string;
    netplayIceServers: Settings["netplayIceServers"];
    profileLibraryFilter: boolean;
    /** Display / performance prefs (optional in older exports). */
    displayPrefs?: ProfileDisplayPrefs;
  };
}

export interface BuildProfileSnapshotOpts {
  name?: string;
  settings: Settings;
  apiKeyStore: ApiKeyStore;
  /** When set, includes tagged library game ids for this profile slot. */
  profileId?: string;
}

/** Collect a portable snapshot of keys and cloud configuration from this browser. */
export function buildProfileSnapshot(opts: BuildProfileSnapshotOpts): ProfileSnapshotV1 {
  const { settings, apiKeyStore } = opts;
  const cloudManager = getCloudSaveManager();

  const apiKeys: ProfileSnapshotV1["apiKeys"] = {};
  for (const provider of apiKeyStore.listProviders()) {
    const state = apiKeyStore.getState(provider.id);
    if (state.key) {
      apiKeys[provider.id] = { key: state.key, enabled: state.enabled };
    }
  }

  const libraryGameIds = opts.profileId
    ? sanitizeLibraryGameIds([...getTaggedGameIds(opts.profileId)])
    : undefined;

  return {
    version: PROFILE_SNAPSHOT_VERSION,
    name: opts.name?.trim() || "My Profile",
    exportedAt: Date.now(),
    cloudLibraries: structuredClone(settings.cloudLibraries),
    apiKeys,
    oauth: {
      googleClientId: getGoogleClientId(),
      dropboxAppKey: getDropboxAppKey(),
    },
    cloudSave: {
      providerId: cloudManager.providerId,
      connected: cloudManager.isConnected(),
    },
    cloudSaveStorage: readCloudSaveStorage(),
    libraryGameIds,
    settingsSubset: {
      libretroMatchingServerUrl: settings.libretroMatchingServerUrl,
      netplayEnabled: settings.netplayEnabled,
      netplayServerUrl: settings.netplayServerUrl,
      netplayUsername: settings.netplayUsername,
      netplayIceServers: structuredClone(settings.netplayIceServers),
      profileLibraryFilter: settings.profileLibraryFilter,
      displayPrefs: pickDisplayPrefs(settings),
    },
  };
}

export function serializeProfileSnapshot(snapshot: ProfileSnapshotV1): string {
  return JSON.stringify(snapshot, null, 2);
}

const VALID_CLOUD_PROVIDERS = new Set<CloudProviderId>([
  "gdrive", "dropbox", "onedrive", "pcloud", "webdav", "blomp", "box", "nextcloud", "mega",
]);

export function sanitizeCloudLibraries(raw: unknown): CloudLibraryConnection[] {
  if (!Array.isArray(raw)) return [];
  const out: CloudLibraryConnection[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    if (typeof rec.id !== "string" || !rec.id.trim()) continue;
    if (typeof rec.provider !== "string" || !VALID_CLOUD_PROVIDERS.has(rec.provider as CloudProviderId)) continue;
    if (typeof rec.name !== "string" || typeof rec.config !== "string") continue;
    if (parseCloudLibraryConnectionConfig(rec.config) === null) continue;
    out.push({
      id: rec.id.trim().slice(0, 128),
      provider: rec.provider as CloudProviderId,
      name: rec.name.trim().slice(0, 200) || rec.provider,
      enabled: rec.enabled !== false,
      config: rec.config,
    });
  }
  return out;
}

export function sanitizeApiKeys(raw: unknown): ProfileSnapshotV1["apiKeys"] {
  if (!raw || typeof raw !== "object") return {};
  const out: ProfileSnapshotV1["apiKeys"] = {};
  for (const [providerId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^[a-z0-9_-]{1,64}$/i.test(providerId)) continue;
    if (!value || typeof value !== "object") continue;
    const rec = value as Record<string, unknown>;
    if (typeof rec.key !== "string" || !rec.key) continue;
    out[providerId] = {
      key: rec.key.slice(0, 4096),
      enabled: rec.enabled !== false,
    };
  }
  return out;
}

export function sanitizeCloudSaveStorage(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const out: Record<string, string> = {};
  for (const key of CLOUD_SAVE_STORAGE_KEYS) {
    const value = (raw as Record<string, unknown>)[key];
    if (typeof value !== "string" || !value) continue;
    out[key] = value.slice(0, 65_536);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function sanitizeNetplayIceServers(raw: unknown): Settings["netplayIceServers"] {
  if (!Array.isArray(raw)) return [];
  const out: Settings["netplayIceServers"] = [];
  for (const item of raw.slice(0, 16)) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    let urls: string | string[] | undefined;
    if (typeof rec.urls === "string") {
      const trimmed = rec.urls.trim();
      if (trimmed) urls = trimmed.slice(0, 2048);
    } else if (Array.isArray(rec.urls)) {
      const list = rec.urls
        .filter((url): url is string => typeof url === "string" && url.trim().length > 0)
        .slice(0, 8)
        .map((url) => url.trim().slice(0, 2048));
      if (list.length > 0) urls = list;
    }
    if (!urls) continue;
    const server: Settings["netplayIceServers"][number] = { urls };
    if (typeof rec.username === "string") server.username = rec.username.slice(0, 512);
    if (typeof rec.credential === "string") server.credential = rec.credential.slice(0, 4096);
    out.push(server);
  }
  return out;
}

/** Normalize an already-parsed snapshot object (import / cloud index validation). */
export function normalizeProfileSnapshot(rec: Record<string, unknown>): ProfileSnapshotV1 | string {
  if (rec.version !== PROFILE_SNAPSHOT_VERSION) {
    return `Unsupported profile version: ${String(rec.version)}`;
  }
  const oauth = rec.oauth;
  if (!oauth || typeof oauth !== "object") return "Profile is missing OAuth app settings.";
  const oauthRec = oauth as Record<string, unknown>;
  if (typeof oauthRec.googleClientId !== "string" || typeof oauthRec.dropboxAppKey !== "string") {
    return "Profile OAuth settings are incomplete.";
  }
  const subset = rec.settingsSubset;
  if (!subset || typeof subset !== "object") return "Profile is missing settings subset.";
  const subsetRec = subset as Record<string, unknown>;
  if (typeof subsetRec.libretroMatchingServerUrl !== "string" || typeof subsetRec.netplayUsername !== "string") {
    return "Profile settings subset is incomplete.";
  }
  const cloudSave = rec.cloudSave;
  if (!cloudSave || typeof cloudSave !== "object") return "Profile is missing save-sync metadata.";
  const cloudSaveRec = cloudSave as Record<string, unknown>;
  const providerId = typeof cloudSaveRec.providerId === "string" ? cloudSaveRec.providerId.slice(0, 64) : "";
  const connected = cloudSaveRec.connected === true;

  const name = typeof rec.name === "string" ? rec.name.trim().slice(0, 120) || "Imported profile" : "Imported profile";
  const exportedAt = typeof rec.exportedAt === "number" && Number.isFinite(rec.exportedAt) ? rec.exportedAt : Date.now();

  return {
    version: PROFILE_SNAPSHOT_VERSION,
    name,
    exportedAt,
    cloudLibraries: sanitizeCloudLibraries(rec.cloudLibraries),
    apiKeys: sanitizeApiKeys(rec.apiKeys),
    oauth: {
      googleClientId: oauthRec.googleClientId.slice(0, 512),
      dropboxAppKey: oauthRec.dropboxAppKey.slice(0, 512),
    },
    cloudSave: { providerId, connected },
    cloudSaveStorage: sanitizeCloudSaveStorage(rec.cloudSaveStorage),
    libraryGameIds: sanitizeLibraryGameIds(rec.libraryGameIds),
    settingsSubset: {
      libretroMatchingServerUrl: subsetRec.libretroMatchingServerUrl.slice(0, 2048),
      netplayEnabled: subsetRec.netplayEnabled === true,
      netplayServerUrl: typeof subsetRec.netplayServerUrl === "string"
        ? subsetRec.netplayServerUrl.slice(0, 2048)
        : "",
      netplayUsername: subsetRec.netplayUsername.slice(0, 64),
      netplayIceServers: sanitizeNetplayIceServers(subsetRec.netplayIceServers),
      profileLibraryFilter: subsetRec.profileLibraryFilter === true,
      displayPrefs: resolveDisplayPrefs(subsetRec.displayPrefs),
    },
  };
}

export interface NormalizedStoredProfile {
  meta: {
    id: string;
    name: string;
    createdAt: number;
    updatedAt: number;
    color?: string;
  };
  snapshot: ProfileSnapshotV1;
}

/** Validate a profile index entry (meta + embedded snapshot). */
export function normalizeStoredProfileEntry(stored: unknown): NormalizedStoredProfile | null {
  if (!stored || typeof stored !== "object") return null;
  const rec = stored as Record<string, unknown>;
  const meta = rec.meta;
  if (!meta || typeof meta !== "object") return null;
  const metaRec = meta as Record<string, unknown>;
  if (typeof metaRec.id !== "string" || !metaRec.id.trim()) return null;
  if (typeof metaRec.name !== "string" || !metaRec.name.trim()) return null;
  const createdAt = typeof metaRec.createdAt === "number" && Number.isFinite(metaRec.createdAt)
    ? metaRec.createdAt
    : Date.now();
  const updatedAt = typeof metaRec.updatedAt === "number" && Number.isFinite(metaRec.updatedAt)
    ? metaRec.updatedAt
    : createdAt;
  const snapshotRaw = rec.snapshot;
  if (!snapshotRaw || typeof snapshotRaw !== "object") return null;
  const normalized = normalizeProfileSnapshot(snapshotRaw as Record<string, unknown>);
  if (typeof normalized === "string") return null;
  const profileMeta: NormalizedStoredProfile["meta"] = {
    id: metaRec.id.trim().slice(0, 128),
    name: metaRec.name.trim().slice(0, 120),
    createdAt,
    updatedAt,
  };
  if (typeof metaRec.color === "string" && isValidProfileColor(metaRec.color)) {
    profileMeta.color = metaRec.color;
  }
  return {
    meta: profileMeta,
    snapshot: { ...normalized, name: profileMeta.name },
  };
}

export function parseProfileSnapshot(raw: string): ProfileSnapshotV1 | string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return "Profile file is not valid JSON.";
  }
  if (!parsed || typeof parsed !== "object") return "Profile file is empty or malformed.";
  return normalizeProfileSnapshot(parsed as Record<string, unknown>);
}

export interface ApplyProfileSnapshotResult {
  settingsPatch: Partial<Settings>;
  oauth: ProfileSnapshotV1["oauth"];
}

/** Turn a parsed snapshot into patches the settings UI can apply. */
export function applyProfileSnapshot(snapshot: ProfileSnapshotV1): ApplyProfileSnapshotResult {
  const displayPrefs = resolveDisplayPrefs(snapshot.settingsSubset.displayPrefs);

  const cloudLibraries = Array.isArray(snapshot.cloudLibraries)
    ? snapshot.cloudLibraries
    : sanitizeCloudLibraries(snapshot.cloudLibraries);

  return {
    settingsPatch: {
      cloudLibraries: structuredClone(cloudLibraries),
      libretroMatchingServerUrl: snapshot.settingsSubset.libretroMatchingServerUrl ?? "",
      netplayEnabled: snapshot.settingsSubset.netplayEnabled ?? false,
      netplayServerUrl: snapshot.settingsSubset.netplayServerUrl ?? "",
      netplayUsername: snapshot.settingsSubset.netplayUsername ?? "",
      netplayIceServers: sanitizeNetplayIceServers(snapshot.settingsSubset.netplayIceServers),
      profileLibraryFilter: snapshot.settingsSubset.profileLibraryFilter ?? false,
      ...displayPrefsToSettingsPatch(displayPrefs),
    },
    oauth: snapshot.oauth,
  };
}
