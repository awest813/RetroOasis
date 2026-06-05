/**
 * saves.ts — Save state library backed by IndexedDB
 *
 * Schema
 * ------
 * Database : "retro-oasis-saves"
 * Version  : 3
 * Store    : "states"  (keyPath = "id")
 *   id          string   — composite key "{gameId}:{slot}"
 *   gameId      string   — UUID from the game library
 *   gameName    string   — display name at time of save
 *   systemId    string   — EmulatorJS core id
 *   slot        number   — 0 = auto-save, 1–8 = manual slots
 *   label       string   — user-defined slot name (optional)
 *   timestamp   number   — Unix timestamp (ms) of the save
 *   thumbnail   Blob     — JPEG screenshot captured at save time (nullable)
 *   stateData   Blob     — raw emulator state bytes (nullable if EJS FS unavailable)
 *   isAutoSave  boolean  — true for slot 0 crash-recovery saves
 *   version     number   — save format version (optional, added in v3)
 *   checksum    string   — djb2 hex checksum of raw stateData bytes (optional, added in v3)
 */

import { unzipSync, zipSync, strFromU8, strToU8, type Zippable } from "fflate";
import { readBlobAsArrayBuffer } from "./blobUtils.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SaveStateEntry {
  id: string;
  gameId: string;
  gameName: string;
  systemId: string;
  slot: number;
  label: string;
  timestamp: number;
  thumbnail: Blob | null;
  stateData: Blob | null;
  isAutoSave: boolean;
  /** Save format version. Defaults to 1 for legacy entries. */
  version?: number;
  /** djb2 hex checksum of the raw stateData bytes (empty string when stateData is null). */
  checksum?: string;
}

export type SaveStateMetadata = Omit<SaveStateEntry, "thumbnail" | "stateData">;

export const MAX_SAVE_SLOTS = 8;
export const AUTO_SAVE_SLOT = 0;
export const SAVE_FORMAT_VERSION = 1;

// ── Library backup bundle ───────────────────────────────────────────────────────

/** Magic string identifying a RetroOasis save bundle in its manifest. */
export const SAVE_BUNDLE_FORMAT = "retro-oasis-save-bundle";
/** Bundle container version. Bumped if the manifest layout changes incompatibly. */
export const SAVE_BUNDLE_VERSION = 1;

/** How to resolve a slot that already exists when importing a bundle. */
export type ImportConflictStrategy = "newer" | "overwrite" | "skip";

/** Per-entry record stored in a bundle's `manifest.json`. */
export interface SaveBundleEntryManifest {
  gameId: string;
  gameName: string;
  systemId: string;
  slot: number;
  label: string;
  timestamp: number;
  isAutoSave: boolean;
  version: number;
  checksum: string;
  /** Path of the raw state file inside the archive, omitted when no state data. */
  state?: string;
  /** Path of the thumbnail file inside the archive, omitted when no thumbnail. */
  thumbnail?: string;
}

/** Top-level `manifest.json` describing a save bundle. */
export interface SaveBundleManifest {
  format: string;
  bundleVersion: number;
  exportedAt: number;
  entries: SaveBundleEntryManifest[];
}

export interface ExportBundleResult {
  blob: Blob;
  fileName: string;
  /** Number of save states written to the bundle. */
  count: number;
}

export interface ImportBundleOptions {
  /** Conflict resolution when a game+slot already exists locally. Defaults to "newer". */
  conflict?: ImportConflictStrategy;
}

export interface ImportBundleResult {
  /** Entries written to the local library. */
  imported: number;
  /** Entries left untouched because of the conflict strategy. */
  skipped: number;
  /** Entries that could not be restored (invalid data). */
  failed: number;
  /** Total entries described by the bundle manifest. */
  total: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DB_NAME    = "retro-oasis-saves";
const DB_VERSION = 3;
const STORE_NAME = "states";

// ── Database helpers ──────────────────────────────────────────────────────────

let _db: IDBDatabase | null = null;
let _dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  if (_dbPromise) return _dbPromise;

  _dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = req.result;
      const oldVersion = event.oldVersion;

      if (oldVersion < 1) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("gameId",    "gameId",    { unique: false });
        store.createIndex("timestamp", "timestamp", { unique: false });
      }

      if (oldVersion < 2) {
        const store = req.transaction?.objectStore(STORE_NAME);
        if (store && !store.indexNames.contains("label")) {
          store.createIndex("label", "label", { unique: false });
        }
      }

      // v3: version and checksum fields are optional — no new indexes needed.
    };

    req.onsuccess = () => {
      _db = req.result;
      _db.onclose = () => { _db = null; _dbPromise = null; };
      _db.onversionchange = () => { _db?.close(); _db = null; _dbPromise = null; };
      resolve(_db);
    };

    req.onerror = () => {
      _dbPromise = null;
      reject(new Error(`Failed to open save state database: ${req.error?.message}`));
    };
  });

  return _dbPromise;
}

function tx(db: IDBDatabase, mode: IDBTransactionMode): IDBObjectStore {
  return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
}

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

function waitForTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction was aborted."));
  });
}

/** Composite key for a save state: "{gameId}:{slot}" */
export function saveStateKey(gameId: string, slot: number): string {
  return `${gameId}:${slot}`;
}

export function assertValidSaveSlot(slot: number): void {
  if (!Number.isInteger(slot) || slot < AUTO_SAVE_SLOT || slot > MAX_SAVE_SLOTS) {
    throw new RangeError(`Save slot must be an integer from ${AUTO_SAVE_SLOT} to ${MAX_SAVE_SLOTS}.`);
  }
}

function assertValidGameId(gameId: string): void {
  if (typeof gameId !== "string" || gameId.trim().length === 0) {
    throw new TypeError("Save state requires a non-empty game id.");
  }
}

function assertValidSaveIdentity(gameId: string, slot: number): void {
  assertValidGameId(gameId);
  assertValidSaveSlot(slot);
}

/** Default slot label for a given slot number. */
export function defaultSlotLabel(slot: number): string {
  return slot === AUTO_SAVE_SLOT ? "Auto-Save" : `Slot ${slot}`;
}

/**
 * Convert emulator save-state bytes to a Blob for IndexedDB persistence.
 * Passes the Uint8Array view directly to the Blob constructor, which reads
 * the correct byte range (including subarray offsets) without an extra copy.
 *
 * The type assertion is required because TypeScript parameterises Uint8Array
 * as <ArrayBufferLike>, which includes SharedArrayBuffer, while the Blob
 * constructor only accepts ArrayBufferView<ArrayBuffer>.  Emulator FS data
 * is always backed by a plain ArrayBuffer, so the assertion is safe.
 */
export function stateBytesToBlob(stateBytes: Uint8Array | null | undefined): Blob | null {
  if (!stateBytes || stateBytes.byteLength === 0) return null;
  return new Blob([stateBytes as unknown as Uint8Array<ArrayBuffer>], { type: "application/octet-stream" });
}

// ── Checksum ──────────────────────────────────────────────────────────────────

/**
 * Compute a djb2 checksum over a Uint8Array, returned as an 8-character
 * lowercase hex string.  Fast, dependency-free integrity check for save data.
 */
export function computeChecksum(data: Uint8Array): string {
  let hash = 5381;
  for (let i = 0; i < data.length; i++) {
    hash = ((hash << 5) + hash + data[i]!) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * Verify that a save entry's stateData matches its stored checksum.
 * Returns true if the entry has no checksum (legacy), or if there is no
 * stateData (nothing to verify).  Only returns false on a detected mismatch.
 */
export async function verifySaveChecksum(entry: SaveStateEntry): Promise<boolean> {
  if (!entry.checksum || !entry.stateData) return true;
  const bytes = new Uint8Array(await readBlobAsArrayBuffer(entry.stateData));
  return computeChecksum(bytes) === entry.checksum;
}

// ── Save Event Bus ────────────────────────────────────────────────────────────

export type SaveEventType = "saved" | "deleted" | "migrated" | "cleared";

export interface SaveEvent {
  type: SaveEventType;
  gameId?: string;
  slot?: number;
  timestamp: number;
}

type SaveEventListener = (event: SaveEvent) => void;

/**
 * Simple synchronous event bus for save-system lifecycle events.
 * Subscribe with `saveEvents.on(type, handler)` or `saveEvents.on('*', handler)`
 * for all event types.  Returns an unsubscribe function.
 */
export class SaveEventBus {
  private readonly _listeners = new Map<SaveEventType | "*", Set<SaveEventListener>>();

  on(type: SaveEventType | "*", listener: SaveEventListener): () => void {
    let set = this._listeners.get(type);
    if (!set) {
      set = new Set();
      this._listeners.set(type, set);
    }
    set.add(listener);
    return () => this.off(type, listener);
  }

  off(type: SaveEventType | "*", listener: SaveEventListener): void {
    this._listeners.get(type)?.delete(listener);
  }

  emit(event: SaveEvent): void {
    this._listeners.get(event.type)?.forEach((l) => l(event));
    this._listeners.get("*")?.forEach((l) => l(event));
  }

  /** Remove all listeners (useful in tests). */
  clear(): void {
    this._listeners.clear();
  }
}

/** Module-level singleton — subscribe to save lifecycle events here. */
export const saveEvents = new SaveEventBus();

// ── SaveStateLibrary ──────────────────────────────────────────────────────────

export class SaveStateLibrary {
  /**
   * Store a save state entry.
   * If an entry for the same game+slot already exists, it is replaced.
   * Entries without a label get the default slot label.
   * Automatically populates `version` and computes `checksum` from stateData.
   */
  async saveState(entry: SaveStateEntry): Promise<void> {
    assertValidSaveIdentity(entry.gameId, entry.slot);
    const db = await openDB();

    let checksum = entry.checksum;
    if (!checksum && entry.stateData) {
      const bytes = new Uint8Array(await readBlobAsArrayBuffer(entry.stateData));
      checksum = computeChecksum(bytes);
    }

    const normalized: SaveStateEntry = {
      ...entry,
      id:       saveStateKey(entry.gameId, entry.slot),
      label:    entry.label || defaultSlotLabel(entry.slot),
      isAutoSave: entry.slot === AUTO_SAVE_SLOT,
      version:  entry.version ?? SAVE_FORMAT_VERSION,
      checksum: checksum ?? "",
    };
    const store = tx(db, "readwrite");
    store.put(normalized);
    await waitForTransaction(store.transaction);
    saveEvents.emit({ type: "saved", gameId: entry.gameId, slot: entry.slot, timestamp: Date.now() });
  }

  /**
   * Get a save state by game ID and slot.
   */
  async getState(gameId: string, slot: number): Promise<SaveStateEntry | null> {
    assertValidSaveIdentity(gameId, slot);
    const db = await openDB();
    const id = saveStateKey(gameId, slot);
    const result = await promisify<SaveStateEntry | undefined>(tx(db, "readonly").get(id));
    return result ?? null;
  }

  /**
   * Get all save states for a specific game (all slots), sorted by slot.
   */
  async getStatesForGame(gameId: string): Promise<SaveStateEntry[]> {
    assertValidGameId(gameId);
    const db    = await openDB();
    const store = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME);
    const idx   = store.index("gameId");
    const all   = await promisify<SaveStateEntry[]>(idx.getAll(gameId));
    return all.sort((a, b) => a.slot - b.slot);
  }

  /**
   * Get metadata-only list for a game (no thumbnail or stateData blobs).
   */
  async getMetadataForGame(gameId: string): Promise<SaveStateMetadata[]> {
    assertValidGameId(gameId);
    const states = await this.getStatesForGame(gameId);
    return states.map(({ thumbnail: _t, stateData: _s, ...meta }) => meta);
  }

  /**
   * Get the most recently created manual save for a game (slot 1–MAX_SAVE_SLOTS).
   * Returns null if no manual saves exist.
   */
  async getLatestManualSave(gameId: string): Promise<SaveStateEntry | null> {
    assertValidGameId(gameId);
    const states = await this.getStatesForGame(gameId);
    const manual = states.filter(s => s.slot !== AUTO_SAVE_SLOT);
    if (manual.length === 0) return null;
    return manual.reduce((latest, s) => s.timestamp > latest.timestamp ? s : latest);
  }

  /**
   * Delete a save state by game ID and slot.
   */
  async deleteState(gameId: string, slot: number): Promise<void> {
    assertValidSaveIdentity(gameId, slot);
    const db = await openDB();
    const id = saveStateKey(gameId, slot);
    await promisify(tx(db, "readwrite").delete(id));
    saveEvents.emit({ type: "deleted", gameId, slot, timestamp: Date.now() });
  }

  /**
   * Delete all save states for a game.
   */
  async deleteAllForGame(gameId: string): Promise<void> {
    assertValidGameId(gameId);
    const states = await this.getStatesForGame(gameId);
    const db = await openDB();
    const store = tx(db, "readwrite");
    for (const s of states) {
      store.delete(s.id);
    }
    await waitForTransaction(store.transaction);
    saveEvents.emit({ type: "deleted", gameId, timestamp: Date.now() });
  }

  /**
   * Update the user-defined label for a save slot.
   */
  async updateStateLabel(gameId: string, slot: number, label: string): Promise<void> {
    assertValidSaveIdentity(gameId, slot);
    const state = await this.getState(gameId, slot);
    if (!state) return;
    const db = await openDB();
    const store = tx(db, "readwrite");
    store.put({ ...state, label: label.trim() || defaultSlotLabel(slot) });
    await waitForTransaction(store.transaction);
    saveEvents.emit({ type: "saved", gameId, slot, timestamp: Date.now() });
  }

  /**
   * Check if a crash-recovery auto-save exists for a game.
   */
  async hasAutoSave(gameId: string): Promise<boolean> {
    assertValidGameId(gameId);
    const state = await this.getState(gameId, AUTO_SAVE_SLOT);
    return state !== null;
  }

  /**
   * Migrate all saves from one game ID to another (used when a ROM is renamed).
   * The old entries are deleted and new entries with the updated gameId are created.
   */
  async migrateSaves(oldGameId: string, newGameId: string, newGameName?: string): Promise<number> {
    assertValidGameId(oldGameId);
    assertValidGameId(newGameId);
    const states = await this.getStatesForGame(oldGameId);
    if (states.length === 0) return 0;

    const db = await openDB();
    const store = tx(db, "readwrite");

    for (const s of states) {
      store.delete(s.id);
      const migrated: SaveStateEntry = {
        ...s,
        id:       saveStateKey(newGameId, s.slot),
        gameId:   newGameId,
        gameName: newGameName ?? s.gameName,
      };
      store.put(migrated);
    }

    await waitForTransaction(store.transaction);

    saveEvents.emit({ type: "migrated", gameId: newGameId, timestamp: Date.now() });
    return states.length;
  }

  /**
   * Export a save state as a downloadable `.state` file.
   * Returns null if no state data is stored for the slot.
   */
  async exportState(gameId: string, slot: number): Promise<{ blob: Blob; fileName: string } | null> {
    assertValidSaveIdentity(gameId, slot);
    const state = await this.getState(gameId, slot);
    if (!state?.stateData) return null;

    const slotLabel = slot === AUTO_SAVE_SLOT ? "autosave" : `slot${slot}`;
    const safeName  = state.gameName.replace(/[^a-zA-Z0-9_\-. ]/g, "_");
    const fileName  = `${safeName}_${slotLabel}.state`;

    return { blob: state.stateData, fileName };
  }

  /**
   * Export all save states for a game as an array of {blob, fileName} pairs.
   * Only returns slots that have stateData.
   */
  async exportAllForGame(gameId: string): Promise<Array<{ blob: Blob; fileName: string }>> {
    assertValidGameId(gameId);
    const states = await this.getStatesForGame(gameId);
    const results: Array<{ blob: Blob; fileName: string }> = [];
    for (const state of states) {
      if (!state.stateData) continue;
      const slotLabel = state.slot === AUTO_SAVE_SLOT ? "autosave" : `slot${state.slot}`;
      const safeName  = state.gameName.replace(/[^a-zA-Z0-9_\-. ]/g, "_");
      results.push({ blob: state.stateData, fileName: `${safeName}_${slotLabel}.state` });
    }
    return results;
  }

  /**
   * Import a `.state` file into a specific slot for a game.
   * Computes checksum from the blob before delegating to saveState() so that
   * version/checksum population is handled in one place.
   */
  async importState(
    gameId: string,
    gameName: string,
    systemId: string,
    slot: number,
    stateBlob: Blob,
    label?: string
  ): Promise<void> {
    assertValidSaveIdentity(gameId, slot);
    const bytes    = new Uint8Array(await readBlobAsArrayBuffer(stateBlob));
    const checksum = computeChecksum(bytes);
    const entry: SaveStateEntry = {
      id:         saveStateKey(gameId, slot),
      gameId,
      gameName,
      systemId,
      slot,
      label:      label || defaultSlotLabel(slot),
      timestamp:  Date.now(),
      thumbnail:  null,
      stateData:  stateBlob,
      isAutoSave: slot === AUTO_SAVE_SLOT,
      version:    SAVE_FORMAT_VERSION,
      checksum,
    };
    await this.saveState(entry);
  }

  /**
   * Export the entire save library (every game, every slot) as a single ZIP
   * bundle. The bundle embeds a `manifest.json` describing each entry plus the
   * raw state and thumbnail blobs, so it can be re-imported on another device
   * via {@link importLibraryBundle}.
   *
   * Returns the bundle blob, a suggested file name, and the entry count.
   */
  async exportLibraryBundle(): Promise<ExportBundleResult> {
    const db  = await openDB();
    const all = await promisify<SaveStateEntry[]>(tx(db, "readonly").getAll());
    all.sort((a, b) => a.gameId.localeCompare(b.gameId) || a.slot - b.slot);

    const files: Zippable = {};
    const entries: SaveBundleEntryManifest[] = [];

    for (let i = 0; i < all.length; i++) {
      const s = all[i]!;
      const manifestEntry: SaveBundleEntryManifest = {
        gameId:     s.gameId,
        gameName:   s.gameName,
        systemId:   s.systemId,
        slot:       s.slot,
        label:      s.label,
        timestamp:  s.timestamp,
        isAutoSave: s.isAutoSave,
        version:    s.version ?? SAVE_FORMAT_VERSION,
        checksum:   s.checksum ?? "",
      };

      if (s.stateData) {
        const path = `states/${i}.bin`;
        files[path] = new Uint8Array(await readBlobAsArrayBuffer(s.stateData));
        manifestEntry.state = path;
      }
      if (s.thumbnail) {
        const path = `thumbs/${i}.jpg`;
        files[path] = new Uint8Array(await readBlobAsArrayBuffer(s.thumbnail));
        manifestEntry.thumbnail = path;
      }
      entries.push(manifestEntry);
    }

    const manifest: SaveBundleManifest = {
      format:        SAVE_BUNDLE_FORMAT,
      bundleVersion: SAVE_BUNDLE_VERSION,
      exportedAt:    Date.now(),
      entries,
    };
    files["manifest.json"] = strToU8(JSON.stringify(manifest));

    const zipped = zipSync(files);
    const blob = new Blob([zipped as unknown as Uint8Array<ArrayBuffer>], { type: "application/zip" });
    return { blob, fileName: `retro-oasis-saves-${bundleDateStamp()}.zip`, count: all.length };
  }

  /**
   * Restore save states from a bundle produced by {@link exportLibraryBundle}.
   *
   * The `conflict` option controls what happens when a game+slot already exists
   * locally: "newer" (default) keeps whichever save has the later timestamp,
   * "overwrite" always replaces the local entry, and "skip" never touches
   * existing slots. Entries that cannot be parsed are counted as `failed`
   * rather than aborting the whole import.
   *
   * @throws if the blob is not a valid bundle or the manifest is unreadable.
   */
  async importLibraryBundle(bundle: Blob, options: ImportBundleOptions = {}): Promise<ImportBundleResult> {
    const conflict = options.conflict ?? "newer";
    const bytes = new Uint8Array(await readBlobAsArrayBuffer(bundle));

    let files: Record<string, Uint8Array>;
    try {
      files = unzipSync(bytes);
    } catch {
      throw new Error("This file is not a valid RetroOasis save bundle.");
    }

    const manifestBytes = files["manifest.json"];
    if (!manifestBytes) {
      throw new Error("Save bundle is missing its manifest.");
    }

    let manifest: SaveBundleManifest;
    try {
      manifest = JSON.parse(strFromU8(manifestBytes)) as SaveBundleManifest;
    } catch {
      throw new Error("Save bundle manifest is corrupted.");
    }
    if (manifest.format !== SAVE_BUNDLE_FORMAT || !Array.isArray(manifest.entries)) {
      throw new Error("Unrecognized save bundle format.");
    }
    if (typeof manifest.bundleVersion === "number" && manifest.bundleVersion > SAVE_BUNDLE_VERSION) {
      throw new Error("This save bundle was created by a newer version of RetroOasis.");
    }

    let imported = 0;
    let skipped  = 0;
    let failed   = 0;

    for (const e of manifest.entries) {
      try {
        if (typeof e?.gameId !== "string" || e.gameId.trim().length === 0) {
          failed++;
          continue;
        }
        assertValidSaveSlot(e.slot);

        if (conflict !== "overwrite") {
          const existing = await this.getState(e.gameId, e.slot);
          if (existing) {
            if (conflict === "skip") { skipped++; continue; }
            if (conflict === "newer" && existing.timestamp >= (e.timestamp ?? 0)) { skipped++; continue; }
          }
        }

        const stateBytes = e.state ? files[e.state] : undefined;
        const thumbBytes = e.thumbnail ? files[e.thumbnail] : undefined;
        const stateData = stateBytesToBlob(stateBytes);
        const thumbnail = thumbBytes && thumbBytes.byteLength > 0
          ? new Blob([thumbBytes as unknown as Uint8Array<ArrayBuffer>], { type: "image/jpeg" })
          : null;

        const entry: SaveStateEntry = {
          id:         saveStateKey(e.gameId, e.slot),
          gameId:     e.gameId,
          gameName:   typeof e.gameName === "string" ? e.gameName : "Unknown",
          systemId:   typeof e.systemId === "string" ? e.systemId : "",
          slot:       e.slot,
          label:      typeof e.label === "string" && e.label.trim() ? e.label : defaultSlotLabel(e.slot),
          timestamp:  typeof e.timestamp === "number" ? e.timestamp : Date.now(),
          thumbnail,
          stateData,
          isAutoSave: e.slot === AUTO_SAVE_SLOT,
          version:    typeof e.version === "number" ? e.version : SAVE_FORMAT_VERSION,
          checksum:   typeof e.checksum === "string" && e.checksum ? e.checksum : undefined,
        };

        // saveState recomputes a missing checksum and persists in one place.
        await this.saveState(entry);
        imported++;
      } catch {
        failed++;
      }
    }

    saveEvents.emit({ type: "migrated", timestamp: Date.now() });
    return { imported, skipped, failed, total: manifest.entries.length };
  }

  /**
   * Get all unique gameIds that have at least one save state.
   *
   * Uses IDBIndex.openKeyCursor() with "nextunique" direction so each
   * unique gameId (the index key) is visited exactly once. This is
   * more correct than getAllKeys() which returns the object store's
   * primary keys (the composite "gameId:slot" strings), not the
   * gameId values themselves.
   */
  async getAllSavedGameIds(): Promise<string[]> {
    const db = await openDB();
    return new Promise<string[]>((resolve, reject) => {
      const store = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME);
      const idx   = store.index("gameId");
      const ids: string[] = [];
      const req = idx.openKeyCursor(null, "nextunique");
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          ids.push(cursor.key as string);
          cursor.continue();
        } else {
          resolve(ids);
        }
      };
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Get total number of save states stored.
   */
  async count(): Promise<number> {
    const db = await openDB();
    return promisify(tx(db, "readonly").count());
  }

  /**
   * Clear all save states.
   */
  async clearAll(): Promise<void> {
    const db = await openDB();
    await promisify(tx(db, "readwrite").clear());
    saveEvents.emit({ type: "cleared", timestamp: Date.now() });
  }

  /**
   * Pre-warm the IndexedDB connection.
   */
  async warmUp(): Promise<void> {
    await openDB();
  }
}

// ── Screenshot capture ────────────────────────────────────────────────────────

/** Timeout (ms) after which a stalled `canvas.toBlob()` call is abandoned. */
const SCREENSHOT_TIMEOUT_MS = 5_000;

interface ThumbnailImageSource {
  width: number;
  height: number;
  draw(ctx: CanvasRenderingContext2D, width: number, height: number): void;
  close(): void;
}

async function loadThumbnailSource(screenshot: Blob): Promise<ThumbnailImageSource | null> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(screenshot);
    return {
      width: bitmap.width,
      height: bitmap.height,
      draw: (ctx, width, height) => ctx.drawImage(bitmap, 0, 0, width, height),
      close: () => bitmap.close(),
    };
  }

  if (typeof Image === "undefined" || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
    return null;
  }

  return new Promise<ThumbnailImageSource | null>((resolve) => {
    const url = URL.createObjectURL(screenshot);
    const img = new Image();
    let settled = false;
    const cleanup = () => URL.revokeObjectURL(url);
    const done = (source: ThumbnailImageSource | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(source);
    };
    img.onload = () => {
      done({
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height,
        draw: (ctx, width, height) => ctx.drawImage(img, 0, 0, width, height),
        close: () => {},
      });
    };
    img.onerror = () => done(null);
    img.src = url;
  });
}

/**
 * Capture a JPEG screenshot from the emulator canvas.
 * Returns null if the canvas is not found or capture fails.
 */
export function captureScreenshot(playerId: string): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      const playerEl = document.getElementById(playerId);
      if (!playerEl) { resolve(null); return; }

      const canvas = playerEl.querySelector("canvas");
      if (!canvas || canvas.width === 0 || canvas.height === 0) {
        resolve(null);
        return;
      }

      let settled = false;
      const timeoutId = setTimeout(() => {
        if (!settled) { settled = true; resolve(null); }
      }, SCREENSHOT_TIMEOUT_MS);

      canvas.toBlob(
        (blob) => {
          if (!settled) {
            settled = true;
            clearTimeout(timeoutId);
            resolve(blob);
          }
        },
        "image/jpeg",
        0.75
      );
    } catch {
      resolve(null);
    }
  });
}

/**
 * Create a thumbnail (smaller image) from a screenshot blob.
 * Resizes to max 240×160 for display in the grid-based gallery.
 */
export async function createThumbnail(screenshot: Blob): Promise<Blob | null> {
  try {
    const source = await loadThumbnailSource(screenshot);
    if (!source || source.width === 0 || source.height === 0) return null;
    const MAX_W = 240;
    const MAX_H = 160;
    const scale = Math.min(MAX_W / source.width, MAX_H / source.height, 1);
    const w = Math.round(source.width * scale);
    const h = Math.round(source.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width  = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      source.close();
      return null;
    }

    source.draw(ctx, w, h);
    source.close();

    return new Promise<Blob | null>((resolve) => {
      let settled = false;
      const timeoutId = setTimeout(() => {
        if (!settled) { settled = true; resolve(null); }
      }, SCREENSHOT_TIMEOUT_MS);

      canvas.toBlob(
        (blob) => {
          if (!settled) {
            settled = true;
            clearTimeout(timeoutId);
            resolve(blob);
          }
        },
        "image/jpeg",
        0.8
      );
    });
  } catch {
    return null;
  }
}

/** Local `YYYY-MM-DD` stamp used in exported bundle file names. */
function bundleDateStamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ── File download helper ──────────────────────────────────────────────────────

/** Trigger a browser download of a Blob. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement("a");
  a.href     = url;
  a.download = fileName;
  a.style.display = "none";
  document.body.appendChild(a);
  try { a.click(); } finally {
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 500);
  }
}
