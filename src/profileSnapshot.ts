/**
 * profileSnapshot.ts — Export / import bundles of cloud connections and API keys.
 *
 * This is the first step toward a full profile system. See docs/PROFILE_SYSTEM_PLAN.md.
 */

import type { Settings, CloudLibraryConnection } from "./types/settings.js";
import type { ApiKeyStore } from "./apiKeyStore.js";
import { getCloudSaveManager } from "./cloudSaveSingleton.js";
import { getGoogleClientId, getDropboxAppKey } from "./oauthPopup.js";

export const PROFILE_SNAPSHOT_VERSION = 1 as const;

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
  settingsSubset: {
    libretroMatchingServerUrl: string;
    netplayUsername: string;
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
    settingsSubset: {
      libretroMatchingServerUrl: settings.libretroMatchingServerUrl,
      netplayUsername: settings.netplayUsername,
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
  return rec as ProfileSnapshotV1;
}

export interface ApplyProfileSnapshotResult {
  settingsPatch: Partial<Settings>;
  apiKeyUpdates: Array<{ providerId: string; key: string; enabled: boolean }>;
  oauth: ProfileSnapshotV1["oauth"];
  cloudSaveHint: ProfileSnapshotV1["cloudSave"];
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
    },
    apiKeyUpdates,
    oauth: snapshot.oauth,
    cloudSaveHint: snapshot.cloudSave,
  };
}
