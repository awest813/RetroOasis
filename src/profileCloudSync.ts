/**
 * profileCloudSync.ts — Opt-in profile index backup via save-sync WebDAV/Nextcloud.
 */

import { getCloudSaveManager } from "./cloudSaveSingleton.js";
import { PROFILE_INDEX_STORAGE_KEY } from "./profileManager.js";

const PROFILE_CLOUD_RELATIVE_PATH = "_retrooasis/profiles/v1/index.json";
const WEBDAV_TIMEOUT_MS = 15_000;

export type ProfileCloudSyncProvider = "webdav" | "nextcloud";

export interface ProfileCloudSyncConfig {
  provider: ProfileCloudSyncProvider;
  baseUrl: string;
  username: string;
  password: string;
}

function buildBasicAuthHeader(username: string, password: string): string {
  return `Basic ${btoa(`${username}:${password}`)}`;
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

function profileCloudUrl(config: ProfileCloudSyncConfig): string {
  return `${normalizeBaseUrl(config.baseUrl)}/${PROFILE_CLOUD_RELATIVE_PATH}`;
}

async function timedFetch(url: string, init: RequestInit): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), WEBDAV_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function ensureParentDirs(config: ProfileCloudSyncConfig): Promise<void> {
  const base = normalizeBaseUrl(config.baseUrl);
  const segments = PROFILE_CLOUD_RELATIVE_PATH.split("/").slice(0, -1);
  let current = base;
  const auth = buildBasicAuthHeader(config.username, config.password);
  for (const segment of segments) {
    current = `${current}/${segment}`;
    try {
      await timedFetch(current, { method: "MKCOL", headers: { Authorization: auth } });
    } catch { /* best effort */ }
  }
}

/** Returns active save-sync WebDAV/Nextcloud config when profiles can be synced. */
export function getProfileCloudSyncConfig(): ProfileCloudSyncConfig | null {
  const manager = getCloudSaveManager();
  if (!manager.isConnected()) return null;
  if (manager.providerId === "webdav") {
    const c = manager.loadWebDAVConfig();
    return c ? { provider: "webdav", baseUrl: c.url, username: c.username, password: c.password } : null;
  }
  if (manager.providerId === "nextcloud") {
    const c = manager.loadNextcloudConfig();
    return c ? { provider: "nextcloud", baseUrl: c.url, username: c.username, password: c.password } : null;
  }
  return null;
}

export function canSyncProfilesViaCloudSave(): boolean {
  return getProfileCloudSyncConfig() !== null;
}

export function readLocalProfileIndexRaw(storage?: Storage): string | null {
  try {
    const ls = storage ?? (typeof localStorage !== "undefined" ? localStorage : null);
    return ls?.getItem(PROFILE_INDEX_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

/** Upload the local profile index JSON to the connected WebDAV/Nextcloud folder. */
export async function pushProfileIndexToCloud(rawIndex?: string | null): Promise<string | null> {
  const config = getProfileCloudSyncConfig();
  if (!config) return "Save sync must be connected via WebDAV or Nextcloud.";
  const payload = rawIndex ?? readLocalProfileIndexRaw();
  if (!payload) return "No local profile index to upload.";
  await ensureParentDirs(config);
  const auth = buildBasicAuthHeader(config.username, config.password);
  const url = profileCloudUrl(config);
  const res = await timedFetch(url, {
    method: "PUT",
    headers: {
      Authorization: auth,
      "Content-Type": "application/json",
    },
    body: payload,
  });
  if (!res.ok) return `Cloud upload failed (${res.status}).`;
  return null;
}

/** Download the remote profile index JSON from save-sync storage. */
export async function pullProfileIndexFromCloud(): Promise<string | null> {
  const config = getProfileCloudSyncConfig();
  if (!config) return null;
  const auth = buildBasicAuthHeader(config.username, config.password);
  const res = await timedFetch(profileCloudUrl(config), { headers: { Authorization: auth } });
  if (!res.ok) return null;
  return res.text();
}
