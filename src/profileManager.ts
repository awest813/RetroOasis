/**
 * profileManager.ts — Named local profiles with switch + auto-save.
 *
 * See docs/PROFILE_SYSTEM_PLAN.md for the full roadmap.
 */

import type { Settings } from "./types/settings.js";
import type { ApiKeyStore } from "./apiKeyStore.js";
import { createUuid } from "./uuid.js";
import { LEGACY_EVENTS } from "./legacy.js";
import { getCloudSaveManager } from "./cloudSaveSingleton.js";
import {
  buildProfileSnapshot,
  applyProfileSnapshot,
  restoreCloudSaveStorage,
  syncApiKeyStoreFromSnapshot,
  type ProfileSnapshotV1,
} from "./profileSnapshot.js";
import { setGoogleClientId, setDropboxAppKey } from "./oauthPopup.js";

export const PROFILE_INDEX_STORAGE_KEY = "retro-oasis.profiles";
const AUTO_SAVE_DEBOUNCE_MS = 1500;

export interface ProfileMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

interface StoredProfile {
  meta: ProfileMeta;
  snapshot: ProfileSnapshotV1;
}

interface ProfileIndexV1 {
  version: 1;
  activeId: string;
  profiles: Record<string, StoredProfile>;
}

export interface ProfileApplyDeps {
  settings: Settings;
  apiKeyStore: ApiKeyStore;
  onSettingsChange: (patch: Partial<Settings>) => void;
}

function emptyIndex(): ProfileIndexV1 {
  return { version: 1, activeId: "", profiles: {} };
}

function getDefaultStorage(): Storage {
  try {
    if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  } catch { /* fall through */ }
  const memory = new Map<string, string>();
  return {
    getItem(key) { return memory.get(key) ?? null; },
    setItem(key, value) { memory.set(key, String(value)); },
    removeItem(key) { memory.delete(key); },
    clear() { memory.clear(); },
    get length() { return memory.size; },
    key(index) { return [...memory.keys()][index] ?? null; },
  } satisfies Storage;
}

export class ProfileManager {
  private readonly storage: Storage;
  private index: ProfileIndexV1 = emptyIndex();
  private autoSaveTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
  private switching = false;
  private initialized = false;

  constructor(storage?: Storage) {
    this.storage = storage ?? getDefaultStorage();
    this.load();
  }

  private load(): void {
    try {
      const raw = this.storage.getItem(PROFILE_INDEX_STORAGE_KEY);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return;
      const rec = parsed as ProfileIndexV1;
      if (rec.version !== 1 || !rec.profiles || typeof rec.profiles !== "object") return;
      this.index = {
        version: 1,
        activeId: typeof rec.activeId === "string" ? rec.activeId : "",
        profiles: rec.profiles,
      };
    } catch {
      this.index = emptyIndex();
    }
  }

  private persist(): void {
    try {
      this.storage.setItem(PROFILE_INDEX_STORAGE_KEY, JSON.stringify(this.index));
    } catch { /* quota */ }
  }

  /** Create a default profile from the current browser state on first run. */
  ensureInitialized(deps: ProfileApplyDeps): void {
    if (this.initialized) return;
    this.initialized = true;

    const hadProfiles = Object.keys(this.index.profiles).length > 0;

    if (!hadProfiles) {
      const id = createUuid();
      const now = Date.now();
      const snapshot = buildProfileSnapshot({ name: "Default", settings: deps.settings, apiKeyStore: deps.apiKeyStore });
      this.index.profiles[id] = {
        meta: { id, name: "Default", createdAt: now, updatedAt: now },
        snapshot,
      };
      this.index.activeId = id;
      this.persist();
      return;
    }

    if (!this.index.activeId || !this.index.profiles[this.index.activeId]) {
      const first = Object.keys(this.index.profiles)[0];
      if (first) this.index.activeId = first;
      this.persist();
    }

    const active = this.index.profiles[this.index.activeId];
    if (active) {
      this.switching = true;
      try {
        this.applySnapshot(active.snapshot, deps);
      } finally {
        this.switching = false;
      }
    }
  }

  listProfiles(): ProfileMeta[] {
    return Object.values(this.index.profiles)
      .map((p) => p.meta)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  getActiveProfileId(): string {
    return this.index.activeId;
  }

  getActiveProfileName(): string {
    return this.index.profiles[this.index.activeId]?.meta.name ?? "Profile";
  }

  saveActiveSnapshot(deps: ProfileApplyDeps): void {
    const active = this.index.profiles[this.index.activeId];
    if (!active) return;
    const name = active.meta.name;
    active.snapshot = buildProfileSnapshot({ name, settings: deps.settings, apiKeyStore: deps.apiKeyStore });
    active.meta.updatedAt = Date.now();
    this.persist();
  }

  scheduleAutoSave(deps: ProfileApplyDeps): void {
    if (this.switching || !this.index.activeId) return;
    if (this.autoSaveTimer !== null) globalThis.clearTimeout(this.autoSaveTimer);
    this.autoSaveTimer = globalThis.setTimeout(() => {
      this.autoSaveTimer = null;
      this.saveActiveSnapshot(deps);
    }, AUTO_SAVE_DEBOUNCE_MS);
  }

  createProfile(name: string, deps: ProfileApplyDeps): ProfileMeta {
    this.saveActiveSnapshot(deps);
    const id = createUuid();
    const now = Date.now();
    const trimmed = name.trim() || `Profile ${Object.keys(this.index.profiles).length + 1}`;
    const snapshot = buildProfileSnapshot({ name: trimmed, settings: deps.settings, apiKeyStore: deps.apiKeyStore });
    const meta: ProfileMeta = { id, name: trimmed, createdAt: now, updatedAt: now };
    this.index.profiles[id] = { meta, snapshot };
    this.index.activeId = id;
    this.persist();
    this.emitChanged();
    return meta;
  }

  renameActiveProfile(name: string): void {
    const active = this.index.profiles[this.index.activeId];
    if (!active) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    active.meta.name = trimmed;
    active.snapshot.name = trimmed;
    active.meta.updatedAt = Date.now();
    this.persist();
    this.emitChanged();
  }

  deleteProfile(id: string, deps?: ProfileApplyDeps): boolean {
    if (Object.keys(this.index.profiles).length <= 1) return false;
    if (!this.index.profiles[id]) return false;
    const wasActive = this.index.activeId === id;
    delete this.index.profiles[id];
    if (wasActive) {
      this.index.activeId = Object.keys(this.index.profiles)[0] ?? "";
      if (deps && this.index.activeId) {
        this.switching = true;
        try {
          this.applySnapshot(this.index.profiles[this.index.activeId]!.snapshot, deps);
        } finally {
          this.switching = false;
        }
      }
    }
    this.persist();
    this.emitChanged();
    return true;
  }

  async switchProfile(id: string, deps: ProfileApplyDeps): Promise<boolean> {
    const target = this.index.profiles[id];
    if (!target || id === this.index.activeId) return false;

    this.switching = true;
    try {
      this.saveActiveSnapshot(deps);
      this.applySnapshot(target.snapshot, deps);
      this.index.activeId = id;
      this.persist();
      this.emitChanged();
      return true;
    } finally {
      this.switching = false;
    }
  }

  importSnapshotAsNewProfile(snapshot: ProfileSnapshotV1, deps: ProfileApplyDeps): ProfileMeta {
    this.switching = true;
    try {
      this.saveActiveSnapshot(deps);
      const id = createUuid();
      const now = Date.now();
      const name = snapshot.name.trim() || "Imported profile";
      const meta: ProfileMeta = { id, name, createdAt: now, updatedAt: now };
      this.index.profiles[id] = { meta, snapshot: { ...snapshot, name } };
      this.index.activeId = id;
      this.applySnapshot(snapshot, deps);
      this.persist();
      this.emitChanged();
      return meta;
    } finally {
      this.switching = false;
    }
  }

  /** Apply an imported snapshot to the active profile without creating a new slot. */
  importSnapshotIntoActive(snapshot: ProfileSnapshotV1, deps: ProfileApplyDeps): void {
    this.switching = true;
    try {
      this.applySnapshot(snapshot, deps);
      this.saveActiveSnapshot(deps);
      this.emitChanged();
    } finally {
      this.switching = false;
    }
  }

  applySnapshot(snapshot: ProfileSnapshotV1, deps: ProfileApplyDeps): void {
    const applied = applyProfileSnapshot(snapshot);
    deps.onSettingsChange(applied.settingsPatch);
    syncApiKeyStoreFromSnapshot(deps.apiKeyStore, snapshot);
    setGoogleClientId(applied.oauth.googleClientId ?? "");
    setDropboxAppKey(applied.oauth.dropboxAppKey ?? "");
    getCloudSaveManager().disconnect();
    restoreCloudSaveStorage(snapshot.cloudSaveStorage);
    void getCloudSaveManager().tryAutoConnect().catch(() => {});
  }

  exportActiveSnapshot(deps: ProfileApplyDeps): ProfileSnapshotV1 {
    return buildProfileSnapshot({
      name: this.getActiveProfileName(),
      settings: deps.settings,
      apiKeyStore: deps.apiKeyStore,
    });
  }

  private emitChanged(): void {
    if (typeof document === "undefined") return;
    document.dispatchEvent(new CustomEvent(LEGACY_EVENTS.profileChanged));
    document.dispatchEvent(new CustomEvent(LEGACY_EVENTS.libraryCatalogNeedsRefresh));
  }
}

let _instance: ProfileManager | null = null;

export function getProfileManager(storage?: Storage): ProfileManager {
  if (!_instance) _instance = new ProfileManager(storage);
  return _instance;
}

/** Test helper — reset singleton between unit tests. */
export function resetProfileManagerForTests(): void {
  _instance = null;
}
