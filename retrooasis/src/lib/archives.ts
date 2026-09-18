/**
 * Peek inside game archives (zip / 7z / rar) to detect the platform.
 *
 * EmulatorJS extracts these containers at play time, so RetroOasis only needs
 * to know *what's inside* to pick a system for Auto-detect — e.g. a
 * "Metal Gear Solid (PSX).zip" holding .cue + .bin files should play as PSX,
 * not fall back to the arcade mapping for .zip.
 *
 * All listing is header-only (no entry contents are decompressed):
 *  - zip: central directory at the end of the file (incl. ZIP64).
 *  - rar: RAR4/RAR5 block walk from the start (names are never compressed;
 *    header-encrypted archives are reported as incomplete).
 *  - 7z: signature header + header blob. Plain headers are parsed directly;
 *    compressed headers (7-Zip default) fall back to EmulatorJS's own
 *    extract7z worker from data/compression/, when available.
 */

import {
  isArchiveFile,
  platformForArchiveEntry,
  platformFromExtension,
} from './cores'
import { detectIsoPlatform } from './iso'
import { getEjsChannel } from './store'

export type ArchiveFormat = 'zip' | '7z' | 'rar'

export interface ArchivePeek {
  format: ArchiveFormat
  names: string[]
  /** false when the listing is best-effort (unreadable / worker fallback failed). */
  complete: boolean
}

const MAX_ENTRIES = 400
const MAX_ZIP_TAIL = 132_000 // EOCD (22) + up to 64KB comment + ZIP64 records
const MAX_RAR_BYTES = 4_000_000
const MAX_7Z_HEADER_BYTES = 32_000_000
/** Early-exit point for the extract worker once detection is conclusive. */
const MIN_WORKER_NAMES = 24

export function archiveFormatFromBytes(head: Uint8Array): ArchiveFormat | null {
  if (head.length >= 4 && head[0] === 0x50 && head[1] === 0x4b) {
    if (head[2] === 0x03 || head[2] === 0x05 || head[2] === 0x07) return 'zip'
    return null
  }
  if (
    head.length >= 6 &&
    head[0] === 0x37 &&
    head[1] === 0x7a &&
    head[2] === 0xbc &&
    head[3] === 0xaf &&
    head[4] === 0x27 &&
    head[5] === 0x1c
  ) {
    return '7z'
  }
  if (
    head.length >= 7 &&
    head[0] === 0x52 &&
    head[1] === 0x61 &&
    head[2] === 0x72 &&
    head[3] === 0x21 &&
    head[4] === 0x1a &&
    head[5] === 0x07 &&
    (head[6] === 0x00 || (head[6] === 0x01 && head[7] === 0x00))
  ) {
    return 'rar'
  }
  return null
}

/** Peek into a game archive; returns null when the blob isn't a supported archive. */
export async function peekArchive(blob: Blob): Promise<ArchivePeek | null> {
  let head: Uint8Array
  try {
    head = new Uint8Array(await blob.slice(0, 8).arrayBuffer())
  } catch {
    return null
  }
  const format = archiveFormatFromBytes(head)
  if (!format) return null

  try {
    if (format === 'zip') {
      const names = await listZipEntries(blob)
      return names ? { format, names, complete: true } : null
    }
    if (format === 'rar') {
      const result = await listRarEntries(blob)
      return result ? { format, ...result } : null
    }
    const native = await list7zEntries(blob)
    if (native && native.complete) return { format, names: native.names, complete: true }
    const viaWorker = await list7zViaWorker(blob)
    return { format, names: viaWorker ?? [], complete: !!viaWorker }
  } catch {
    return null
  }
}

/** Platform votes from entry names; null when nothing recognizable is inside. */
export function platformFromArchiveEntries(names: string[]): string | null {
  const votes = new Map<string, number>()
  for (const raw of names) {
    const name = raw.replace(/\\/g, '/')
    const segments = name.split('/')
    if (!segments[segments.length - 1]) continue // directory entry
    if (segments.some((s) => s === '__MACOSX' || s.startsWith('.'))) continue
    const platform = platformForArchiveEntry(name)
    if (platform) votes.set(platform, (votes.get(platform) ?? 0) + 1)
  }
  if (votes.size === 0) return null
  let best: string | null = null
  let bestCount = 0
  for (const [platform, count] of votes) {
    if (
      count > bestCount ||
      (count === bestCount &&
        best !== null &&
        PLATFORM_PRIORITY.indexOf(platform) < PLATFORM_PRIORITY.indexOf(best))
    ) {
      best = platform
      bestCount = count
    }
  }
  return best
}

/** Disc-heavy systems beat generic ones when entry counts tie. */
const PLATFORM_PRIORITY = [
  'psx',
  'segaCD',
  'psp',
  'segaSaturn',
  '3do',
  'pcfx',
  'pce',
  'dos',
  'amiga',
  'c64',
  'snes',
  'nes',
  'gba',
  'gb',
  'n64',
  'nds',
  'vb',
  '3ds',
  'segaMD',
  'segaMS',
  'segaGG',
  'sega32x',
  'arcade',
  'mame',
]

function isIsoLikeFilename(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase()
  return ext === 'iso' || ext === 'img'
}

/**
 * Detect the platform for a picked ROM file: extension first, then the
 * archive contents for .zip/.7z/.rar. When an archive lists nothing
 * recognizable (FBNeo/MAME sets use dump extensions of their own) the outer
 * extension default applies (.zip/.7z → arcade).
 *
 * `.iso` / `.img` are shared by PSP, PSX, Sega CD, 3DO, and DOS — peek the
 * ISO 9660 root when Auto-detect needs a real answer. A generic ISO with no
 * fingerprint returns null so the user can pick a system.
 */
export async function detectRomPlatform(file: File): Promise<string | null> {
  const extPlatform = platformFromExtension(file.name)
  if (isArchiveFile(file.name)) {
    const peek = await peekArchive(file)
    const fromEntries = peek ? platformFromArchiveEntries(peek.names) : null
    return fromEntries ?? extPlatform
  }

  if (isIsoLikeFilename(file.name)) {
    try {
      const iso = await detectIsoPlatform(file)
      if (iso) return iso
    } catch {
      /* fall through */
    }
    // Bare .iso is too ambiguous to assume PSP.
    if (file.name.split('.').pop()?.toLowerCase() === 'iso') return null
  }

  return extPlatform
}

// ---------------------------------------------------------------------------
// ZIP — End of Central Directory + central directory entries
// ---------------------------------------------------------------------------

async function listZipEntries(blob: Blob): Promise<string[] | null> {
  const EOCD = 0x06054b50
  const CEN = 0x02014b50
  const ZIP64_LOC = 0x07064b50
  const ZIP64_EOCD = 0x06064b50

  const tailSize = Math.min(blob.size, MAX_ZIP_TAIL)
  const tail = new DataView(await blob.slice(blob.size - tailSize).arrayBuffer())

  let eocd = -1
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (tail.getUint32(i, true) === EOCD) {
      eocd = i
      break
    }
  }
  if (eocd < 0) return null

  let cdSize = tail.getUint32(eocd + 12, true)
  let cdOffset = tail.getUint32(eocd + 16, true)
  if (cdOffset === 0xffffffff || cdSize === 0xffffffff || tail.getUint16(eocd + 4, true) === 0xffff) {
    const lo = eocd - 20
    if (lo < 0 || tail.getUint32(lo, true) !== ZIP64_LOC) return null
    const z64Offset = Number(tail.getBigUint64(lo + 8, true))
    const z64 = new DataView(await blob.slice(z64Offset, z64Offset + 56).arrayBuffer())
    if (z64.byteLength < 56 || z64.getUint32(0, true) !== ZIP64_EOCD) return null
    cdSize = Number(z64.getBigUint64(40, true))
    cdOffset = Number(z64.getBigUint64(48, true))
  }
  if (cdOffset > Number.MAX_SAFE_INTEGER || cdOffset + cdSize > blob.size) return null

  const cd = new DataView(await blob.slice(cdOffset, cdOffset + cdSize).arrayBuffer())
  const names: string[] = []
  let p = 0
  while (p + 46 <= cd.byteLength && names.length < MAX_ENTRIES) {
    if (cd.getUint32(p, true) !== CEN) break
    const nameLen = cd.getUint16(p + 28, true)
    const extraLen = cd.getUint16(p + 30, true)
    const commentLen = cd.getUint16(p + 32, true)
    names.push(
      new TextDecoder().decode(new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nameLen)),
    )
    p += 46 + nameLen + extraLen + commentLen
  }
  return names
}

// ---------------------------------------------------------------------------
// RAR — RAR5 and RAR4 block walks (file names are stored in plain headers)
// ---------------------------------------------------------------------------

/** Little-endian 7-bit vint (RAR5 and 7z both use this layout). */
function readVint(b: Uint8Array, pos: number): { value: number; next: number } | null {
  let value = 0
  let scale = 1
  for (let i = 0; i < 10; i++) {
    const index = pos + i
    if (index >= b.length || scale > Number.MAX_SAFE_INTEGER) return null
    const byte = b[index]
    value += (byte & 0x7f) * scale
    scale *= 128
    if ((byte & 0x80) === 0) return { value, next: index + 1 }
  }
  return null
}

async function listRarEntries(
  blob: Blob,
): Promise<{ names: string[]; complete: boolean } | null> {
  const head = new Uint8Array(await blob.slice(0, 8).arrayBuffer())
  if (head.length < 7 || head[5] !== 0x07) return null
  const isRar5 = head[6] === 0x01
  const buf = new Uint8Array(
    await blob.slice(0, Math.min(blob.size, MAX_RAR_BYTES)).arrayBuffer(),
  )
  return isRar5 ? walkRar5(buf) : walkRar4(buf)
}

function walkRar5(b: Uint8Array): { names: string[]; complete: boolean } {
  const names: string[] = []
  let p = 8
  while (p + 4 < b.length && names.length < MAX_ENTRIES) {
    const headerSize = readVint(b, p + 4)
    const type = headerSize && readVint(b, headerSize.next)
    const flags = type && readVint(b, type.next)
    if (!headerSize || !type || !flags || headerSize.value <= 0) {
      return { names, complete: false }
    }
    let q = flags.next
    if (flags.value & 0x0001) {
      const extra = readVint(b, q)
      if (!extra) return { names, complete: false }
      q = extra.next
    }
    if (flags.value & 0x0002) {
      const data = readVint(b, q)
      if (!data) return { names, complete: false }
      q = data.next
    }
    if (type.value === 5) return { names, complete: false } // header-encrypted
    if (type.value === 2) {
      const fileFlags = readVint(b, q)
      const unpSize = fileFlags && readVint(b, fileFlags.next)
      const attrs = unpSize && readVint(b, unpSize.next)
      if (!fileFlags || !unpSize || !attrs) return { names, complete: false }
      let r = attrs.next
      if (fileFlags.value & 0x0002) r += 4 // mtime
      if (fileFlags.value & 0x0004) r += 4 // crc32
      const compInfo = readVint(b, r)
      const hostOs = compInfo && readVint(b, compInfo.next)
      const nameLen = hostOs && readVint(b, hostOs.next)
      if (!compInfo || !hostOs || !nameLen || nameLen.next + nameLen.value > b.length) {
        return { names, complete: false }
      }
      names.push(
        new TextDecoder().decode(b.subarray(nameLen.next, nameLen.next + nameLen.value)),
      )
    }
    p = p + 4 + headerSize.value
  }
  return { names, complete: true }
}

function walkRar4(b: Uint8Array): { names: string[]; complete: boolean } {
  const names: string[] = []
  let p = 7
  while (p + 7 <= b.length && names.length < MAX_ENTRIES) {
    const type = b[p + 2]
    const flags = b[p + 3] | (b[p + 4] << 8)
    const size = b[p + 5] | (b[p + 6] << 8)
    if (size < 7) return { names, complete: false }
    if (type === 0x73) {
      if (flags & 0x0080) return { names, complete: false } // header-encrypted
    } else if (type === 0x74) {
      const nameSize = p + 26 < b.length ? b[p + 26] | (b[p + 27] << 8) : 0
      // Name sits after the fixed fields (+8 high-size bytes for LHD_LARGE).
      const nameStart = p + 32 + (flags & 0x0100 ? 8 : 0)
      if (nameSize > 0 && nameStart + nameSize <= b.length) {
        names.push(new TextDecoder().decode(b.subarray(nameStart, nameStart + nameSize)))
      }
    } else if (type === 0x7b) {
      break // end of archive
    }
    p += size
  }
  return { names, complete: true }
}

// ---------------------------------------------------------------------------
// 7z — signature header + (usually compressed) header blob
// ---------------------------------------------------------------------------

async function list7zEntries(
  blob: Blob,
): Promise<{ names: string[]; complete: boolean } | null> {
  const sig = new DataView(await blob.slice(0, 32).arrayBuffer())
  if (sig.byteLength < 32) return null
  const nextOffset = Number(sig.getBigUint64(12, true))
  const nextSize = Number(sig.getBigUint64(20, true))
  if (!Number.isSafeInteger(nextOffset) || !Number.isSafeInteger(nextSize)) return null
  if (nextSize <= 0 || nextSize > MAX_7Z_HEADER_BYTES) return { names: [], complete: false }
  if (32 + nextOffset + nextSize > blob.size) return { names: [], complete: false }

  const header = new Uint8Array(
    await blob.slice(32 + nextOffset, 32 + nextOffset + nextSize).arrayBuffer(),
  )
  if (header.length === 0) return { names: [], complete: false }
  // 0x17 = kEncodedHeader (compressed); 0x01 = kHeader (plain).
  if (header[0] !== 0x01) return { names: [], complete: false }
  return parse7zPlainHeader(header)
}

function parse7zPlainHeader(h: Uint8Array): { names: string[]; complete: boolean } {
  const names: string[] = []
  let sawFiles = false
  let p = 1

  while (p < h.length) {
    const prop = readVint(h, p)
    if (!prop) return { names, complete: false }
    p = prop.next

    if (prop.value === 0x00) break // kEnd

    if (prop.value === 0x02) {
      // ArchiveProperties: {type vint, size vint, data} until type 0.
      for (;;) {
        const t = readVint(h, p)
        const s = t && readVint(h, t.next)
        if (!t || !s || s.next + s.value > h.length) return { names, complete: false }
        p = s.next + s.value
        if (t.value === 0) break
      }
      continue
    }

    if (prop.value === 0x03 || prop.value === 0x04) {
      // AdditionalStreamsInfo / MainStreamsInfo — skip without extraction.
      const next = skipStreamsInfo(h, p)
      if (next == null) return { names, complete: false }
      p = next
      continue
    }

    if (prop.value === 0x05) {
      // FilesInfo: numFiles, then {property vint, size vint, data} until 0.
      const numFiles = readVint(h, p)
      if (!numFiles) return { names, complete: false }
      p = numFiles.next
      sawFiles = true
      let namesFound = 0
      for (;;) {
        const t = readVint(h, p)
        if (!t) return { names, complete: false }
        p = t.next
        if (t.value === 0) break
        const s = readVint(h, p)
        if (!s || s.next + s.value > h.length) return { names, complete: false }
        const dataStart = s.next
        if (t.value === 0x11 && namesFound < MAX_ENTRIES) {
          // kName: external flag byte, then UTF-16LE NUL-terminated names.
          if (h[dataStart] === 0) {
            const text = new TextDecoder('utf-16le').decode(
              h.subarray(dataStart + 1, dataStart + s.value),
            )
            for (const part of text.split('\x00')) {
              if (part && namesFound < MAX_ENTRIES) {
                names.push(part)
                namesFound += 1
              }
            }
          }
        }
        p = dataStart + s.value
      }
      continue
    }

    return { names, complete: false } // unknown property — can't skip safely
  }
  return { names, complete: sawFiles }
}

function skipStreamsInfo(h: Uint8Array, p: number): number | null {
  let pos = p
  let numFolders = 0

  let id = readVint(h, pos)
  if (!id) return null

  if (id.value === 0x06) {
    // PackInfo: packPos, numPack, {kSize sizes | kCRC digests} until kEnd.
    pos = id.next
    const packPos = readVint(h, pos)
    const numPack = packPos && readVint(h, packPos.next)
    if (!packPos || !numPack) return null
    pos = numPack.next
    for (;;) {
      const t = readVint(h, pos)
      if (!t) return null
      pos = t.next
      if (t.value === 0) break
      if (t.value === 0x09) {
        for (let i = 0; i < numPack.value; i++) {
          const s = readVint(h, pos)
          if (!s) return null
          pos = s.next
        }
      } else if (t.value === 0x0a) {
        const after = skipDigests(h, pos, numPack.value)
        if (after == null) return null
        pos = after
      } else {
        return null
      }
    }
    id = readVint(h, pos)
    if (!id) return null
  }

  if (id.value === 0x07) {
    // UnpackInfo: kFolder folders, kCodersUnpackSize sizes, [kCRC], kEnd.
    pos = id.next
    const folderProp = readVint(h, pos)
    if (!folderProp || folderProp.value !== 0x0b) return null
    pos = folderProp.next
    const numFoldersV = readVint(h, pos)
    if (!numFoldersV) return null
    numFolders = numFoldersV.value
    pos = numFoldersV.next
    if (h[pos] !== 0) return null // external folders unsupported
    pos += 1
    let totalOut = 0
    for (let f = 0; f < numFolders; f++) {
      const out = skipFolder(h, pos)
      if (out == null) return null
      totalOut += out.outStreams
      pos = out.next
    }
    const sizeProp = readVint(h, pos)
    if (!sizeProp || sizeProp.value !== 0x0c) return null
    pos = sizeProp.next
    for (let i = 0; i < totalOut; i++) {
      const s = readVint(h, pos)
      if (!s) return null
      pos = s.next
    }
    let end = readVint(h, pos)
    if (!end) return null
    if (end.value === 0x0a) {
      const after = skipDigests(h, end.next, numFolders)
      if (after == null) return null
      pos = after
      end = readVint(h, pos)
      if (!end) return null
    }
    if (end.value !== 0) return null
    pos = end.next
    id = readVint(h, pos)
    if (!id) return null
  }

  if (id.value === 0x08) {
    // SubStreamsInfo: [kNumUnpackStreams counts] [kSize last-deltas] kEnd.
    // kCRC needs folder-digest context we skipped — bail to the worker there.
    pos = id.next
    const counts: number[] = []
    let t = readVint(h, pos)
    if (!t) return null
    if (t.value === 0x0d) {
      pos = t.next
      for (let f = 0; f < numFolders; f++) {
        const n = readVint(h, pos)
        if (!n) return null
        counts.push(n.value)
        pos = n.next
      }
      t = readVint(h, pos)
      if (!t) return null
    }
    if (t.value === 0x09) {
      if (counts.length === 0) return null
      pos = t.next
      for (const subCount of counts) {
        if (subCount <= 1) continue
        for (let i = 0; i < subCount - 1; i++) {
          const s = readVint(h, pos)
          if (!s) return null
          pos = s.next
        }
      }
      t = readVint(h, pos)
      if (!t) return null
    }
    if (t.value === 0x0a || t.value !== 0) return null
    return t.next
  }

  // Consume StreamsInfo kEnd so the caller sees kFilesInfo / header kEnd.
  if (id.value === 0) return id.next
  return null
}

function skipDigests(h: Uint8Array, pos: number, count: number): number | null {
  // 7z Digests: BYTE AllAreDefined; if 0, a MSB-first bit vector; then UINT32 CRC
  // for each defined item. AllAreDefined != 0 means every CRC is present.
  if (pos >= h.length || count < 0) return null
  const allDefined = h[pos]
  let p = pos + 1
  const defined: boolean[] = []
  if (allDefined !== 0) {
    for (let i = 0; i < count; i++) defined.push(true)
  } else {
    let mask = 0
    let bits = 0
    for (let i = 0; i < count; i++) {
      if (mask === 0) {
        if (p >= h.length) return null
        bits = h[p]
        p += 1
        mask = 0x80
      }
      defined.push((bits & mask) !== 0)
      mask >>= 1
    }
  }
  for (const isDefined of defined) {
    if (!isDefined) continue
    if (p + 4 > h.length) return null
    p += 4
  }
  return p
}

/** Skip one Folder; returns out-stream count so unpack sizes can be skipped. */
function skipFolder(h: Uint8Array, p: number): { next: number; outStreams: number } | null {
  const numCoders = readVint(h, p)
  if (!numCoders) return null
  let pos = numCoders.next
  let outStreams = 0
  for (let c = 0; c < numCoders.value; c++) {
    if (pos >= h.length) return null
    const flags = h[pos]
    pos += 1
    const idSize = flags & 0x0f
    pos += idSize
    if (pos > h.length) return null
    let out = 1
    if (flags & 0x10) {
      const n = readVint(h, pos)
      if (!n) return null
      out = n.value
      pos = n.next
    }
    if (flags & 0x20) {
      const propsSize = readVint(h, pos)
      if (!propsSize) return null
      pos = propsSize.next + propsSize.value
      if (pos > h.length) return null
    }
    outStreams += out
  }
  if (outStreams > 1) {
    const numBindPairs = readVint(h, pos)
    if (!numBindPairs) return null
    pos = numBindPairs.next
    for (let i = 0; i < numBindPairs.value * 2; i++) {
      const idx = readVint(h, pos)
      if (!idx) return null
      pos = idx.next
    }
    const numPacked = readVint(h, pos)
    if (!numPacked) return null
    pos = numPacked.next
    for (let i = 0; i < numPacked.value; i++) {
      const idx = readVint(h, pos)
      if (!idx) return null
      pos = idx.next
    }
  }
  return { next: pos, outStreams }
}

// ---------------------------------------------------------------------------
// 7z compressed headers — reuse EmulatorJS's extract worker (data/compression)
// ---------------------------------------------------------------------------

let workerUrlCache: { channel: string; url: string } | null = null

function extract7zWorkerUrl(): string | null {
  const channel = getEjsChannel()
  if (workerUrlCache?.channel === channel) return workerUrlCache.url
  const url =
    channel === 'local'
      ? 'data/compression/extract7z.js'
      : `https://cdn.emulatorjs.org/${channel}/data/compression/extract7z.js`
  workerUrlCache = { channel, url }
  return url
}

async function list7zViaWorker(blob: Blob): Promise<string[] | null> {
  let base: string | null
  try {
    base = extract7zWorkerUrl()
  } catch {
    return null // localStorage unavailable (non-browser) — no worker fallback
  }
  if (!base) return null

  let worker: Worker
  let blobUrl: string | null = null
  try {
    if (base.startsWith('http')) {
      // Cross-origin CDN script: classic workers can importScripts() it.
      const shim = `importScripts(${JSON.stringify(base)});`
      blobUrl = URL.createObjectURL(new Blob([shim], { type: 'text/javascript' }))
      worker = new Worker(blobUrl)
    } else {
      worker = new Worker(base)
    }
  } catch {
    if (blobUrl) URL.revokeObjectURL(blobUrl)
    return null
  }

  const release = () => {
    worker.terminate()
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl)
      blobUrl = null
    }
  }

  let bytes: ArrayBuffer
  try {
    bytes = await blob.arrayBuffer()
  } catch {
    release()
    return null
  }

  return new Promise((resolve) => {
    const names: string[] = []
    let settled = false
    const finish = (ok: boolean) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      release()
      resolve(ok ? names : null)
    }
    const timer = window.setTimeout(() => finish(names.length > 0), 30_000)
    worker.onmessage = (event: MessageEvent) => {
      const data = event.data as { t?: number; file?: string } | null
      if (!data) return
      if (data.t === 2 && typeof data.file === 'string') {
        names.push(data.file)
        // Enough signal to decide (or clearly not) — stop extracting early.
        if (platformFromArchiveEntries(names) || names.length >= MIN_WORKER_NAMES) {
          finish(true)
        }
      } else if (data.t === 1) {
        finish(true)
      }
    }
    worker.onerror = () => finish(names.length > 0)
    worker.postMessage(bytes, [bytes])
  })
}
