import {
  clearLocalLibrary,
  restoreLocalLibrary,
  type LocalScanResult,
} from './localLibrary'
import { loadHostedManifest } from './hostedLibrary'
import { applyOverridesToGames } from './overrides'
import { getHideDemos } from './store'

export type PlatformAccent = string

export interface Platform {
  id: string
  name: string
  shortName: string
  core: string
  accent: PlatformAccent
}

export interface Game {
  id: string
  title: string
  platform: string
  core: string
  file: string
  cover: string | null
  tags?: string[]
  demo?: boolean
  bios?: string | null
  source?: 'catalog' | 'hosted' | 'local'
  description?: string
  year?: string | number
  developer?: string
}

export interface Catalog {
  platforms: Platform[]
  games: Game[]
  local?: { folderName: string; count: number } | null
  hostedCount?: number
}

let seedPromise: Promise<{ platforms: Platform[]; games: Game[] }> | null = null
let hostedGames: Game[] = []
let localGames: Game[] = []
let localMeta: Catalog['local'] = null
let listeners = new Set<() => void>()

async function loadJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to load ${url} (${res.status})`)
  }
  return res.json() as Promise<T>
}

function loadSeed() {
  if (!seedPromise) {
    seedPromise = Promise.all([
      loadJson<{ platforms: Platform[] }>('./catalog/platforms.json'),
      loadJson<{ games: Game[] }>('./catalog/games.json'),
    ]).then(([platforms, games]) => ({
      platforms: platforms.platforms,
      games: games.games.map((g) => ({ ...g, source: 'catalog' as const })),
    }))
  }
  return seedPromise
}

function buildCatalog(seed: { platforms: Platform[]; games: Game[] }): Catalog {
  const hideDemos = getHideDemos()
  const seedGames = hideDemos ? seed.games.filter((g) => !g.demo) : seed.games
  const byId = new Map<string, Game>()
  for (const game of seedGames) byId.set(game.id, game)
  for (const game of hostedGames) byId.set(game.id, game)
  for (const game of localGames) byId.set(game.id, game)
  const games = applyOverridesToGames([...byId.values()])
  return {
    platforms: seed.platforms,
    games,
    local: localMeta,
    hostedCount: hostedGames.length,
  }
}

export async function loadCatalog(): Promise<Catalog> {
  const seed = await loadSeed()
  return buildCatalog(seed)
}

export function onCatalogChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function emitCatalogChange(): void {
  for (const listener of listeners) listener()
}

export async function applyLocalScan(result: LocalScanResult): Promise<Catalog> {
  localGames = result.games
  localMeta = { folderName: result.folderName, count: result.count }
  const catalog = await loadCatalog()
  emitCatalogChange()
  return catalog
}

export async function initCatalogExtras(): Promise<void> {
  try {
    hostedGames = await loadHostedManifest()
  } catch {
    hostedGames = []
  }

  try {
    const restored = await restoreLocalLibrary()
    if (restored) {
      localGames = restored.games
      localMeta = { folderName: restored.folderName, count: restored.count }
    }
  } catch {
    localGames = []
    localMeta = null
  }
}

/** @deprecated use initCatalogExtras */
export async function initLocalCatalog(): Promise<void> {
  return initCatalogExtras()
}

export async function unlinkLocalCatalog(): Promise<void> {
  await clearLocalLibrary()
  localGames = []
  localMeta = null
  emitCatalogChange()
}

export function refreshCatalogView(): void {
  emitCatalogChange()
}

export function gamesForPlatform(catalog: Catalog, platformId: string): Game[] {
  return catalog.games
    .filter((g) => g.platform === platformId)
    .sort((a, b) => a.title.localeCompare(b.title))
}

export function findGame(catalog: Catalog, id: string): Game | undefined {
  return catalog.games.find((g) => g.id === id)
}

export function findPlatform(catalog: Catalog, id: string): Platform | undefined {
  return catalog.platforms.find((p) => p.id === id)
}

export function platformAccentVar(accent: PlatformAccent | string): string {
  const map: Record<string, string> = {
    nes: 'var(--ro-plat-nes)',
    snes: 'var(--ro-plat-snes)',
    gb: 'var(--ro-plat-gb)',
    gba: 'var(--ro-plat-gba)',
    sega: 'var(--ro-plat-sega)',
    ps: 'var(--ro-plat-ps)',
    n64: 'var(--ro-plat-n64)',
    arcade: 'var(--ro-plat-arcade)',
  }
  return map[accent] ?? 'var(--ro-accent)'
}

export function countByPlatform(catalog: Catalog): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const game of catalog.games) {
    counts[game.platform] = (counts[game.platform] ?? 0) + 1
  }
  return counts
}
