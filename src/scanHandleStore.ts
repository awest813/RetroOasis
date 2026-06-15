/**
 * scanHandleStore.ts — Persistence for directory-scan re-scan (Phase 4).
 *
 * Stores the most recently scanned directory handle (File System Access API
 * handles are structured-cloneable) alongside the signatures of files imported
 * from it, so a later visit can re-acquire permission and import only what's new.
 *
 * Only one record is kept (id "last"); picking a new folder replaces it. The
 * webkitdirectory fallback yields no handle, so nothing is persisted for it.
 */

const DB_NAME = "retro-oasis-scan";
const DB_VERSION = 1;
const STORE_NAME = "records";
const RECORD_ID = "last";

/** A persisted scan, keyed by the singleton id "last". */
export interface SavedScanRecord {
  id: typeof RECORD_ID;
  /** A FileSystemDirectoryHandle (typed loosely to avoid lib coupling). */
  handle: unknown;
  /** Display name of the folder. */
  name: string;
  /** When the folder was last scanned/imported. */
  lastScanAt: number;
  /** Signatures (path+size+mtime) of files imported from this folder. */
  signatures: string[];
}

interface PermissionedHandle {
  queryPermission?: (opts: { mode: "read" }) => Promise<PermissionState>;
  requestPermission?: (opts: { mode: "read" }) => Promise<PermissionState>;
}

let _db: IDBDatabase | null = null;
let _dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
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
      reject(new Error(`Failed to open scan database: ${req.error?.message}`));
    };
  });
  return _dbPromise;
}

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Persist (replacing any prior record) the scanned handle and its signatures. */
export async function saveScanRecord(
  handle: unknown,
  name: string,
  signatures: string[],
): Promise<void> {
  const db = await openDB();
  const record: SavedScanRecord = {
    id: RECORD_ID,
    handle,
    name,
    lastScanAt: Date.now(),
    signatures,
  };
  const store = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME);
  await promisify(store.put(record));
}

/** Load the saved scan record, or null when none exists. */
export async function loadScanRecord(): Promise<SavedScanRecord | null> {
  try {
    const db = await openDB();
    const store = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME);
    const record = await promisify<SavedScanRecord | undefined>(
      store.get(RECORD_ID) as IDBRequest<SavedScanRecord | undefined>,
    );
    return record ?? null;
  } catch {
    return null;
  }
}

/** Remove the saved scan record. */
export async function clearScanRecord(): Promise<void> {
  const db = await openDB();
  const store = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME);
  await promisify(store.delete(RECORD_ID));
}

/**
 * Ensure read permission for a stored handle, prompting the user if needed.
 * Returns false when permission can't be obtained (or the API is unavailable).
 */
export async function verifyHandlePermission(handle: unknown): Promise<boolean> {
  const h = handle as PermissionedHandle | null;
  if (!h || typeof h.queryPermission !== "function") return false;
  try {
    if (await h.queryPermission({ mode: "read" }) === "granted") return true;
    if (typeof h.requestPermission === "function") {
      return await h.requestPermission({ mode: "read" }) === "granted";
    }
  } catch {
    /* fall through */
  }
  return false;
}

/** Test-only: close and reset the cached DB connection. */
export function _resetScanHandleStoreForTests(): void {
  _db?.close();
  _db = null;
  _dbPromise = null;
}
