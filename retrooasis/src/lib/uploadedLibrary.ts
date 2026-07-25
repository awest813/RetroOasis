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

function coreToPlatform(core: string): string {
  const normalized = normalizePlayCore(core)
  for (const [platform, mapped] of Object.entries(PLATFORM_TO_CORE)) {
    if (mapped === normalized || mapped === core || platform === core || platform === normalized) {
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

export async function saveUploadedRom(file: Blob, filename: string, core: string): Promise<Game> {
  const playCore = normalizePlayCore(core)
  const platform = platformFromExtension(filename) ?? coreToPlatform(playCore)
  const id = uploadSlugId(platform, filename)
  const bytes = await file.arrayBuffer()
  const record: LibraryRomRecord = {
    id,
    title: titleFromFilename(filename),
    platform,
    core: playCore,
    filename,
    type: file.type || 'application/octet-stream',
    bytes,
    size: bytes.byteLength,
    addedAt: Date.now(),
  }
  await idbSet(id, record, LIBRARY_ROM_STORE)
  return recordToGame(record)
}

export async function listUploadedGames(): Promise<Game[]> {
  const records = await idbGetAll<LibraryRomRecord>(LIBRARY_ROM_STORE)
  return records
    .filter((r) => r?.id && r.bytes)
    .map(recordToGame)
    .sort((a, b) => a.title.localeCompare(b.title))
}

export async function getUploadedRomFile(gameId: string): Promise<File> {
  const record = await idbGet<LibraryRomRecord>(gameId, LIBRARY_ROM_STORE)
  if (!record?.bytes) {
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

export async function getUploadedLibraryMeta(): Promise<{ count: number; bytes: number }> {
  const records = await idbGetAll<LibraryRomRecord>(LIBRARY_ROM_STORE)
  let bytes = 0
  for (const record of records) {
    bytes += record.size || record.bytes?.byteLength || 0
  }
  return { count: records.length, bytes }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}
