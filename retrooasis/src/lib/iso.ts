/** Header-only ISO 9660 peek so Auto-detect can tell PSP / PSX / Sega CD / 3DO / DOS apart. */

const LOGICAL = 2048
const RAW = 2352
const RAW_USER = 16

export interface IsoPeek {
  volumeId: string
  names: string[]
  complete: boolean
}

function ascii(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i++) {
    const c = bytes[i]
    if (c < 32 || c > 126) continue
    out += String.fromCharCode(c)
  }
  return out.trim()
}

function decodeIsoName(raw: string): string {
  const cut = raw.split(';')[0] ?? raw
  return cut.replace(/\.$/, '').trim()
}

function readRootNames(dir: Uint8Array, sectorSize: number, limit = 80): string[] {
  const names: string[] = []
  let p = 0
  while (p + 33 < dir.length && names.length < limit) {
    const recLen = dir[p]
    if (recLen === 0) {
      p = Math.ceil((p + 1) / sectorSize) * sectorSize
      continue
    }
    if (p + recLen > dir.length) break
    const nameLen = dir[p + 32]
    const flags = dir[p + 25]
    if (nameLen > 0 && p + 33 + nameLen <= dir.length) {
      if (!(nameLen === 1 && (dir[p + 33] === 0 || dir[p + 33] === 1))) {
        const raw = ascii(dir.subarray(p + 33, p + 33 + nameLen))
        const name = decodeIsoName(raw)
        if (name) names.push((flags & 2) === 2 ? `${name}/` : name)
      }
    }
    p += recLen
  }
  return names
}

async function readPvd(blob: Blob, offset: number): Promise<DataView | null> {
  if (blob.size < offset + LOGICAL) return null
  let pvd: DataView
  try {
    pvd = new DataView(await blob.slice(offset, offset + LOGICAL).arrayBuffer())
  } catch {
    return null
  }
  if (pvd.byteLength < 190) return null
  if (pvd.getUint8(0) !== 1) return null
  const id = String.fromCharCode(pvd.getUint8(1), pvd.getUint8(2), pvd.getUint8(3), pvd.getUint8(4), pvd.getUint8(5))
  if (id !== 'CD001') return null
  return pvd
}

async function peekLayout(blob: Blob, sectorSize: number, userOffset: number): Promise<IsoPeek | null> {
  const pvd = await readPvd(blob, 16 * sectorSize + userOffset)
  if (!pvd) return null

  const volumeId = ascii(new Uint8Array(pvd.buffer, pvd.byteOffset + 40, 32))
  const recLen = pvd.getUint8(156)
  if (recLen < 34) return { volumeId, names: [], complete: false }

  const extent = pvd.getUint32(158, true)
  const dataLen = pvd.getUint32(166, true)
  const start = extent * sectorSize + userOffset
  const size = Math.min(Math.max(dataLen, LOGICAL), 64 * LOGICAL)
  if (start < 0 || start + 34 > blob.size) return { volumeId, names: [], complete: false }

  try {
    const dir = new Uint8Array(await blob.slice(start, start + size).arrayBuffer())
    return { volumeId, names: readRootNames(dir, LOGICAL), complete: true }
  } catch {
    return { volumeId, names: [], complete: false }
  }
}

export async function peekIso9660(blob: Blob): Promise<IsoPeek | null> {
  return (await peekLayout(blob, LOGICAL, 0)) ?? (await peekLayout(blob, RAW, RAW_USER))
}

const ISO_HINTS: Array<{ platform: string; test: (name: string) => boolean }> = [
  { platform: 'psp', test: (n) => n === 'PSP_GAME/' || n === 'UMD_DATA.BIN' || n === 'PSP_GAME' || n === 'EBOOT.PBP' },
  { platform: 'psx', test: (n) => n === 'SYSTEM.CNF' || n === 'PSX.EXE' || n === 'SLES_000.00' },
  { platform: 'segaCD', test: (n) => n === 'IP.BIN' || n === 'ABS.TXT' || n === 'BIB.TXT' || n === 'CPY.TXT' },
  { platform: '3do', test: (n) => n === 'LAUNCHME' || n === 'LAUNCH.ME' || n === '3DO_PLAY' },
  { platform: 'dos', test: (n) => n.endsWith('.EXE') || n.endsWith('.COM') || n.endsWith('.BAT') || n === 'DOS/' },
]

export function platformFromIsoPeek(peek: IsoPeek): string | null {
  const volume = peek.volumeId.toUpperCase()
  if (volume.includes('PSP')) return 'psp'
  if (volume.includes('PLAYSTATION') || volume.includes('PSX')) return 'psx'
  if (volume.includes('SEGA') || volume.includes('MEGA_CD') || volume.includes('MEGACD')) return 'segaCD'
  if (volume.includes('3DO')) return '3do'

  const names = peek.names.map((n) => n.toUpperCase())
  for (const hint of ISO_HINTS) {
    if (names.some((n) => hint.test(n))) return hint.platform
  }
  return null
}

export async function detectIsoPlatform(blob: Blob): Promise<string | null> {
  const peek = await peekIso9660(blob)
  return peek ? platformFromIsoPeek(peek) : null
}

/** What a .chd holds, read from its metadata. CHD v5 files lead with a 124-byte header whose
 * metadata chain says how the disc was dumped (CD tracks, a Dreamcast GD-ROM, a DVD, a hard disk). */
export type ChdMedia = 'cd' | 'gdrom' | 'dvd' | 'hd'

const CHD_METADATA: Record<string, ChdMedia> = {
  CHCD: 'cd', CHTR: 'cd', CHT2: 'cd', CHGD: 'gdrom', CHGT: 'gdrom', 'DVD ': 'dvd', GDDD: 'hd',
}

export async function peekChdMedia(blob: Blob): Promise<ChdMedia | null> {
  try {
    const head = new DataView(await blob.slice(0, 124).arrayBuffer())
    if (head.byteLength < 124 || String.fromCharCode(...new Uint8Array(head.buffer, 0, 8)) !== 'MComprHD') return null
    if (head.getUint32(12) !== 5) return null
    let offset = Number(head.getBigUint64(48))
    for (let step = 0; offset > 0 && step < 16 && offset + 16 <= blob.size; step += 1) {
      const entry = new DataView(await blob.slice(offset, offset + 16).arrayBuffer())
      const tag = String.fromCharCode(entry.getUint8(0), entry.getUint8(1), entry.getUint8(2), entry.getUint8(3))
      if (CHD_METADATA[tag]) return CHD_METADATA[tag]
      offset = Number(entry.getBigUint64(8))
    }
  } catch {
    /* unreadable: treat as unknown */
  }
  return null
}

/** Why a .chd can't be played here, or null when it is a CD image (PlayStation, Sega CD, Saturn). */
export async function unsupportedChdReason(blob: Blob): Promise<string | null> {
  const media = await peekChdMedia(blob)
  if (media === 'gdrom') return 'This is a Dreamcast disc (GD-ROM). RetroOasis can’t play Dreamcast games yet.'
  if (media === 'dvd') return 'This is a DVD-sized disc image (PlayStation 2, GameCube, Xbox or similar). RetroOasis can’t play those yet.'
  if (media === 'hd') return 'This is a hard-disk image, not a game disc.'
  return null
}
