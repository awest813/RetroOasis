/** Battery saves as EmulatorJS stores them: Emscripten IDBFS database '/data/saves', value
 * { timestamp, mode, contents }. RetroArch sorts saves into a folder per core, so a Game
 * Boy game played in RetroOasis saves to '/data/saves/Gambatte/<ROM name without
 * extension>.srm' (the folder is its own entry). Same schema as src/lib/saves.ts; never
 * rename keys. Earlier builds looked for a flat '/data/saves/<stem>.srm', which normal play
 * never wrote; it is still read so nothing saved that way is lost. */
const DB = '/data/saves', STORE = 'FILE_DATA', VERSION = 21
const FILE_MODE = 0o100666, DIR_MODE = 0o40777
const bytesOf = value => ArrayBuffer.isView(value) ? new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)) : new Uint8Array(value)
/** The folder RetroArch uses for each system's default EmulatorJS core. */
export const CORE_SAVE_DIRS = Object.freeze({ gb: 'Gambatte', gba: 'mGBA' })

const stemOf = romName => String(romName || '').split('/').pop().replace(/\.[^.]+$/, '')
/** The flat key earlier builds used. */
export function librarySaveKey(romName) {
  const stem = stemOf(romName)
  return stem ? `${DB}/${stem}.srm` : null
}
/** Where the player itself saves this game: '/data/saves/<core folder>/<stem>.srm'. */
export function playerSaveKey(romName, system) {
  const stem = stemOf(romName), dir = CORE_SAVE_DIRS[system]
  return stem ? (dir ? `${DB}/${dir}/${stem}.srm` : `${DB}/${stem}.srm`) : null
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

const asSave = (key, value) => value?.contents && (value.mode & 0xf000) === 0x8000 ? { key, modified: new Date(value.timestamp), bytes: bytesOf(value.contents) } : null

export async function readLibrarySave(key) {
  if (!key) return null
  const db = await open(false)
  if (!db) return null
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(key)
      request.onsuccess = () => resolve(asSave(key, request.result))
      request.onerror = () => reject(request.error)
    })
  } finally { db.close() }
}

/** The newest battery save for this ROM in any core's folder (or the old flat key);
 * null when there is none. Backups ('.before-trade') never count. */
export async function findLibrarySave(romName) {
  const stem = stemOf(romName)
  if (!stem) return null
  const db = await open(false)
  if (!db) return null
  try {
    const range = IDBKeyRange.bound(`${DB}/`, `${DB}/￿`)
    const matches = await new Promise((resolve, reject) => {
      const found = []
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).openCursor(range)
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor) { resolve(found); return }
        const rest = String(cursor.key).slice(DB.length + 1).split('/')
        // '<stem>.srm' at the top level or one core folder down.
        if (rest.length <= 2 && rest[rest.length - 1] === `${stem}.srm`) { const save = asSave(cursor.key, cursor.value); if (save) found.push(save) }
        cursor.continue()
      }
      request.onerror = () => reject(request.error)
    })
    return matches.sort((a, b) => b.modified - a.modified)[0] ?? null
  } finally { db.close() }
}

/** Writes the save in one transaction, adding its core folder entry if the player never
 * made it. With `backup`, an existing different save is kept as '<key>.before-trade';
 * later writes in the same session pass false so the backup stays the save from before
 * the session. */
export async function writeLibrarySave(key, bytes, { backup = true } = {}) {
  if (!key) throw new Error('This game has no save name.')
  const db = await open(true)
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      let backedUp = false, hadPrevious = false
      const parent = key.slice(0, key.lastIndexOf('/'))
      if (parent !== DB) {
        const dir = store.get(parent)
        dir.onsuccess = () => { if (!dir.result) store.put({ timestamp: new Date(), mode: DIR_MODE }, parent) }
      }
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

/** The save to start from and where updates go: the save the player last wrote if there
 * is one, otherwise the player's own location for this system. */
export async function libraryCartSave(romName, system) {
  const save = await findLibrarySave(romName).catch(() => null)
  // A save only at the old flat key moves to the player's folder on the next write.
  const inFolder = save && save.key !== librarySaveKey(romName)
  return { save, key: inFolder ? save.key : playerSaveKey(romName, system) }
}
