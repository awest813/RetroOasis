import type { Game } from './catalog'
import {
  PLATFORM_TO_CORE,
  normalizePlayCore,
  platformFromExtension,
  titleFromFilename,
} from './cores'
import { idbClear, idbDelete, idbGet, idbGetAll, idbSet, LIBRARY_ROM_STORE } from './idb'

export const LIBRARY_ROM_PREFIX = 'library:'

export interface LibraryRomRecord {
  id: string
  title: string
  platform: string
  core: string
  filename: string
  type: string
  bytes: ArrayBuffer
  size: number
  addedAt: number
}

/** Map an EmulatorJS core / system key to a platforms.json id. */
export function coreToPlatform(core: string): string {
  const raw = core.trim()
  const normalized = normalizePlayCore(raw)

  // normalizePlayCore remaps these away from catalog platform ids.
  if (normalized === 'azahar' || raw === '3ds' || raw === 'azahar') return '3ds'
  if (normalized === 'ppsspp' || raw === 'psp') return 'psp'
  if (normalized === 'dosbox_pure' || raw === 'dos') return 'dos'
  if (normalized === 'mame2003' || raw === 'mame') return 'mame'

  for (const [platform, mapped] of Object.entries(PLATFORM_TO_CORE)) {
    if (mapped === normalized || mapped === raw || platform === raw || platform === normalized) {
      return platform
    }
  }
  return normalized
}

export function uploadSlugId(platform: string, filename: string): string {
  const raw = `${platform}-${filename}`.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  return `upload-${raw.replace(/^-|-$/g, '')}`
}

export function isLibraryRomRef(rom: string): boolean {
  return rom.startsWith(LIBRARY_ROM_PREFIX)
}

export function libraryRomRef(id: string): string {
  return `${LIBRARY_ROM_PREFIX}${id}`
}

function recordToGame(record: LibraryRomRecord): Game {
  return {
    id: record.id,
    title: record.title,
    platform: record.platform,
    core: record.core,
    file: libraryRomRef(record.id),
    cover: null,
    source: 'upload',
    tags: ['upload'],
  }
}

function romByteLength(record: Pick<LibraryRomRecord, 'size' | 'bytes'>): number {
  if (record.bytes instanceof ArrayBuffer) return record.bytes.byteLength
  if (typeof record.size === 'number' && record.size > 0) return record.size
  return 0
}

function isQuotaError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { name?: string; message?: string }
  return (
    e.name === 'QuotaExceededError' ||
    e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    /quota/i.test(e.message ?? '')
  )
}

export async function saveUploadedRom(file: Blob, filename: string, core: string): Promise<Game> {
  if (!filename.trim()) {
    throw new Error('ROM file needs a name.')
  }
  if (file.size <= 0) {
    throw new Error('That file is empty. Choose a real ROM.')
  }

  const playCore = normalizePlayCore(core)
  // Explicit core wins over extension (e.g. .iso can be PSP / PSX / Sega CD).
  const platform = coreToPlatform(core) || platformFromExtension(filename) || 'nes'
  const id = uploadSlugId(platform, filename)

  const existing = await idbGet<LibraryRomRecord>(id, LIBRARY_ROM_STORE)
  let bytes: ArrayBuffer
  try {
    bytes = await file.arrayBuffer()
  } catch {
    throw new Error('Could not read that file into memory.')
  }

  const record: LibraryRomRecord = {
    id,
    title: existing?.title || titleFromFilename(filename),
    platform,
    core: playCore,
    filename,
    type: file.type || 'application/octet-stream',
    bytes,
    size: bytes.byteLength,
    addedAt: existing?.addedAt ?? Date.now(),
  }

  try {
    await idbSet(id, record, LIBRARY_ROM_STORE)
  } catch (err) {
    if (isQuotaError(err)) {
      throw new Error(
        'Browser storage is full. Remove saved ROMs in Settings, or free disk space, then try again.',
      )
    }
    throw err instanceof Error ? err : new Error('Could not save ROM to the library.')
  }

  return recordToGame(record)
}

export async function listUploadedGames(): Promise<Game[]> {
  const records = await idbGetAll<LibraryRomRecord>(LIBRARY_ROM_STORE)
  return records
    .filter((r) => r?.id && romByteLength(r) > 0)
    .map(recordToGame)
    .sort((a, b) => a.title.localeCompare(b.title))
}

export async function getUploadedRomRecord(
  gameId: string,
): Promise<LibraryRomRecord | undefined> {
  return idbGet<LibraryRomRecord>(gameId, LIBRARY_ROM_STORE)
}

export async function getUploadedRomFile(gameId: string): Promise<File> {
  const record = await getUploadedRomRecord(gameId)
  if (!record || romByteLength(record) <= 0) {
    throw new Error('Uploaded ROM missing from this browser library. Re-add the file.')
  }
  return new File([record.bytes], record.filename || 'game.bin', {
    type: record.type || 'application/octet-stream',
  })
}

export async function removeUploadedRom(gameId: string): Promise<void> {
  await idbDelete(gameId, LIBRARY_ROM_STORE)
}

export async function clearUploadedLibrary(): Promise<void> {
  await idbClear(LIBRARY_ROM_STORE)
}

export async function listUploadedRomIds(): Promise<string[]> {
  const records = await idbGetAll<LibraryRomRecord>(LIBRARY_ROM_STORE)
  return records.map((r) => r.id).filter(Boolean)
}

export async function getUploadedLibraryMeta(): Promise<{ count: number; bytes: number }> {
  const records = await idbGetAll<LibraryRomRecord>(LIBRARY_ROM_STORE)
  let bytes = 0
  let count = 0
  for (const record of records) {
    const size = romByteLength(record)
    if (size <= 0) continue
    count += 1
    bytes += size
  }
  return { count, bytes }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}
