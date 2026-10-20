/**
 * RetroAchievements ROM hashes, following rcheevos (the same rules RetroArch uses).
 * Cartridge systems are hashed here. Disc systems need the boot executable inside the
 * image; those stay unmatched rather than guessed from a whole-file checksum.
 */

import { Md5, md5Hex, md5Text } from './md5'

/** rcheevos refuses to hash more than the first 64MB of a file. */
export const RA_HASH_CAP = 64 * 1024 * 1024

export type RaHashKind = 'whole' | 'nes' | 'snes' | 'pce' | 'lynx' | 'a7800' | 'n64' | 'nds' | 'arcade' | 'neo'

export interface RaHashPlan {
  kind: RaHashKind
  /** Tried in order. Game Boy and Game Boy Color share a shelf but not a console id. */
  consoleIds: number[]
  /** Arcade sets are identified by filename, not bytes. */
  arcadeName?: string
}

export interface ByteSource {
  size: number
  read(start: number, end: number): Promise<Uint8Array>
}

const FBNEO_FOLDERS = new Set([
  'nes', 'fds', 'sms', 'msx', 'ngp', 'pce', 'chf', 'sgx', 'tg16', 'msx1', 'neocd', 'coleco',
  'sg1000', 'genesis', 'gamegear', 'megadriv', 'pcengine', 'channelf', 'spectrum', 'megadrive',
  'supergrafx', 'zxspectrum', 'mastersystem', 'colecovision',
])

const DISC_REASON = 'Disc games can’t be matched yet. RetroAchievements identifies them from the disc’s boot file, which this check doesn’t read.'

const UNSUPPORTED: Record<string, string> = {
  psx: DISC_REASON,
  psp: DISC_REASON,
  segaCD: DISC_REASON,
  segaSaturn: DISC_REASON,
  '3do': DISC_REASON,
  pcfx: DISC_REASON,
  '3ds': '3DS games can’t be matched yet.',
  dos: 'DOS games can’t be matched yet.',
  amiga: 'Amiga disks can’t be matched yet.',
  atari5200: 'Atari 5200 games can’t be matched yet.',
  c128: 'Commodore 128 games can’t be matched yet.',
  vic20: 'VIC-20 games can’t be matched yet.',
  plus4: 'Plus/4 games can’t be matched yet.',
  pet: 'Commodore PET games can’t be matched yet.',
}

function leaf(path: string): string {
  const name = path.replace(/\\/g, '/').split('/').pop() || path
  try {
    return decodeURIComponent(name)
  } catch {
    return name
  }
}

function extOf(path: string): string {
  const name = leaf(path).toLowerCase()
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot + 1) : ''
}

/** FBNeo includes a few folder names in the arcade hash (`nes/smb.zip` → `nes_smb`). */
export function arcadeHashName(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  const filename = leaf(normalized)
  const dot = filename.lastIndexOf('.')
  const stem = dot > 0 ? filename.slice(0, dot) : filename
  const parts = normalized.split('/').filter(Boolean)
  const parent = parts.length >= 2 ? parts[parts.length - 2].toLowerCase() : ''
  if (parent && FBNEO_FOLDERS.has(parent)) return `${parent}_${stem}`
  return stem
}

/** How this shelf’s file is hashed, or a sentence explaining why it can’t be. */
export function planRaHash(platform: string, path: string): RaHashPlan | { reason: string } {
  const ext = extOf(path)
  if (ext === 'unif' || ext === 'unf') return { reason: 'UNIF ROM boards can’t be matched yet.' }
  if ((ext === 'chd' || ext === 'cue' || ext === 'gdi' || ext === 'ccd' || ext === 'cdi' || ext === 'toc' || ext === 'mds' || ext === 'nrg') && platform !== 'arcade' && platform !== 'mame') {
    return { reason: DISC_REASON }
  }
  if (UNSUPPORTED[platform]) return { reason: UNSUPPORTED[platform] }

  switch (platform) {
    case 'nes':
      return ext === 'fds' ? { kind: 'nes', consoleIds: [81, 7] } : { kind: 'nes', consoleIds: [7] }
    case 'snes':
      return { kind: 'snes', consoleIds: [3] }
    case 'gb':
      return ext === 'gbc' ? { kind: 'whole', consoleIds: [6, 4] } : { kind: 'whole', consoleIds: [4, 6] }
    case 'gba':
      return { kind: 'whole', consoleIds: [5] }
    case 'n64':
      return { kind: 'n64', consoleIds: [2] }
    case 'nds':
      return { kind: 'nds', consoleIds: [18, 78] }
    case 'vb':
      return { kind: 'whole', consoleIds: [28] }
    case 'segaMD':
      return { kind: 'whole', consoleIds: [1] }
    case 'segaMS':
      return { kind: 'whole', consoleIds: [11] }
    case 'segaGG':
      return { kind: 'whole', consoleIds: [15] }
    case 'sega32x':
      return { kind: 'whole', consoleIds: [10] }
    case 'atari2600':
      return { kind: 'whole', consoleIds: [25] }
    case 'atari7800':
      return { kind: 'a7800', consoleIds: [51] }
    case 'lynx':
      return { kind: 'lynx', consoleIds: [13] }
    case 'jaguar':
      return { kind: 'whole', consoleIds: [17] }
    case 'pce':
      return { kind: 'pce', consoleIds: [8] }
    case 'ngp':
      return { kind: 'whole', consoleIds: [14] }
    case 'ws':
      return { kind: 'whole', consoleIds: [53] }
    case 'coleco':
      return { kind: 'whole', consoleIds: [44] }
    case 'c64':
      return { kind: 'whole', consoleIds: [30] }
    case 'intv':
      return { kind: 'whole', consoleIds: [45] }
    case 'arcade':
    case 'mame':
      return ext === 'neo'
        ? { kind: 'neo', consoleIds: [27] }
        : { kind: 'arcade', consoleIds: [27], arcadeName: arcadeHashName(path) }
    default:
      return { reason: 'This system can’t be matched with RetroAchievements yet.' }
  }
}

function startsWith(bytes: Uint8Array, text: string, offset = 0): boolean {
  if (bytes.length < offset + text.length) return false
  for (let i = 0; i < text.length; i++) {
    if (bytes[offset + i] !== text.charCodeAt(i)) return false
  }
  return true
}

function u32(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] ?? 0) |
    ((bytes[offset + 1] ?? 0) << 8) |
    ((bytes[offset + 2] ?? 0) << 16) |
    ((bytes[offset + 3] ?? 0) << 24)
  ) >>> 0
}

/** First 64MB, matching rcheevos’ buffer cap. `cap` is overridable in tests. */
export async function readCapped(source: ByteSource, cap = RA_HASH_CAP): Promise<Uint8Array> {
  const n = Math.min(Math.max(0, source.size), cap)
  if (n === 0) return new Uint8Array(0)
  return source.read(0, n)
}

function hashRange(bytes: Uint8Array, start = 0, end = bytes.length): string {
  const slice = start === 0 && end === bytes.length ? bytes : bytes.subarray(start, end)
  return md5Hex(slice)
}

/**
 * Hash ROM bytes that are already in memory.
 * Returns null when the bytes aren’t a ROM of this kind (N64 / DS checks).
 */
export function hashRomBytes(bytes: Uint8Array, kind: RaHashKind, cap = RA_HASH_CAP): string | null {
  const capped = bytes.length > cap ? bytes.subarray(0, cap) : bytes
  switch (kind) {
    case 'whole':
    case 'arcade':
    case 'neo':
      return hashRange(capped)
    case 'nes':
      // rcheevos only strips a header when the file is longer than the header itself.
      if (capped.length > 16 && (startsWith(capped, 'NES\x1a') || startsWith(capped, 'FDS\x1a'))) return hashRange(capped, 16)
      return hashRange(capped)
    case 'snes': {
      const aligned = Math.floor(capped.length / 0x2000) * 0x2000
      if (capped.length - aligned === 512) return hashRange(capped, 512)
      return hashRange(capped)
    }
    case 'pce':
      // The header has no signature. rcheevos treats any size with bit 9 set as headered.
      if (capped.length & 512) return hashRange(capped, 512)
      return hashRange(capped)
    case 'lynx':
      if (capped.length > 64 && startsWith(capped, 'LYNX\0')) return hashRange(capped, 64)
      return hashRange(capped)
    case 'a7800':
      if (capped.length > 128 && startsWith(capped, 'ATARI7800', 1)) return hashRange(capped, 128)
      return hashRange(capped)
    case 'n64':
      return hashN64(capped)
    case 'nds':
      return hashNds(bytes)
    default:
      return null
  }
}

function hashN64(bytes: Uint8Array): string | null {
  if (!bytes.length) return null
  const first = bytes[0]
  const v64 = first === 0x37
  const n64 = first === 0x40
  if (first !== 0x80 && !v64 && !n64 && first !== 0xe8 && first !== 0x22) return null
  const out = bytes.slice()
  const n = out.length & ~3
  if (v64) {
    for (let i = 0; i < n; i += 2) {
      const swap = out[i]
      out[i] = out[i + 1]
      out[i + 1] = swap
    }
  } else if (n64) {
    for (let i = 0; i < n; i += 4) {
      const a = out[i]
      const b = out[i + 1]
      out[i] = out[i + 3]
      out[i + 1] = out[i + 2]
      out[i + 2] = b
      out[i + 3] = a
    }
  }
  return md5Hex(out)
}

function isSuperCard(header: Uint8Array): boolean {
  return header.length >= 0xb4 &&
    header[0] === 0x2e && header[1] === 0 && header[2] === 0 && header[3] === 0xea &&
    header[0xb0] === 0x44 && header[0xb1] === 0x46 && header[0xb2] === 0x96 && header[0xb3] === 0
}

interface NdsRegions {
  arm9Addr: number
  arm9Size: number
  arm7Addr: number
  arm7Size: number
  iconAddr: number
}

function parseNdsHeader(header: Uint8Array): NdsRegions | null {
  if (header.length < 0x160) return null
  const arm9Size = u32(header, 0x2c)
  const arm7Size = u32(header, 0x3c)
  if (arm9Size + arm7Size > 16 * 1024 * 1024) return null
  if (arm9Size === 0 || arm7Size === 0) return null
  return {
    arm9Addr: u32(header, 0x20),
    arm9Size,
    arm7Addr: u32(header, 0x30),
    arm7Size,
    iconAddr: u32(header, 0x68),
  }
}

function digestNds(header: Uint8Array, arm9: Uint8Array, arm7: Uint8Array, icon: Uint8Array): string {
  const hash = new Md5()
  hash.update(header.subarray(0, 0x160))
  hash.update(arm9)
  hash.update(arm7)
  hash.update(icon)
  return hash.hex()
}

function regionFits(fileSize: number, start: number, length: number): boolean {
  return Number.isFinite(start) && Number.isFinite(length) && start >= 0 && length >= 0 && start + length <= fileSize
}

function hashNds(bytes: Uint8Array): string | null {
  if (bytes.length < 0x160) return null
  let offset = 0
  if (isSuperCard(bytes)) {
    offset = 512
    if (bytes.length < offset + 0x160) return null
  }
  const header = bytes.subarray(offset, offset + 512)
  const regions = parseNdsHeader(header)
  if (!regions) return null
  const arm9 = take(bytes, offset + regions.arm9Addr, regions.arm9Size)
  const arm7 = take(bytes, offset + regions.arm7Addr, regions.arm7Size)
  if (!arm9 || !arm7) return null
  // Homebrew sometimes ends before a full 2560-byte icon. rcheevos zero-pads the rest.
  const icon = new Uint8Array(0xa00)
  const iconStart = offset + regions.iconAddr
  if (iconStart >= 0 && iconStart < bytes.length) {
    icon.set(bytes.subarray(iconStart, Math.min(bytes.length, iconStart + 0xa00)))
  }
  return digestNds(header, arm9, arm7, icon)
}

/** Hash a DS ROM from slices so a 128MB cart is not loaded whole. */
async function hashNdsSource(source: ByteSource): Promise<string | null> {
  if (source.size < 0x160) return null
  let header = await source.read(0, 512)
  if (header.length < 0x160) return null
  let offset = 0
  if (isSuperCard(header)) {
    offset = 512
    if (source.size < offset + 0x160) return null
    header = await source.read(offset, offset + 512)
    if (header.length < 0x160) return null
  }
  const regions = parseNdsHeader(header)
  if (!regions) return null
  const arm9Start = offset + regions.arm9Addr
  const arm7Start = offset + regions.arm7Addr
  if (!regionFits(source.size, arm9Start, regions.arm9Size) || !regionFits(source.size, arm7Start, regions.arm7Size)) return null
  const arm9 = await source.read(arm9Start, arm9Start + regions.arm9Size)
  const arm7 = await source.read(arm7Start, arm7Start + regions.arm7Size)
  if (arm9.length !== regions.arm9Size || arm7.length !== regions.arm7Size) return null
  const icon = new Uint8Array(0xa00)
  const iconStart = offset + regions.iconAddr
  if (iconStart >= 0 && iconStart < source.size) {
    const got = await source.read(iconStart, Math.min(source.size, iconStart + 0xa00))
    icon.set(got.subarray(0, 0xa00))
  }
  return digestNds(header, arm9, arm7, icon)
}

function take(bytes: Uint8Array, start: number, length: number): Uint8Array | null {
  if (!Number.isFinite(start) || !Number.isFinite(length) || start < 0 || length < 0) return null
  if (start + length > bytes.length) return null
  return bytes.subarray(start, start + length)
}

const SKIP_ZIP_EXT = new Set(['txt', 'nfo', 'cue', 'm3u', 'jpg', 'jpeg', 'png', 'gif', 'pdf', 'xml', 'html', 'diz', 'sfv', 'url'])

interface ZipEntry {
  name: string
  method: number
  compressedSize: number
  uncompressedSize: number
  localOffset: number
  encrypted: boolean
}

function pickZipEntry(entries: ZipEntry[]): ZipEntry | null {
  const files = entries.filter((entry) => entry.name && !entry.name.endsWith('/') && entry.uncompressedSize > 0)
  if (!files.length) return null
  const ranked = files.filter((entry) => !SKIP_ZIP_EXT.has(extOf(entry.name)))
  const pool = ranked.length ? ranked : files
  return pool.reduce((best, entry) => (entry.uncompressedSize > best.uncompressedSize ? entry : best))
}

async function listZip(source: ByteSource): Promise<ZipEntry[] | null> {
  if (source.size < 22) return null
  const tailSize = Math.min(source.size, 132_000)
  const tail = await source.read(source.size - tailSize, source.size)
  const view = new DataView(tail.buffer, tail.byteOffset, tail.byteLength)
  let eocd = -1
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) return null
  const cdSize = view.getUint32(eocd + 12, true)
  const cdOffset = view.getUint32(eocd + 16, true)
  if (cdOffset === 0xffffffff || cdSize === 0xffffffff) return null
  if (cdOffset + cdSize > source.size) return null
  const cdBytes = await source.read(cdOffset, cdOffset + cdSize)
  const cd = new DataView(cdBytes.buffer, cdBytes.byteOffset, cdBytes.byteLength)
  const entries: ZipEntry[] = []
  let p = 0
  while (p + 46 <= cd.byteLength && entries.length < 400) {
    if (cd.getUint32(p, true) !== 0x02014b50) break
    const flags = cd.getUint16(p + 8, true)
    const method = cd.getUint16(p + 10, true)
    const compressedSize = cd.getUint32(p + 20, true)
    const uncompressedSize = cd.getUint32(p + 24, true)
    const nameLen = cd.getUint16(p + 28, true)
    const extraLen = cd.getUint16(p + 30, true)
    const commentLen = cd.getUint16(p + 32, true)
    const localOffset = cd.getUint32(p + 42, true)
    const name = new TextDecoder().decode(cdBytes.subarray(p + 46, p + 46 + nameLen))
    entries.push({
      name,
      method,
      compressedSize,
      uncompressedSize,
      localOffset,
      encrypted: (flags & 1) === 1,
    })
    p += 46 + nameLen + extraLen + commentLen
  }
  return entries
}

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream !== 'function') {
    throw new Error('This browser can’t unzip that ROM for matching.')
  }
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  const stream = new Blob([copy.buffer]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** Pull the ROM out of a zip. 7z and rar stay unmatched — listing them doesn’t yield bytes. */
export async function extractZippedRom(source: ByteSource): Promise<{ name: string; bytes: Uint8Array } | { reason: string }> {
  const head = await source.read(0, Math.min(8, source.size))
  const zip = head.length >= 2 && head[0] === 0x50 && head[1] === 0x4b
  const seven = head.length >= 6 && head[0] === 0x37 && head[1] === 0x7a && head[2] === 0xbc && head[3] === 0xaf
  const rar = head.length >= 6 && head[0] === 0x52 && head[1] === 0x61 && head[2] === 0x72 && head[3] === 0x21
  if (seven || rar) return { reason: '7z and rar files can’t be matched. Zip the ROM, or add the ROM itself.' }
  if (!zip) return { reason: 'That file isn’t a ROM this check can read.' }
  const entries = await listZip(source)
  if (!entries) return { reason: 'This zip is incomplete or damaged, so it can’t be matched.' }
  const entry = pickZipEntry(entries)
  if (!entry) return { reason: 'This zip doesn’t contain a ROM to match.' }
  if (entry.encrypted) return { reason: 'This zip is password-protected, so it can’t be matched.' }
  if (entry.uncompressedSize > 192 * 1024 * 1024) return { reason: 'That ROM is too large to match in the browser.' }
  if (entry.method !== 0 && entry.method !== 8) return { reason: 'This zip uses compression RetroOasis can’t read for matching.' }
  const local = await source.read(entry.localOffset, entry.localOffset + 30)
  if (local.length < 30) return { reason: 'This zip is incomplete or damaged, so it can’t be matched.' }
  const localView = new DataView(local.buffer, local.byteOffset, local.byteLength)
  const nameLen = localView.getUint16(26, true)
  const extraLen = localView.getUint16(28, true)
  const dataStart = entry.localOffset + 30 + nameLen + extraLen
  const compressed = await source.read(dataStart, dataStart + entry.compressedSize)
  if (compressed.length < entry.compressedSize) return { reason: 'This zip is incomplete or damaged, so it can’t be matched.' }
  try {
    const bytes = entry.method === 0 ? compressed : await inflateRaw(compressed)
    if (!bytes.length) return { reason: 'This zip doesn’t contain a ROM to match.' }
    return { name: leaf(entry.name), bytes }
  } catch {
    return { reason: 'This zip couldn’t be opened for matching.' }
  }
}

export function sourceFromBytes(bytes: Uint8Array): ByteSource {
  return {
    size: bytes.length,
    async read(start: number, end: number) {
      return bytes.subarray(Math.max(0, start), Math.min(bytes.length, end))
    },
  }
}

/**
 * A Famicom disk’s set lives on the FDS console. A `.zip` (or a `.fds` pulled out of one)
 * has to search that list as well as NES, including when a saved hash is reused.
 */
export function consolesForMatchedFile(plan: RaHashPlan, ...names: string[]): number[] {
  if (plan.kind === 'nes' && names.some((name) => /\.fds$/i.test(name) || /\.zip$/i.test(name))) return [81, 7]
  return plan.consoleIds
}

/**
 * Hash a file for the given plan.
 * Zipped cartridges are unpacked first. Arcade names are hashed without opening the archive.
 * `name` is the ROM inside a zip, when that name decides which system list to search.
 */
export async function hashForPlan(source: ByteSource, filename: string, plan: RaHashPlan): Promise<{ hash: string; name?: string } | { reason: string }> {
  if (plan.kind === 'arcade') {
    const name = plan.arcadeName ?? arcadeHashName(filename)
    if (!name) return { reason: 'That arcade ROM needs a filename to match.' }
    return { hash: md5Text(name) }
  }
  if (source.size <= 0) return { reason: 'That file is empty, so it can’t be matched.' }

  const archiveExt = extOf(filename)
  const looksZipped = archiveExt === 'zip' || archiveExt === '7z' || archiveExt === 'rar'
  const head = await source.read(0, Math.min(8, source.size))
  const isZip = head.length >= 2 && head[0] === 0x50 && head[1] === 0x4b
  const is7z = head.length >= 6 && head[0] === 0x37 && head[1] === 0x7a
  const isRar = head.length >= 4 && head[0] === 0x52 && head[1] === 0x61 && head[2] === 0x72
  if (isZip || is7z || isRar || looksZipped) {
    const extracted = await extractZippedRom(source)
    if ('reason' in extracted) return extracted
    if (plan.kind === 'neo') return { reason: 'A zipped .neo file can’t be matched. Add the .neo file itself.' }
    const zipped = plan.kind === 'nds' ? hashNds(extracted.bytes) : hashRomBytes(extracted.bytes, plan.kind)
    if (!zipped) return { reason: romShapeReason(plan.kind) }
    return { hash: zipped, name: extracted.name }
  }

  if (plan.kind === 'nds') {
    const hashed = await hashNdsSource(source)
    if (!hashed) return { reason: romShapeReason('nds') }
    return { hash: hashed }
  }

  let bytes: Uint8Array
  if (plan.kind === 'neo') {
    const prefix = await readCapped(source, Math.min(source.size, RA_HASH_CAP + 4096))
    if (prefix.length < 4096 || !startsWith(prefix, 'NEO\x01')) return { reason: 'That file isn’t a .neo ROM.' }
    return { hash: hashRange(prefix, 4096) }
  } else {
    bytes = await readCapped(source)
  }
  const hash = hashRomBytes(bytes, plan.kind)
  if (!hash) return { reason: romShapeReason(plan.kind) }
  return { hash }
}

function romShapeReason(kind: RaHashKind): string {
  if (kind === 'n64') return 'That doesn’t look like a Nintendo 64 ROM.'
  if (kind === 'nds') return 'That doesn’t look like a Nintendo DS ROM.'
  return 'That file couldn’t be matched.'
}
