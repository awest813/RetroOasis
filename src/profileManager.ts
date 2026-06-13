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
  normalizeStoredProfileEntry,
  type ProfileSnapshotV1,
} from "./profileSnapshot.js";
import {
  pruneProfileGameTags,
  syncLibraryTagsForProfile,
  pruneOrphanProfileTags,
  syncAllLibraryTagsFromSnapshots,
  sanitizeLibraryGameIds,
  getTaggedGameIds,
} from "./profileGameTags.js";
import {
  pruneProfileBacklog,
  syncBacklogForProfile,
  pruneOrphanBacklogs,
  syncAllBacklogsFromSnapshots,
  sanitizeBacklogGameIds,
  getBacklogGameIds,
} from "./profileBacklog.js";
import { setGoogleClientId, setDropboxAppKey } from "./oauthPopup.js";
import { isValidProfileColor, pickDefaultProfileColor } from "./profileColors.js";

export const PROFILE_INDEX_STORAGE_KEY = "retro-oasis.profiles";
const AUTO_SAVE_DEBOUNCE_MS = 1500;

export interface ProfileMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  /** Accent color for chips and profile picker (hex). */
  color?: string;
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

export type ProfileIndexCloudExport =
  | { ok: true; raw: string }
  | { ok: false; error: string };

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
      const normalizedProfiles: Record<string, StoredProfile> = {};
      for (const [id, stored] of Object.entries(rec.profiles)) {
        const entry = normalizeStoredProfileEntry(stored);
        if (!entry) continue;
        normalizedProfiles[id] = { meta: entry.meta, snapshot: entry.snapshot };
      }
      if (Object.keys(normalizedProfiles).length === 0) {
        this.index = emptyIndex();
        return;
      }
      let activeId = typeof rec.activeId === "string" ? rec.activeId : "";
      if (!activeId || !normalizedProfiles[activeId]) {
        activeId = Object.keys(normalizedProfiles)[0] ?? "";
      }
      this.index = { version: 1, activeId, profiles: normalizedProfiles };
      this.ensureProfileColors();
    } catch {
      this.index = emptyIndex();
    }
  }

  private ensureProfileColors(): void {
    let changed = false;
    let i = 0;
    for (const stored of Object.values(this.index.profiles)) {
      if (!stored.meta.color) {
        stored.meta.color = pickDefaultProfileColor(i);
        i += 1;
        changed = true;
      }
    }
    if (changed) this.persist();
  }

  private persist(): string | null {
    try {
      this.storage.setItem(PROFILE_INDEX_STORAGE_KEY, JSON.stringify(this.index));
      return null;
    } catch {
      return "Could not save profiles — browser storage may be full.";
    }
  }

  /** Create a default profile from the current browser state on first run. */
  ensureInitialized(deps: ProfileApplyDeps): void {
    if (this.initialized) return;
    this.initialized = true;

    const hadProfiles = Object.keys(this.index.profiles).length > 0;

    if (!hadProfiles) {
      const id = createUuid();
      const now = Date.now();
      const snapshot = buildProfileSnapshot({
        name: "Default",
        settings: deps.settings,
        apiKeyStore: deps.apiKeyStore,
        profileId: id,
      });
      this.index.profiles[id] = {
        meta: {
          id,
          name: "Default",
          createdAt: now,
          updatedAt: now,
          color: pickDefaultProfileColor(0),
        },
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

  getProfileColor(id: string): string {
    const stored = this.index.profiles[id];
    if (stored?.meta.color) return stored.meta.color;
    const index = Object.keys(this.index.profiles).indexOf(id);
    return pickDefaultProfileColor(Math.max(0, index));
  }

  getActiveProfileColor(): string {
    return this.getProfileColor(this.index.activeId);
  }

  setActiveProfileColor(color: string): void {
    this.setProfileColor(this.index.activeId, color);
  }

  setProfileColor(id: string, color: string): string | null {
    const stored = this.index.profiles[id];
    if (!stored || !isValidProfileColor(color)) return null;
    stored.meta.color = color;
    stored.meta.updatedAt = Date.now();
    const err = this.persist();
    if (id === this.index.activeId) this.emitChanged();
    return err;
  }

  saveActiveSnapshot(deps: ProfileApplyDeps): string | null {
    const active = this.index.profiles[this.index.activeId];
    if (!active) return null;
    const name = active.meta.name;
    active.snapshot = buildProfileSnapshot({
      name,
      settings: deps.settings,
      apiKeyStore: deps.apiKeyStore,
      profileId: this.index.activeId,
    });
    active.meta.updatedAt = Date.now();
    return this.persist();
  }

  scheduleAutoSave(deps: ProfileApplyDeps): void {
    if (this.switching || !this.index.activeId) return;
    if (this.autoSaveTimer !== null) globalThis.clearTimeout(this.autoSaveTimer);
    this.autoSaveTimer = globalThis.setTimeout(() => {
      this.autoSaveTimer = null;
      this.saveActiveSnapshot(deps);
    }, AUTO_SAVE_DEBOUNCE_MS);
  }

  /** Cancel any pending debounced save and persist the active profile immediately. */
  flushAutoSave(deps: ProfileApplyDeps): string | null {
    if (this.autoSaveTimer !== null) {
      globalThis.clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
    if (this.switching || !this.index.activeId) return null;
    return this.saveActiveSnapshot(deps);
  }

  createProfile(name: string, deps: ProfileApplyDeps): ProfileMeta | string {
    const flushErr = this.saveActiveSnapshot(deps);
    if (flushErr) return flushErr;
    const id = createUuid();
    const now = Date.now();
    const trimmed = name.trim() || `Profile ${Object.keys(this.index.profiles).length + 1}`;
    const snapshot = buildProfileSnapshot({
      name: trimmed,
      settings: deps.settings,
      apiKeyStore: deps.apiKeyStore,
      profileId: id,
    });
    const meta: ProfileMeta = {
      id,
      name: trimmed,
      createdAt: now,
      updatedAt: now,
      color: pickDefaultProfileColor(Object.keys(this.index.profiles).length),
    };
    this.index.profiles[id] = { meta, snapshot };
    this.index.activeId = id;
    const err = this.persist();
    if (err) return err;
    this.emitChanged();
    return meta;
  }

  renameActiveProfile(name: string): string | null {
    const active = this.index.profiles[this.index.activeId];
    if (!active) return null;
    const trimmed = name.trim();
    if (!trimmed) return null;
    active.meta.name = trimmed;
    active.snapshot.name = trimmed;
    active.meta.updatedAt = Date.now();
    const err = this.persist();
    if (!err) this.emitChanged();
    return err;
  }

  deleteProfile(id: string, deps?: ProfileApplyDeps): boolean | string {
    if (Object.keys(this.index.profiles).length <= 1) return false;
    if (!this.index.profiles[id]) return false;
    const wasActive = this.index.activeId === id;
    delete this.index.profiles[id];
    pruneProfileGameTags(id);
    pruneProfileBacklog(id);
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
    const err = this.persist();
    if (err) return err;
    this.emitChanged();
    return true;
  }

  async switchProfile(id: string, deps: ProfileApplyDeps): Promise<boolean | string> {
    const target = this.index.profiles[id];
    if (!target || id === this.index.activeId) return false;

    if (this.autoSaveTimer !== null) {
      globalThis.clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }

    this.switching = true;
    try {
      const saveErr = this.saveActiveSnapshot(deps);
      if (saveErr) return saveErr;
      this.applySnapshot(target.snapshot, deps);
      this.index.activeId = id;
      const persistErr = this.persist();
      if (persistErr) return persistErr;
      this.emitChanged();
      return true;
    } finally {
      this.switching = false;
    }
  }

  importSnapshotAsNewProfile(snapshot: ProfileSnapshotV1, deps: ProfileApplyDeps): ProfileMeta | string {
    this.switching = true;
    try {
      this.saveActiveSnapshot(deps);
      const id = createUuid();
      const now = Date.now();
      const name = snapshot.name.trim() || "Imported profile";
      const meta: ProfileMeta = {
        id,
        name,
        createdAt: now,
        updatedAt: now,
        color: pickDefaultProfileColor(Object.keys(this.index.profiles).length),
      };
      this.index.profiles[id] = { meta, snapshot: { ...snapshot, name } };
      this.index.activeId = id;
      syncLibraryTagsForProfile(id, snapshot.libraryGameIds);
      syncBacklogForProfile(id, snapshot.backlogGameIds);
      this.applySnapshot(snapshot, deps);
      const err = this.persist();
      if (err) return err;
      this.emitChanged();
      return meta;
    } finally {
      this.switching = false;
    }
  }

  /** Apply an imported snapshot to the active profile without creating a new slot. */
  importSnapshotIntoActive(snapshot: ProfileSnapshotV1, deps: ProfileApplyDeps): string | null {
    this.switching = true;
    try {
      this.applySnapshot(snapshot, deps);
      syncLibraryTagsForProfile(this.index.activeId, snapshot.libraryGameIds);
      syncBacklogForProfile(this.index.activeId, snapshot.backlogGameIds);
      const err = this.saveActiveSnapshot(deps);
      if (!err) this.emitChanged();
      return err;
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
      profileId: this.index.activeId,
    });
  }

  /** Export a stored profile snapshot without switching (refreshes active slot from live state). */
  exportProfileSnapshot(id: string, deps?: ProfileApplyDeps): ProfileSnapshotV1 | null {
    if (id === this.index.activeId && deps) {
      return this.exportActiveSnapshot(deps);
    }
    const stored = this.index.profiles[id];
    if (!stored) return null;
    const snapshot = structuredClone(stored.snapshot);
    const liveTags = sanitizeLibraryGameIds([...getTaggedGameIds(id)]);
    if (liveTags) snapshot.libraryGameIds = liveTags;
    else delete snapshot.libraryGameIds;
    const liveBacklog = sanitizeBacklogGameIds([...getBacklogGameIds(id)]);
    if (liveBacklog) snapshot.backlogGameIds = liveBacklog;
    else delete snapshot.backlogGameIds;
    return snapshot;
  }

  /** Refresh embedded per-profile game lists from live storage for every profile slot. */
  private refreshEmbeddedGameLists(): void {
    for (const [id, stored] of Object.entries(this.index.profiles)) {
      const liveTags = sanitizeLibraryGameIds([...getTaggedGameIds(id)]);
      if (liveTags) stored.snapshot.libraryGameIds = liveTags;
      else delete stored.snapshot.libraryGameIds;
      const liveBacklog = sanitizeBacklogGameIds([...getBacklogGameIds(id)]);
      if (liveBacklog) stored.snapshot.backlogGameIds = liveBacklog;
      else delete stored.snapshot.backlogGameIds;
    }
  }

  /** Flush active profile and export index with up-to-date library tags/backlogs for cloud backup. */
  exportProfileIndexForCloud(deps: ProfileApplyDeps): ProfileIndexCloudExport {
    const flushErr = this.flushAutoSave(deps);
    if (flushErr) return { ok: false, error: flushErr };
    this.refreshEmbeddedGameLists();
    return { ok: true, raw: this.exportProfileIndexRaw() };
  }

  exportProfileIndexRaw(): string {
    return JSON.stringify(this.index);
  }

  /**
   * Replace or merge a remote profile index into local storage.
   * Merge keeps existing slots and adds profiles whose ids are not present locally.
   */
  importProfileIndexRaw(raw: string, mode: "replace" | "merge", deps?: ProfileApplyDeps): string | null {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return "Remote profile index is not valid JSON.";
    }
    if (!parsed || typeof parsed !== "object") return "Remote profile index is empty.";
    const rec = parsed as ProfileIndexV1;
    if (rec.version !== 1 || !rec.profiles || typeof rec.profiles !== "object") {
      return "Unsupported remote profile index version.";
    }

    const normalizedProfiles: Record<string, StoredProfile> = {};
    for (const [id, stored] of Object.entries(rec.profiles)) {
      const normalized = normalizeStoredProfileEntry(stored);
      if (!normalized) continue;
      normalizedProfiles[id] = { meta: normalized.meta, snapshot: normalized.snapshot };
    }
    if (Object.keys(normalizedProfiles).length === 0) {
      return "Remote profile index contains no valid profiles.";
    }

    const updatedIds = new Set<string>();

    if (mode === "replace") {
      const activeId = typeof rec.activeId === "string" && normalizedProfiles[rec.activeId]
        ? rec.activeId
        : Object.keys(normalizedProfiles)[0] ?? "";
      this.index = {
        version: 1,
        activeId,
        profiles: normalizedProfiles,
      };
      for (const id of Object.keys(normalizedProfiles)) updatedIds.add(id);
    } else {
      for (const [id, stored] of Object.entries(normalizedProfiles)) {
        const existing = this.index.profiles[id];
        if (!existing || stored.meta.updatedAt > existing.meta.updatedAt) {
          this.index.profiles[id] = stored;
          updatedIds.add(id);
        }
      }
      if (!this.index.activeId && typeof rec.activeId === "string" && this.index.profiles[rec.activeId]) {
        this.index.activeId = rec.activeId;
      }
    }

    pruneOrphanProfileTags(Object.keys(this.index.profiles));
    pruneOrphanBacklogs(Object.keys(this.index.profiles));
    if (mode === "replace") {
      syncAllLibraryTagsFromSnapshots(
        Object.fromEntries(
          Object.entries(this.index.profiles).map(([id, p]) => [id, p.snapshot]),
        ),
      );
      syncAllBacklogsFromSnapshots(
        Object.fromEntries(
          Object.entries(this.index.profiles).map(([id, p]) => [id, p.snapshot]),
        ),
      );
    } else {
      for (const id of updatedIds) {
        syncLibraryTagsForProfile(id, this.index.profiles[id]?.snapshot.libraryGameIds);
        syncBacklogForProfile(id, this.index.profiles[id]?.snapshot.backlogGameIds);
      }
    }

    this.ensureProfileColors();
    if (!this.index.activeId || !this.index.profiles[this.index.activeId]) {
      this.index.activeId = Object.keys(this.index.profiles)[0] ?? "";
    }
    const persistErr = this.persist();
    if (persistErr) return persistErr;
    if (deps) {
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
    this.emitChanged();
    return null;
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
