/** Reads a library ROM reference the same way player.html does (staged / saved
 * uploads in IndexedDB, or a hosted path) and unwraps single-ROM zip archives. */
const DB_NAME = 'retrooasis', DB_VERSION = 3
const PENDING = 'pendingRoms', LIBRARY = 'libraryRoms'

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      for (const name of ['handles', PENDING, LIBRARY]) if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('IndexedDB open failed'))
  })
}
async function fromStore(store, key, consume) {
  const db = await openDb()
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(store, consume ? 'readwrite' : 'readonly')
      const request = tx.objectStore(store).get(key)
      request.onsuccess = () => {
        const record = request.result
        if (!record?.bytes) { reject(new Error(consume ? 'This session expired. Go back and choose Trade & link again.' : 'That saved ROM isn’t on this device anymore. Add it again from Add ROM.')); return }
        if (consume) tx.objectStore(store).delete(key)
        resolve({ name: record.filename || 'game.bin', bytes: new Uint8Array(record.bytes instanceof ArrayBuffer ? record.bytes : record.bytes.buffer ?? record.bytes) })
      }
      request.onerror = () => reject(request.error || new Error('IndexedDB read failed'))
    })
  } finally { db.close() }
}

export async function readRomReference(rom) {
  if (!rom || rom.startsWith('blob:')) throw new Error('This session expired. Go back and choose Trade & link again.')
  if (rom.startsWith('idb:')) return fromStore(PENDING, rom.slice(4), true)
  if (rom.startsWith('library:')) return fromStore(LIBRARY, rom.slice(8), false)
  const response = await fetch(rom, { cache: 'no-store' })
  if (!response.ok || (response.headers.get('content-type') || '').startsWith('text/html')) throw new Error('Couldn’t find that ROM file. Host it with your site, link a folder, or use Add ROM.')
  return { name: decodeURIComponent(rom.split('/').pop()?.split('?')[0] || 'game.bin'), bytes: new Uint8Array(await response.arrayBuffer()) }
}

const ROM_EXTENSIONS = /\.(gb|gbc|cgb|sgb|gba|agb|bin)$/i
/** Returns the ROM inside a zip (stored or deflated); other files pass through unchanged. */
export async function unwrapRom({ name, bytes }) {
  if (bytes.length < 22 || bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 0x03 || bytes[3] !== 0x04) return { name, bytes }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let end = -1
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 65557); at--) if (view.getUint32(at, true) === 0x06054b50) { end = at; break }
  if (end < 0) throw new Error('That zip file is damaged.')
  const entries = []
  let at = view.getUint32(end + 16, true)
  for (let i = 0; i < view.getUint16(end + 10, true) && at + 46 <= bytes.length; i++) {
    if (view.getUint32(at, true) !== 0x02014b50) break
    const nameLength = view.getUint16(at + 28, true), extra = view.getUint16(at + 30, true), comment = view.getUint16(at + 32, true)
    entries.push({ name: new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength)), method: view.getUint16(at + 10, true),
      compressed: view.getUint32(at + 20, true), size: view.getUint32(at + 24, true), offset: view.getUint32(at + 42, true) })
    at += 46 + nameLength + extra + comment
  }
  const roms = entries.filter(entry => ROM_EXTENSIONS.test(entry.name))
  if (roms.length !== 1) throw new Error(roms.length ? 'That zip holds several ROMs. Use a zip with one game.' : 'That zip holds no Game Boy or GBA ROM.')
  const entry = roms[0]
  if (entry.size > 64 * 1024 * 1024) throw new Error('That ROM is too large.')
  const local = entry.offset
  const data = bytes.subarray(local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true)).subarray(0, entry.compressed)
  let out
  if (entry.method === 0) out = data.slice()
  else if (entry.method === 8 && typeof DecompressionStream === 'function') {
    out = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer())
  } else throw new Error('Unzip that ROM first; this compression method isn’t supported here.')
  if (out.length !== entry.size) throw new Error('That zip file is damaged.')
  return { name: entry.name.split('/').pop(), bytes: out }
}
