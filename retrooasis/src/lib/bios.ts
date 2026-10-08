import { peekArchive } from './archives'
import type { Game } from './catalog'
import { isArchiveFile } from './cores'
import { idbDelete, idbGet, idbSet } from './idb'

/** BIOS files RetroOasis can keep for a system. They stay on this device and are handed to the player as a file. */
export type BiosKind = 'fds'

export const BIOS_REF_PREFIX = 'bios:'

const SPECS: Record<BiosKind, { filename: string; label: string; size: number }> = {
  // The Famicom Disk System BIOS is exactly 8 KB; the core looks for it by this name.
  fds: { filename: 'disksys.rom', label: 'Famicom Disk System', size: 8192 },
}

interface StoredBios {
  filename: string
  bytes: ArrayBuffer
}

export function biosSpec(kind: BiosKind) {
  return SPECS[kind]
}

/** Which BIOS a game needs to start, if any. */
export function biosKindFor(game: Pick<Game, 'romFilename' | 'file' | 'tags'>): BiosKind | null {
  if (game.tags?.includes('famicom-disk')) return 'fds'
  return /\.fds$/i.test(game.romFilename ?? game.file ?? '') ? 'fds' : null
}

export async function hasBios(kind: BiosKind): Promise<boolean> {
  try {
    return !!(await idbGet<StoredBios>(`${BIOS_REF_PREFIX}${kind}`))
  } catch {
    return false
  }
}

export async function saveBios(kind: BiosKind, file: File): Promise<void> {
  const spec = SPECS[kind]
  if (file.size !== spec.size) {
    throw new Error(`That doesn’t look like ${spec.filename}. It should be ${spec.size / 1024} KB, and this file is ${file.size.toLocaleString()} bytes.`)
  }
  // Stored under the name the emulator expects, whatever the file was called.
  await idbSet<StoredBios>(`${BIOS_REF_PREFIX}${kind}`, { filename: spec.filename, bytes: await file.arrayBuffer() })
}

export async function removeBios(kind: BiosKind): Promise<void> {
  await idbDelete(`${BIOS_REF_PREFIX}${kind}`)
}

/**
 * Whether a zipped NES game holds a Famicom Disk System image. The file name alone can't say, so look at the
 * archive's entry names. `load` returns the archive (null when it can't be read); big files are not fetched.
 */
export async function archiveHoldsDisk(
  game: Pick<Game, 'romFilename' | 'file'>,
  load: () => Promise<Blob | null>,
): Promise<boolean> {
  if (!isArchiveFile(game.romFilename ?? game.file ?? '')) return false
  try {
    const blob = await load()
    if (!blob || blob.size > 4 * 1024 * 1024) return false
    return !!(await peekArchive(blob))?.names.some((name) => /\.fds$/i.test(name))
  } catch {
    return false
  }
}
