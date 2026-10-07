/** EmulatorJS's own download cache ("EmulatorJS-Cache"): cores, BIOS files and
 * copies of games it has opened. Re-downloadable; never holds saves or states. */
const DB = 'EmulatorJS-Cache'

export interface EmulatorCacheUsage {
  bytes: number
  games: number
  cores: number
  items: number
}

const EMPTY: EmulatorCacheUsage = { bytes: 0, games: 0, cores: 0, items: 0 }

/** Reads the small metadata store only (sizes are recorded per entry). */
export function emulatorCacheUsage(): Promise<EmulatorCacheUsage> {
  return new Promise((resolve) => {
    let missing = false
    let request: IDBOpenDBRequest
    try { request = indexedDB.open(DB) } catch { resolve(EMPTY); return }
    request.onupgradeneeded = () => { missing = true; request.transaction?.abort() }
    request.onerror = () => resolve(EMPTY)
    request.onblocked = () => resolve(EMPTY)
    request.onsuccess = () => {
      const db = request.result
      if (missing || !db.objectStoreNames.contains('cache')) { db.close(); resolve(EMPTY); return }
      const all = db.transaction('cache', 'readonly').objectStore('cache').getAll()
      all.onsuccess = () => {
        const usage = { ...EMPTY }
        for (const item of all.result as Array<{ key?: string; fileSize?: number; type?: string }>) {
          // EmulatorJS keeps its key list ('?EJS_KEYS!', an array) in the same store.
          if (!item || Array.isArray(item) || typeof item.key !== 'string') continue
          usage.items++
          usage.bytes += Number(item?.fileSize) || 0
          if (item?.type === 'ROM') usage.games++
          else if (item?.type === 'Core') usage.cores++
        }
        db.close()
        resolve(usage)
      }
      all.onerror = () => { db.close(); resolve(EMPTY) }
    }
  })
}

/** Empties the cache in place. Deleting the database instead would wait on every open
 * game tab (EmulatorJS never closes its connections) and stall their cache reads meanwhile. */
export function clearEmulatorCache(): Promise<void> {
  return new Promise((resolve, reject) => {
    let missing = false
    let request: IDBOpenDBRequest
    try { request = indexedDB.open(DB) } catch { resolve(); return }
    request.onupgradeneeded = () => { missing = true; request.transaction?.abort() }
    request.onerror = () => (missing ? resolve() : reject(request.error ?? new Error('Couldn’t clear the emulator cache.')))
    request.onsuccess = () => {
      const db = request.result
      const stores = ['cache', 'blobs'].filter((name) => db.objectStoreNames.contains(name))
      if (!stores.length) { db.close(); resolve(); return }
      const tx = db.transaction(stores, 'readwrite')
      for (const name of stores) tx.objectStore(name).clear()
      tx.oncomplete = () => { db.close(); resolve() }
      tx.onerror = tx.onabort = () => { db.close(); reject(tx.error ?? new Error('Couldn’t clear the emulator cache.')) }
    }
  })
}
