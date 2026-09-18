/** Group CUE/BIN/ISO/M3U disc dumps and pack them so EmulatorJS sees every file. */

import { isRomFile, titleFromFilename } from './cores'

export const DISC_DESCRIPTOR_EXTS = new Set(['cue', 'ccd', 'm3u', 'toc'])
export const DISC_COMPANION_EXTS = new Set([
  'bin',
  'img',
  'iso',
  'wav',
  'ape',
  'flac',
  'chd',
  'sub',
  'cdg',
  'scm',
  'mdf',
  'mds',
])

export interface NamedFile {
  name: string
}

export interface DiscSetPlan<T extends NamedFile> {
  /** Playable / descriptor file EmulatorJS should prefer. */
  primary: T
  files: T[]
  kind: 'single' | 'disc-set'
  missing: string[]
}

export function fileExt(name: string): string {
  const base = name.replace(/\\/g, '/').split('/').pop() ?? name
  const dot = base.lastIndexOf('.')
  return dot >= 0 ? base.slice(dot + 1).toLowerCase() : ''
}

export function fileBasename(name: string): string {
  const base = name.replace(/\\/g, '/').split('/').pop() ?? name
  const dot = base.lastIndexOf('.')
  return (dot >= 0 ? base.slice(0, dot) : base).toLowerCase()
}

export function isDiscDescriptor(name: string): boolean {
  return DISC_DESCRIPTOR_EXTS.has(fileExt(name))
}

export function isDiscCompanion(name: string): boolean {
  const ext = fileExt(name)
  return DISC_COMPANION_EXTS.has(ext) && !DISC_DESCRIPTOR_EXTS.has(ext)
}

export function parseCueFileReferences(text: string): string[] {
  const names: string[] = []
  const re = /^\s*FILE\s+(?:"([^"]+)"|'([^']+)'|(\S+))\s+/gim
  let match: RegExpExecArray | null
  while ((match = re.exec(text))) {
    const name = (match[1] || match[2] || match[3] || '').trim()
    if (name) names.push(name.replace(/\\/g, '/'))
  }
  return names
}

export function parseM3uEntries(text: string): string[] {
  const names: string[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    names.push(line.replace(/\\/g, '/'))
  }
  return names
}

export function parseDiscReferences(filename: string, text: string): string[] {
  const ext = fileExt(filename)
  if (ext === 'm3u') return parseM3uEntries(text)
  if (ext === 'cue' || ext === 'ccd' || ext === 'toc') return parseCueFileReferences(text)
  return []
}

function lookupName(index: Map<string, string>, wanted: string): string | undefined {
  const normalized = wanted.replace(/\\/g, '/').replace(/^\.\//, '')
  const lower = normalized.toLowerCase()
  if (index.has(lower)) return index.get(lower)
  const leaf = (normalized.split('/').pop() ?? normalized).toLowerCase()
  return index.get(leaf)
}

/** Same-basename dumps sitting next to a descriptor (game.cue + game.bin). */
export function sameBasenameCompanions(primary: string, names: string[]): string[] {
  const base = fileBasename(primary)
  if (!base) return []
  return names.filter((name) => {
    if (name === primary) return false
    if (fileBasename(name) !== base) return false
    return isDiscCompanion(name) || isDiscDescriptor(name)
  })
}

export interface GroupDiscSetOptions {
  /** Optional descriptor text keyed by the original filename. */
  texts?: Record<string, string>
}

/**
 * Group ROM filenames into disc sets. Companion-only files that belong to a
 * descriptor are not returned as their own games.
 */
export function groupDiscSetNames(names: string[], options: GroupDiscSetOptions = {}): DiscSetPlan<{ name: string }>[] {
  const unique = [...new Set(names.filter((n) => n && n.trim()))]
  const index = new Map<string, string>()
  for (const name of unique) {
    const lower = name.replace(/\\/g, '/').toLowerCase()
    index.set(lower, name)
    const leaf = (lower.split('/').pop() ?? lower)
    if (!index.has(leaf)) index.set(leaf, name)
  }

  const consumed = new Set<string>()
  const plans: DiscSetPlan<{ name: string }>[] = []

  const descriptorOrder = unique
    .filter((name) => isDiscDescriptor(name))
    .sort((a, b) => {
      const rank = (name: string) => {
        const ext = fileExt(name)
        if (ext === 'm3u') return 0
        if (ext === 'cue') return 1
        if (ext === 'ccd') return 2
        return 3
      }
      const diff = rank(a) - rank(b)
      return diff !== 0 ? diff : a.localeCompare(b)
    })

  for (const primary of descriptorOrder) {
    if (consumed.has(primary)) continue
    const files = new Set<string>([primary])
    const missing: string[] = []
    const text = options.texts?.[primary]
    const refs = text ? parseDiscReferences(primary, text) : []
    for (const ref of refs) {
      const match = lookupName(index, ref)
      if (match) files.add(match)
      else missing.push(ref.replace(/\\/g, '/').split('/').pop() || ref)
    }
    for (const extra of sameBasenameCompanions(primary, unique)) files.add(extra)
    for (const name of files) consumed.add(name)
    const list = [...files]
    plans.push({
      primary: { name: primary },
      files: list.map((name) => ({ name })),
      kind: list.length > 1 ? 'disc-set' : 'single',
      missing,
    })
  }

  for (const name of unique) {
    if (consumed.has(name)) continue
    if (!isRomFile(name)) continue
    consumed.add(name)
    plans.push({
      primary: { name },
      files: [{ name }],
      kind: 'single',
      missing: [],
    })
  }

  return plans
}

export function groupDiscSetFiles(files: File[], texts?: Record<string, string>): DiscSetPlan<File>[] {
  const byName = new Map<string, File>()
  for (const file of files) {
    if (!file?.name?.trim()) continue
    byName.set(file.name, file)
  }
  const plans = groupDiscSetNames([...byName.keys()], { texts })
  return plans.map((plan) => ({
    primary: byName.get(plan.primary.name)!,
    files: plan.files.map((entry) => byName.get(entry.name)!).filter(Boolean),
    kind: plan.kind,
    missing: plan.missing,
  }))
}

export async function readDescriptorTexts(files: File[]): Promise<Record<string, string>> {
  const texts: Record<string, string> = {}
  await Promise.all(
    files
      .filter((file) => isDiscDescriptor(file.name) && file.size < 2_000_000)
      .map(async (file) => {
        try {
          texts[file.name] = await file.text()
        } catch {
          /* ignore unreadable descriptors */
        }
      }),
  )
  return texts
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[i] = c >>> 0
  }
  return table
})()

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear())
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  }
}

function u16(n: number): Uint8Array {
  const b = new Uint8Array(2)
  b[0] = n & 0xff
  b[1] = (n >>> 8) & 0xff
  return b
}

function u32(n: number): Uint8Array {
  const b = new Uint8Array(4)
  b[0] = n & 0xff
  b[1] = (n >>> 8) & 0xff
  b[2] = (n >>> 16) & 0xff
  b[3] = (n >>> 24) & 0xff
  return b
}

/** Uncompressed ZIP so EmulatorJS can extract CUE + BIN together at play time. */
export function buildStoreZip(entries: Array<{ name: string; bytes: Uint8Array }>): Uint8Array {
  const encoder = new TextEncoder()
  const now = dosDateTime(new Date())
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0

  for (const entry of entries) {
    const name = entry.name.replace(/\\/g, '/').replace(/^\/+/, '')
    const nameBytes = encoder.encode(name)
    const crc = crc32(entry.bytes)
    const size = entry.bytes.byteLength
    const local = concatBytes(
      encoder.encode('PK\x03\x04'),
      u16(20),
      u16(0),
      u16(0),
      u16(now.time),
      u16(now.date),
      u32(crc),
      u32(size),
      u32(size),
      u16(nameBytes.length),
      u16(0),
      nameBytes,
      entry.bytes,
    )
    const central = concatBytes(
      encoder.encode('PK\x01\x02'),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(now.time),
      u16(now.date),
      u32(crc),
      u32(size),
      u32(size),
      u16(nameBytes.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      nameBytes,
    )
    locals.push(local)
    centrals.push(central)
    offset += local.byteLength
  }

  const centralDir = concatBytes(...centrals)
  const eocd = concatBytes(
    encoder.encode('PK\x05\x06'),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(centralDir.byteLength),
    u32(offset),
    u16(0),
  )
  return concatBytes(...locals, centralDir, eocd)
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.byteLength, 0)
  const out = new Uint8Array(total)
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.byteLength
  }
  return out
}

export async function bundleFilesAsZip(files: File[], zipName?: string): Promise<File> {
  const entries = await Promise.all(
    files.map(async (file) => ({
      name: file.name.replace(/\\/g, '/').split('/').pop() || file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
    })),
  )
  const bytes = buildStoreZip(entries)
  const copy = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(copy).set(bytes)
  const primary = files[0]?.name || 'game.bin'
  const name = zipName || `${fileBasename(primary) || 'game'}.zip`
  return new File([copy], name, { type: 'application/zip' })
}

export function discSetTitle(primaryName: string): string {
  return titleFromFilename(primaryName)
}

export function discSetZipName(primaryName: string): string {
  const base = fileBasename(primaryName) || 'game'
  return `${base}.zip`
}

export function missingCompanionsMessage(filename: string, missing: string[]): string | null {
  if (!missing.length) return null
  const list = missing.slice(0, 4).join(', ')
  const extra = missing.length > 4 ? ` (+${missing.length - 4} more)` : ''
  return `${filename} also needs ${list}${extra}. Add those files with this one.`
}
