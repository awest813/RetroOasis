/** Battery saves as EmulatorJS stores them: Emscripten IDBFS database '/data/saves',
 * key '/data/saves/<ROM name without extension>.srm' (RetroArch's naming), value
 * { timestamp, mode, contents }. Same schema as src/lib/saves.ts; never rename keys. */
const DB = '/data/saves', STORE = 'FILE_DATA', VERSION = 21
const FILE_MODE = 0o100666
const bytesOf = value => ArrayBuffer.isView(value) ? new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)) : new Uint8Array(value)

export function librarySaveKey(romName) {
  const stem = String(romName || '').split('/').pop().replace(/\.[^.]+$/, '')
  return stem ? `${DB}/${stem}.srm` : null
}

function open(create) {
  return new Promise((resolve, reject) => {
    let missing = false
    const request = create ? indexedDB.open(DB, VERSION) : indexedDB.open(DB)
    request.onupgradeneeded = () => {
      // Reading must never create an empty emulator database.
      if (!create) { missing = true; request.transaction.abort(); return }
      request.result.createObjectStore(STORE).createIndex('timestamp', 'timestamp')
    }
    request.onsuccess = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) { db.close(); reject(new Error('This emulator save format is not supported.')); return }
      resolve(db)
    }
    request.onerror = () => missing ? resolve(null) : reject(request.error)
    request.onblocked = () => reject(new Error('Close other RetroOasis game tabs, then try again.'))
  })
}

export async function readLibrarySave(key) {
  if (!key) return null
  const db = await open(false)
  if (!db) return null
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(key)
      request.onsuccess = () => {
        const value = request.result
        if (!value?.contents || (value.mode & 0xf000) !== 0x8000) { resolve(null); return }
        resolve({ key, modified: new Date(value.timestamp), bytes: bytesOf(value.contents) })
      }
      request.onerror = () => reject(request.error)
    })
  } finally { db.close() }
}

/** Writes the save in one transaction. With `backup`, an existing different save is
 * kept as '<key>.before-trade'; later writes in the same session pass false so the
 * backup stays the save from before the session. */
export async function writeLibrarySave(key, bytes, { backup = true } = {}) {
  if (!key) throw new Error('This game has no save name.')
  const db = await open(true)
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      let backedUp = false, hadPrevious = false
      const read = store.get(key)
      read.onsuccess = () => {
        const previous = read.result
        const old = previous?.contents && bytesOf(previous.contents)
        hadPrevious = !!old
        if (backup && old && (old.length !== bytes.length || old.some((byte, index) => byte !== bytes[index]))) {
          store.put({ ...previous, timestamp: new Date() }, `${key}.before-trade`)
          backedUp = true
        }
        store.put({ timestamp: new Date(), mode: FILE_MODE, contents: new Uint8Array(bytes) }, key)
      }
      tx.oncomplete = () => resolve({ backedUp, hadPrevious })
      tx.onabort = () => reject(tx.error || new Error('Could not update the library save.'))
    })
  } finally { db.close() }
}
