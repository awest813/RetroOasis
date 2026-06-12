/**
 * profileSnapshot.ts — Export / import bundles of cloud connections and API keys.
 *
 * This is the first step toward a full profile system. See docs/PROFILE_SYSTEM_PLAN.md.
 */

import type { Settings, CloudLibraryConnection } from "./types/settings.js";
import type { ApiKeyStore } from "./apiKeyStore.js";
import { getCloudSaveManager } from "./cloudSaveSingleton.js";
import { getGoogleClientId, getDropboxAppKey } from "./oauthPopup.js";
import {
  pickDisplayPrefs,
  displayPrefsToSettingsPatch,
  parseDisplayPrefs,
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
  settingsSubset: {
    libretroMatchingServerUrl: string;
    netplayUsername: string;
    profileLibraryFilter: boolean;
    /** Display / performance prefs (optional in older exports). */
    displayPrefs?: ProfileDisplayPrefs;
  };
}

export interface BuildProfileSnapshotOpts {
  name?: string;
  settings: Settings;
  apiKeyStore: ApiKeyStore;
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
    settingsSubset: {
      libretroMatchingServerUrl: settings.libretroMatchingServerUrl,
      netplayUsername: settings.netplayUsername,
      profileLibraryFilter: settings.profileLibraryFilter,
      displayPrefs: pickDisplayPrefs(settings),
    },
  };
}

export function serializeProfileSnapshot(snapshot: ProfileSnapshotV1): string {
  return JSON.stringify(snapshot, null, 2);
}

export function parseProfileSnapshot(raw: string): ProfileSnapshotV1 | string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return "Profile file is not valid JSON.";
  }
  if (!parsed || typeof parsed !== "object") return "Profile file is empty or malformed.";
  const rec = parsed as Record<string, unknown>;
  if (rec.version !== PROFILE_SNAPSHOT_VERSION) {
    return `Unsupported profile version: ${String(rec.version)}`;
  }
  if (!Array.isArray(rec.cloudLibraries)) return "Profile is missing cloud library connections.";
  if (!rec.apiKeys || typeof rec.apiKeys !== "object") return "Profile is missing API key data.";
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
  if (typeof subsetRec.profileLibraryFilter !== "boolean") {
    (subsetRec as { profileLibraryFilter?: boolean }).profileLibraryFilter = false;
  }
  const cloudSave = rec.cloudSave;
  if (!cloudSave || typeof cloudSave !== "object") return "Profile is missing save-sync metadata.";
  return rec as ProfileSnapshotV1;
}

export interface ApplyProfileSnapshotResult {
  settingsPatch: Partial<Settings>;
  apiKeyUpdates: Array<{ providerId: string; key: string; enabled: boolean }>;
  oauth: ProfileSnapshotV1["oauth"];
  cloudSaveHint: ProfileSnapshotV1["cloudSave"];
  cloudSaveStorage?: Record<string, string>;
}

/**
 * Turn a parsed snapshot into patches the settings UI can apply.
 * Cloud-save credentials still live in provider-specific localStorage keys;
 * reconnect save sync manually after import (see PROFILE_SYSTEM_PLAN.md).
 */
export function applyProfileSnapshot(snapshot: ProfileSnapshotV1): ApplyProfileSnapshotResult {
  const apiKeyUpdates: ApplyProfileSnapshotResult["apiKeyUpdates"] = [];
  for (const [providerId, state] of Object.entries(snapshot.apiKeys)) {
    if (!state?.key) continue;
    apiKeyUpdates.push({
      providerId,
      key: state.key,
      enabled: state.enabled !== false,
    });
  }

  return {
    settingsPatch: {
      cloudLibraries: structuredClone(snapshot.cloudLibraries),
      libretroMatchingServerUrl: snapshot.settingsSubset.libretroMatchingServerUrl ?? "",
      netplayUsername: snapshot.settingsSubset.netplayUsername ?? "",
      profileLibraryFilter: snapshot.settingsSubset.profileLibraryFilter ?? false,
      ...displayPrefsToSettingsPatch(parseDisplayPrefs(snapshot.settingsSubset.displayPrefs)),
    },
    apiKeyUpdates,
    oauth: snapshot.oauth,
    cloudSaveHint: snapshot.cloudSave,
    cloudSaveStorage: snapshot.cloudSaveStorage,
  };
}
