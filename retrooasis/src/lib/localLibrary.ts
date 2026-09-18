import type { Game } from './catalog'
import {
  coreForPlatform,
  isCoverFile,
  isRomFile,
  platformFromFolder,
  slugId,
  titleFromFilename,
} from './cores'
import {
  groupDiscSetNames,
  isDiscCompanion,
  isDiscDescriptor,
} from './discSets'
import { idbDelete, idbGet, idbSet } from './idb'
import { parseSidecar, type GameSidecar } from './sidecar'

const ROOT_HANDLE_KEY = 'libraryRoot'
const fileHandles = new Map<string, FileSystemFileHandle>()
const companionHandles = new Map<string, FileSystemFileHandle[]>()
const coverUrls = new Map<string, string>()

export interface LocalScanResult {
  games: Game[]
  folderName: string
  count: number
}

declare global {
  interface Window {
    showDirectoryPicker?: (options?: {
      id?: string
      mode?: 'read' | 'readwrite'
    }) => Promise<FileSystemDirectoryHandle>
  }

  interface FileSystemHandle {
    queryPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>
    requestPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>
  }
}

export function supportsDirectoryPicker(): boolean {
  return typeof window.showDirectoryPicker === 'function'
}

async function queryReadGranted(handle: FileSystemDirectoryHandle): Promise<boolean> {
  if (!handle.queryPermission) return true
  try {
    return (await handle.queryPermission({ mode: 'read' })) === 'granted'
  } catch {
    return false
  }
}

async function ensurePermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const mode = { mode: 'read' as const }
  if (handle.queryPermission) {
    const current = await handle.queryPermission(mode)
    if (current === 'granted') return true
  }
  if (handle.requestPermission) {
    const next = await handle.requestPermission(mode)
    return next === 'granted'
  }
  return true
}

function revokeCovers(): void {
  for (const url of coverUrls.values()) URL.revokeObjectURL(url)
  coverUrls.clear()
}

async function readCoverUrl(
  dir: FileSystemDirectoryHandle,
  romBase: string,
): Promise<string | null> {
  for (const ext of ['png', 'jpg', 'jpeg', 'webp']) {
    try {
      const handle = await dir.getFileHandle(`${romBase}.${ext}`)
      const file = await handle.getFile()
      const url = URL.createObjectURL(file)
      return url
    } catch {
      // try next extension
    }
  }
  return null
}

async function readJsonSidecar(
  dir: FileSystemDirectoryHandle,
  name: string,
): Promise<GameSidecar | null> {
  try {
    const handle = await dir.getFileHandle(name)
    const file = await handle.getFile()
    return parseSidecar(JSON.parse(await file.text()))
  } catch {
    return null
  }
}

async function scanPlatformDir(
  platformId: string,
  dir: FileSystemDirectoryHandle,
  games: Game[],
): Promise<void> {
  const defaultCore = coreForPlatform(platformId)
  const romEntries: Array<[string, FileSystemFileHandle]> = []

  for await (const [name, handle] of dir.entries()) {
    if (handle.kind === 'file' && (isRomFile(name) || isDiscCompanion(name))) {
      romEntries.push([name, handle as FileSystemFileHandle])
    }
  }

  const handleByName = new Map(romEntries)
  const texts: Record<string, string> = {}
  await Promise.all(
    romEntries
      .filter(([name]) => isDiscDescriptor(name))
      .map(async ([name, handle]) => {
        try {
          const file = await handle.getFile()
          if (file.size < 2_000_000) texts[name] = await file.text()
        } catch {
          /* ignore */
        }
      }),
  )

  const plans = groupDiscSetNames(
    romEntries.map(([name]) => name),
    { texts },
  )
  const sharedMeta = plans.length === 1 ? await readJsonSidecar(dir, 'game.json') : null

  for (const plan of plans) {
    const name = plan.primary.name
    const handle = handleByName.get(name)
    if (!handle) continue
    const id = slugId(platformId, name)
    const romBase = name.replace(/\.[^.]+$/, '')
    const meta = (await readJsonSidecar(dir, `${romBase}.json`)) || sharedMeta
    let cover = await readCoverUrl(dir, romBase)

    // Sidecar may point at a relative cover filename in the same folder.
    if (!cover && meta?.cover && !meta.cover.includes('://') && !meta.cover.includes('/')) {
      cover = await readCoverUrl(dir, meta.cover.replace(/\.[^.]+$/, ''))
      if (!cover) {
        try {
          const coverHandle = await dir.getFileHandle(meta.cover)
          cover = URL.createObjectURL(await coverHandle.getFile())
        } catch {
          // ignore missing sidecar cover
        }
      }
    }

    fileHandles.set(id, handle)
    const extras = plan.files
      .map((entry) => handleByName.get(entry.name))
      .filter((h): h is FileSystemFileHandle => !!h && h !== handle)
    if (extras.length) companionHandles.set(id, extras)
    if (cover) coverUrls.set(id, cover)

    const tags = meta?.tags?.length ? [...meta.tags] : ['local']
    if (plan.kind === 'disc-set' && !tags.includes('disc-set')) tags.push('disc-set')

    games.push({
      id,
      title: meta?.title || titleFromFilename(name),
      platform: platformId,
      core: meta?.core || defaultCore,
      file: `local://${id}`,
      cover,
      bios: meta?.bios ?? null,
      description: meta?.description,
      year: meta?.year,
      developer: meta?.developer,
      source: 'local',
      tags,
    })
  }
}

async function scanCoversBucket(
  root: FileSystemDirectoryHandle,
  platformId: string,
  games: Game[],
): Promise<void> {
  let coversDir: FileSystemDirectoryHandle
  try {
    coversDir = await root.getDirectoryHandle('covers')
    coversDir = await coversDir.getDirectoryHandle(platformId)
  } catch {
    return
  }

  for await (const [name, handle] of coversDir.entries()) {
    if (handle.kind !== 'file' || !isCoverFile(name)) continue
    const base = name.replace(/\.[^.]+$/, '')
    const match = games.find(
      (g) => g.platform === platformId && g.id.includes(base.toLowerCase().replace(/[^a-z0-9]+/g, '-')),
    )
    if (!match || match.cover) continue
    const file = await (handle as FileSystemFileHandle).getFile()
    const url = URL.createObjectURL(file)
    coverUrls.set(match.id, url)
    match.cover = url
  }
}

export async function scanDirectory(root: FileSystemDirectoryHandle): Promise<LocalScanResult> {
  revokeCovers()
  fileHandles.clear()
  companionHandles.clear()

  const games: Game[] = []
  let start: FileSystemDirectoryHandle = root

  // Allow picking either the roms/ folder or a parent that contains roms/
  try {
    const nested = await root.getDirectoryHandle('roms')
    start = nested
  } catch {
    start = root
  }

  for await (const [name, handle] of start.entries()) {
    if (handle.kind !== 'directory') continue
    const platformId = platformFromFolder(name)
    if (!platformId) continue
    await scanPlatformDir(platformId, handle as FileSystemDirectoryHandle, games)
    await scanCoversBucket(start, platformId, games)
  }

  games.sort((a, b) => a.title.localeCompare(b.title))
  return {
    games,
    folderName: root.name,
    count: games.length,
  }
}

export async function pickLocalLibrary(): Promise<LocalScanResult> {
  if (!supportsDirectoryPicker()) {
    throw new Error(
      'This browser can’t link folders. Use Add ROM instead, or host a roms/manifest.json file.',
    )
  }
  const root = await window.showDirectoryPicker!({ id: 'retrooasis-library', mode: 'read' })
  await idbSet(ROOT_HANDLE_KEY, root)
  return scanDirectory(root)
}

export async function restoreLocalLibrary(): Promise<LocalScanResult | null> {
  const root = await idbGet<FileSystemDirectoryHandle>(ROOT_HANDLE_KEY)
  if (!root) return null
  const ok = await ensurePermission(root)
  if (!ok) return null
  return scanDirectory(root)
}

/** Re-prompt for an existing linked folder without opening a new picker. */
export async function grantLocalLibraryAccess(): Promise<LocalScanResult | null> {
  const root = await idbGet<FileSystemDirectoryHandle>(ROOT_HANDLE_KEY)
  if (!root) return null
  const ok = await ensurePermission(root)
  if (!ok) return null
  return scanDirectory(root)
}

export async function clearLocalLibrary(): Promise<void> {
  revokeCovers()
  fileHandles.clear()
  companionHandles.clear()
  await idbDelete(ROOT_HANDLE_KEY)
}

export async function getLocalRomFile(gameId: string): Promise<File> {
  const files = await getLocalRomFiles(gameId)
  return files[0]
}

export async function getLocalRomFiles(gameId: string): Promise<File[]> {
  const handle = fileHandles.get(gameId)
  if (!handle) {
    throw new Error('Lost access to that folder. Link your ROM folder again in Settings.')
  }
  const primary = await handle.getFile()
  const extras = companionHandles.get(gameId) ?? []
  const companions = await Promise.all(extras.map((extra) => extra.getFile()))
  return [primary, ...companions]
}

export function hasLocalHandle(gameId: string): boolean {
  return fileHandles.has(gameId)
}

export async function getLocalLibraryMeta(): Promise<{
  linked: boolean
  name?: string
  needsPermission?: boolean
}> {
  const root = await idbGet<FileSystemDirectoryHandle>(ROOT_HANDLE_KEY)
  if (!root) return { linked: false }
  const granted = await queryReadGranted(root)
  return { linked: true, name: root.name, needsPermission: !granted }
}
