/** Adapters for EmulatorJS EJS_STORAGE and Emscripten IDBFS (/data/saves).
 * IDBFS schema: emscripten/src/lib/libidbfs.js, FILE_DATA at version 21.
 * Never rename keys: the emulator uses the original names to find progress.
 */
export type SaveKind = 'game' | 'state'
export type SaveEntry = { key: string; bytes?: Uint8Array<ArrayBuffer>; mode?: number; modified?: string }
export type SaveBackup = { format: 'retrooasis-saves'; version: 1; kind: SaveKind; entries: SaveEntry[] }
const INDEX_KEY = '?EJS_KEYS!'
const MAX_BACKUP = 128 * 1024 * 1024
const stores = {
  game: { name: '/data/saves', store: 'FILE_DATA', version: 21 },
  state: { name: 'EmulatorJS-states', store: 'states', version: 1 },
}

function openStore(kind: SaveKind, create = false): Promise<IDBDatabase | null> {
  return new Promise((resolve, reject) => {
    const spec = stores[kind]
    const request = create ? indexedDB.open(spec.name, spec.version) : indexedDB.open(spec.name)
    let missing = false
    let blocked = false
    request.onupgradeneeded = () => {
      if (!create) {
        missing = true
        request.transaction!.abort() // A read must not create an empty emulator database.
        return
      }
      const store = request.result.createObjectStore(spec.store)
      if (kind === 'game') store.createIndex('timestamp', 'timestamp')
    }
    request.onerror = () => missing ? resolve(null) : reject(request.error)
    request.onblocked = () => {
      blocked = true
      reject(new Error('Close other game tabs, then try again.'))
    }
    request.onsuccess = () => {
      const db = request.result
      if (blocked) { db.close(); return }
      db.onversionchange = () => db.close()
      if (!db.objectStoreNames.contains(spec.store)) {
        db.close()
        reject(new Error('This emulator save format is not supported.'))
      } else resolve(db)
    }
  })
}

function bytesOf(value: unknown): Uint8Array<ArrayBuffer> {
  if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0))
  if (ArrayBuffer.isView(value)) return new Uint8Array(new Uint8Array(value.buffer, value.byteOffset, value.byteLength))
  throw new Error('This save uses an unsupported format. Its data was left untouched.')
}

export async function listSaves(kind: SaveKind): Promise<SaveEntry[]> {
  const db = await openStore(kind)
  if (!db) return []
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(stores[kind].store, 'readonly')
      const request = tx.objectStore(stores[kind].store).openCursor()
      const entries: SaveEntry[] = []
      let failure: unknown
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor) return
        try {
          if (cursor.key !== INDEX_KEY) {
            if (typeof cursor.key !== 'string') throw new Error('Unsupported save key.')
            const value = cursor.value
            const entry: SaveEntry = { key: cursor.key }
            if (kind === 'state') entry.bytes = bytesOf(value)
            else {
              entry.mode = value.mode
              entry.modified = new Date(value.timestamp).toISOString()
              if ((value.mode & 0xf000) === 0x8000) entry.bytes = bytesOf(value.contents)
              else if ((value.mode & 0xf000) !== 0x4000) throw new Error('Unsupported save file type.')
            }
            entries.push(entry)
          }
          cursor.continue()
        } catch (error) { failure = error; tx.abort() }
      }
      tx.oncomplete = () => resolve(entries.sort((a, b) => a.key.localeCompare(b.key)))
      tx.onabort = () => reject(failure ?? tx.error ?? new Error('Could not read local saves.'))
      tx.onerror = () => { /* onabort reports the transaction failure */ }
    })
  } finally { db.close() }
}

function base64(bytes: Uint8Array): string {
  let text = ''
  for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192))
  return btoa(text)
}

export function encodeBackup(kind: SaveKind, entries: SaveEntry[]): string {
  if (entries.length > 10000) throw new Error('This backup contains too many files. Download individual saves instead.')
  const text = JSON.stringify({ format: 'retrooasis-saves', version: 1, kind,
    entries: entries.map(({ bytes, ...entry }) => ({ ...entry, ...(bytes ? { data: base64(bytes) } : {}) })),
  })
  if (new Blob([text]).size > MAX_BACKUP) throw new Error('This backup is too large. Download individual saves instead.')
  return text
}

export function decodeBackup(text: string): SaveBackup {
  if (new Blob([text]).size > MAX_BACKUP) throw new Error('Backups must be smaller than 128 MB.')
  const raw = JSON.parse(text)
  if (raw?.format !== 'retrooasis-saves' || raw.version !== 1 || !['game', 'state'].includes(raw.kind) ||
      !Array.isArray(raw.entries) || raw.entries.length > 10000) throw new Error('Choose a RetroOasis save backup (.json).')
  const keys = new Set<string>()
  const entries: SaveEntry[] = raw.entries.map((item: Record<string, unknown>) => {
    if (!item || typeof item.key !== 'string' || !item.key || item.key.length > 4096 ||
        item.key === INDEX_KEY || keys.has(item.key) || /[\u0000-\u001f]/.test(item.key)) throw new Error('Invalid or duplicate save name.')
    keys.add(item.key)
    const entry: SaveEntry = { key: item.key }
    if (raw.kind === 'game') {
      if (!item.key.startsWith('/data/saves/') || item.key.slice(12).split('/').some(p => !p || p === '.' || p === '..') ||
          item.key.includes('\\')) throw new Error('Invalid save path.')
      if (!Number.isInteger(item.mode) || typeof item.mode !== 'number' || item.mode < 0 || item.mode > 0xffff ||
          ![0x8000, 0x4000].includes(item.mode & 0xf000)) throw new Error('Invalid save file type.')
      if (typeof item.modified !== 'string' || !Number.isFinite(Date.parse(item.modified))) throw new Error('Invalid save date.')
      entry.mode = item.mode
      entry.modified = item.modified
    }
    const isFile = raw.kind === 'state' || (entry.mode! & 0xf000) === 0x8000
    if (isFile) {
      // Avoid a repeated-group regexp: multi-megabyte states overflow its stack.
      if (typeof item.data !== 'string' || item.data.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(item.data)) throw new Error('Invalid save contents.')
      const padding = item.data.indexOf('=')
      if (padding !== -1 && !(
        (padding === item.data.length - 1) ||
        (padding === item.data.length - 2 && item.data.endsWith('=='))
      )) throw new Error('Invalid save contents.')
      entry.bytes = Uint8Array.from(atob(item.data), c => c.charCodeAt(0))
    } else if (item.data !== undefined) throw new Error('A save folder cannot contain file bytes.')
    return entry
  })
  // Require the complete parent tree so a fresh emulator can mount restored files.
  if (raw.kind === 'game') {
    const dirs = new Set(entries.filter(e => !e.bytes).map(e => e.key))
    for (const entry of entries) {
      const parent = entry.key.slice(0, entry.key.lastIndexOf('/'))
      if (parent !== '/data/saves' && !dirs.has(parent)) throw new Error('The backup is missing a save folder.')
    }
  }
  return { format: 'retrooasis-saves', version: 1, kind: raw.kind, entries }
}

/** One transaction covers all files and the EmulatorJS key index. */
export async function restoreBackup(backup: SaveBackup, replace: boolean): Promise<{ restored: number; skipped: number }> {
  // Validate again at the write boundary, even for callers other than the UI.
  backup = decodeBackup(encodeBackup(backup.kind, backup.entries))
  const db = await openStore(backup.kind, true)
  if (!db) throw new Error('Local save storage is unavailable.')
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(stores[backup.kind].store, 'readwrite')
      const store = tx.objectStore(stores[backup.kind].store)
      const result = { restored: 0, skipped: 0 }
      const keysRequest = store.getAllKeys()
      let failure: unknown
      keysRequest.onsuccess = () => {
        const keys = new Set(keysRequest.result)
        for (const entry of backup.entries) {
          const read = store.get(entry.key)
          read.onsuccess = () => {
            try {
              const exists = read.result !== undefined
              if (exists && backup.kind === 'game' && (read.result.mode & 0xf000) !== (entry.mode! & 0xf000)) {
                throw new Error('A save file conflicts with a folder. Nothing was restored.')
              }
              if (exists && !replace) { if (entry.bytes) result.skipped++; return }
              const value = backup.kind === 'state' ? entry.bytes : {
                mode: entry.mode, timestamp: new Date(entry.modified!), ...(entry.bytes ? { contents: entry.bytes } : {}),
              }
              store.put(value, entry.key)
              keys.add(entry.key)
              if (backup.kind === 'state') store.put([...keys].filter(k => k !== INDEX_KEY), INDEX_KEY)
              if (entry.bytes) result.restored++
            } catch (error) { failure = error; tx.abort() }
          }
        }
      }
      tx.oncomplete = () => resolve(result)
      tx.onabort = () => reject(failure ?? tx.error ?? new Error('Restore failed. No saves were changed.'))
      tx.onerror = () => { /* transaction abort is atomic */ }
    })
  } finally { db.close() }
}

export async function deleteSave(kind: SaveKind, key: string): Promise<void> {
  const db = await openStore(kind)
  if (!db) return
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(stores[kind].store, 'readwrite')
      const store = tx.objectStore(stores[kind].store)
      const read = store.get(key)
      read.onsuccess = () => {
        if (key === INDEX_KEY || (kind === 'game' && read.result && (read.result.mode & 0xf000) !== 0x8000)) {
          tx.abort(); return
        }
        store.delete(key)
        if (kind === 'state') {
          const keys = store.getAllKeys()
          keys.onsuccess = () => store.put(keys.result.filter(k => k !== INDEX_KEY && k !== key), INDEX_KEY)
        }
      }
      tx.oncomplete = () => resolve()
      tx.onabort = () => reject(tx.error ?? new Error('The save could not be deleted.'))
      tx.onerror = () => { /* onabort reports failures */ }
    })
  } finally { db.close() }
}

export const MAX_BACKUP_BYTES = MAX_BACKUP
