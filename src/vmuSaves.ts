/**
 * vmuSaves.ts — Dreamcast VMU (Visual Memory Unit) file persistence.
 *
 * Flycast writes VMU images into EmulatorJS IDBFS at /data/saves. This library
 * mirrors those small peripheral saves into IndexedDB keyed by gameId so they
 * survive core teardown and can be restored on the next launch.
 */

import { readBlobAsArrayBuffer } from "./blobUtils.js";
import { computeChecksum } from "./saves.js";

export interface VmuSaveEntry {
  /** Composite key "{gameId}:{fileName}". */
  id: string;
  gameId: string;
  systemId: "segaDC";
  fileName: string;
  timestamp: number;
  checksum: string;
  data: Blob;
}

export type VmuSaveMetadata = Omit<VmuSaveEntry, "data">;

const DB_NAME = "retro-oasis-vmu-saves";
const DB_VERSION = 1;
const STORE_NAME = "vmu";

let _db: IDBDatabase | null = null;
let _dbPromise: Promise<IDBDatabase> | null = null;

function vmuEntryId(gameId: string, fileName: string): string {
  return `${gameId}:${fileName}`;
}

function openDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  if (_dbPromise) return _dbPromise;

  _dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("gameId", "gameId", { unique: false });
        store.createIndex("timestamp", "timestamp", { unique: false });
      }
    };
    req.onsuccess = () => {
      _db = req.result;
      _db.onclose = () => { _db = null; _dbPromise = null; };
      _db.onversionchange = () => { _db?.close(); _db = null; _dbPromise = null; };
      resolve(_db);
    };
    req.onerror = () => {
      _dbPromise = null;
      reject(new Error(`Failed to open VMU save database: ${req.error?.message}`));
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
    req.onerror = () => reject(req.error);
  });
}

export class VmuSaveLibrary {
  async upsertFiles(
    gameId: string,
    files: ReadonlyMap<string, Uint8Array>,
  ): Promise<number> {
    if (files.size === 0) return 0;
    const db = await openDB();
    const now = Date.now();
    let written = 0;

    for (const [fileName, bytes] of files) {
      const checksum = computeChecksum(bytes);
      const id = vmuEntryId(gameId, fileName);
      const existing = await promisify<VmuSaveEntry | undefined>(tx(db, "readonly").get(id));
      if (existing?.checksum === checksum) continue;

      const entry: VmuSaveEntry = {
        id,
        gameId,
        systemId: "segaDC",
        fileName,
        timestamp: now,
        checksum,
        data: new Blob([bytes], { type: "application/octet-stream" }),
      };
      await promisify(tx(db, "readwrite").put(entry));
      written++;
    }

    return written;
  }

  async getFilesForGame(gameId: string): Promise<Map<string, Uint8Array>> {
    const db = await openDB();
    const index = tx(db, "readonly").index("gameId");
    const rows = await promisify<VmuSaveEntry[]>(index.getAll(gameId));
    const out = new Map<string, Uint8Array>();
    for (const row of rows) {
      const bytes = new Uint8Array(await readBlobAsArrayBuffer(row.data));
      out.set(row.fileName, bytes);
    }
    return out;
  }

  async listMetadataForGame(gameId: string): Promise<VmuSaveMetadata[]> {
    const db = await openDB();
    const index = tx(db, "readonly").index("gameId");
    const rows = await promisify<VmuSaveEntry[]>(index.getAll(gameId));
    return rows.map(({ data: _data, ...meta }) => meta);
  }

  async deleteForGame(gameId: string): Promise<number> {
    const db = await openDB();
    const index = tx(db, "readwrite").index("gameId");
    const rows = await promisify<VmuSaveEntry[]>(index.getAll(gameId));
    for (const row of rows) {
      await promisify(tx(db, "readwrite").delete(row.id));
    }
    return rows.length;
  }

  /** Test helper — wipe the VMU database. */
  async clearAll(): Promise<void> {
    const db = await openDB();
    await promisify(tx(db, "readwrite").clear());
  }
}
