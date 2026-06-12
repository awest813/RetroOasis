/**
 * profileCloudSync.ts — Opt-in profile index backup via save-sync providers.
 */

import { getCloudSaveManager } from "./cloudSaveSingleton.js";
import { PROFILE_INDEX_STORAGE_KEY } from "./profileManager.js";

const PROFILE_CLOUD_RELATIVE_PATH = "_retrooasis/profiles/v1/index.json";
const PROFILE_GDRIVE_FILE = "_retrooasis.profiles.v1.index.json";
const PROFILE_DROPBOX_PATH = "/retro-oasis/_profiles/v1/index.json";
const REQUEST_TIMEOUT_MS = 15_000;

const GDRIVE_API = "https://www.googleapis.com/drive/v3";
const GDRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const GDRIVE_SPACE = "appDataFolder";
const DROPBOX_CONTENT_API = "https://content.dropboxapi.com/2";

export type ProfileCloudSyncProvider = "webdav" | "nextcloud" | "gdrive" | "dropbox";

export type ProfileCloudSyncConfig =
  | { provider: "webdav" | "nextcloud"; baseUrl: string; username: string; password: string }
  | { provider: "gdrive"; accessToken: string }
  | { provider: "dropbox"; accessToken: string };

function buildBasicAuthHeader(username: string, password: string): string {
  return `Basic ${btoa(`${username}:${password}`)}`;
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

function profileCloudUrl(config: Extract<ProfileCloudSyncConfig, { provider: "webdav" | "nextcloud" }>): string {
  return `${normalizeBaseUrl(config.baseUrl)}/${PROFILE_CLOUD_RELATIVE_PATH}`;
}

async function timedFetch(url: string, init: RequestInit): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function ensureWebDavParentDirs(config: Extract<ProfileCloudSyncConfig, { provider: "webdav" | "nextcloud" }>): Promise<void> {
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

async function pushWebDav(config: Extract<ProfileCloudSyncConfig, { provider: "webdav" | "nextcloud" }>, payload: string): Promise<string | null> {
  await ensureWebDavParentDirs(config);
  const auth = buildBasicAuthHeader(config.username, config.password);
  const res = await timedFetch(profileCloudUrl(config), {
    method: "PUT",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: payload,
  });
  if (!res.ok) return `Cloud upload failed (${res.status}).`;
  return null;
}

async function pullWebDav(config: Extract<ProfileCloudSyncConfig, { provider: "webdav" | "nextcloud" }>): Promise<string | null> {
  const auth = buildBasicAuthHeader(config.username, config.password);
  const res = await timedFetch(profileCloudUrl(config), { headers: { Authorization: auth } });
  if (!res.ok) return null;
  return res.text();
}

async function findGDriveFileId(accessToken: string): Promise<string | null> {
  const q = encodeURIComponent(`name='${PROFILE_GDRIVE_FILE}' and trashed=false`);
  const res = await timedFetch(
    `${GDRIVE_API}/files?spaces=${GDRIVE_SPACE}&q=${q}&fields=files(id)`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) return null;
  const data = await res.json() as { files?: { id: string }[] };
  return data.files?.[0]?.id ?? null;
}

async function pushGDrive(config: Extract<ProfileCloudSyncConfig, { provider: "gdrive" }>, payload: string): Promise<string | null> {
  const headers = { Authorization: `Bearer ${config.accessToken}` };
  const blob = new Blob([payload], { type: "application/json" });
  const existingId = await findGDriveFileId(config.accessToken);
  if (existingId) {
    const res = await timedFetch(`${GDRIVE_UPLOAD}/files/${existingId}?uploadType=media`, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: blob,
    });
    if (!res.ok) return `Google Drive upload failed (${res.status}).`;
    return null;
  }
  const metadata = JSON.stringify({ name: PROFILE_GDRIVE_FILE, parents: [GDRIVE_SPACE] });
  const boundary = `rv_profile_${Math.random().toString(36).slice(2)}`;
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
    metadata,
    `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n`,
    blob,
    `\r\n--${boundary}--`,
  ]);
  const res = await timedFetch(`${GDRIVE_UPLOAD}/files?uploadType=multipart`, {
    method: "POST",
    headers: { ...headers, "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!res.ok) return `Google Drive upload failed (${res.status}).`;
  return null;
}

async function pullGDrive(config: Extract<ProfileCloudSyncConfig, { provider: "gdrive" }>): Promise<string | null> {
  const fileId = await findGDriveFileId(config.accessToken);
  if (!fileId) return null;
  const res = await timedFetch(`${GDRIVE_API}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${config.accessToken}` },
  });
  if (!res.ok) return null;
  return res.text();
}

async function pushDropbox(config: Extract<ProfileCloudSyncConfig, { provider: "dropbox" }>, payload: string): Promise<string | null> {
  const res = await timedFetch(`${DROPBOX_CONTENT_API}/files/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      "Content-Type": "application/octet-stream",
      "Dropbox-API-Arg": JSON.stringify({
        path: PROFILE_DROPBOX_PATH,
        mode: "overwrite",
        autorename: false,
        mute: true,
      }),
    },
    body: new Blob([payload], { type: "application/json" }),
  });
  if (!res.ok) return `Dropbox upload failed (${res.status}).`;
  return null;
}

async function pullDropbox(config: Extract<ProfileCloudSyncConfig, { provider: "dropbox" }>): Promise<string | null> {
  const res = await timedFetch(`${DROPBOX_CONTENT_API}/files/download`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      "Dropbox-API-Arg": JSON.stringify({ path: PROFILE_DROPBOX_PATH }),
    },
  });
  if (!res.ok) return null;
  return res.text();
}

/** Returns active save-sync config when profile backup is supported. */
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
  if (manager.providerId === "gdrive") {
    const c = manager.loadGDriveConfig();
    return c ? { provider: "gdrive", accessToken: c.accessToken } : null;
  }
  if (manager.providerId === "dropbox") {
    const c = manager.loadDropboxConfig();
    return c ? { provider: "dropbox", accessToken: c.accessToken } : null;
  }
  return null;
}

export function canSyncProfilesViaCloudSave(): boolean {
  return getProfileCloudSyncConfig() !== null;
}

export function profileCloudSyncProviderLabel(config: ProfileCloudSyncConfig | null): string {
  if (!config) return "save sync";
  switch (config.provider) {
    case "webdav": return "WebDAV";
    case "nextcloud": return "Nextcloud";
    case "gdrive": return "Google Drive";
    case "dropbox": return "Dropbox";
    default: return "save sync";
  }
}

export function readLocalProfileIndexRaw(storage?: Storage): string | null {
  try {
    const ls = storage ?? (typeof localStorage !== "undefined" ? localStorage : null);
    return ls?.getItem(PROFILE_INDEX_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

/** Upload the local profile index JSON to the connected save-sync provider. */
export async function pushProfileIndexToCloud(rawIndex?: string | null): Promise<string | null> {
  const config = getProfileCloudSyncConfig();
  if (!config) return "Save sync must be connected (WebDAV, Nextcloud, Google Drive, or Dropbox).";
  const payload = rawIndex ?? readLocalProfileIndexRaw();
  if (!payload) return "No local profile index to upload.";
  switch (config.provider) {
    case "webdav":
    case "nextcloud":
      return pushWebDav(config, payload);
    case "gdrive":
      return pushGDrive(config, payload);
    case "dropbox":
      return pushDropbox(config, payload);
    default:
      return "Save sync provider does not support profile backup.";
  }
}

/** Download the remote profile index JSON from save-sync storage. */
export async function pullProfileIndexFromCloud(): Promise<string | null> {
  const config = getProfileCloudSyncConfig();
  if (!config) return null;
  switch (config.provider) {
    case "webdav":
    case "nextcloud":
      return pullWebDav(config);
    case "gdrive":
      return pullGDrive(config);
    case "dropbox":
      return pullDropbox(config);
    default:
      return null;
  }
}
