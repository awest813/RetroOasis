export type PlatformAccent =
  | 'nes'
  | 'snes'
  | 'gb'
  | 'gba'
  | 'sega'
  | 'ps'
  | 'n64'
  | 'arcade'

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
}

export interface Catalog {
  platforms: Platform[]
  games: Game[]
}

let catalogPromise: Promise<Catalog> | null = null

async function loadJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to load ${url} (${res.status})`)
  }
  return res.json() as Promise<T>
}

export function loadCatalog(): Promise<Catalog> {
  if (!catalogPromise) {
    catalogPromise = Promise.all([
      loadJson<{ platforms: Platform[] }>('./catalog/platforms.json'),
      loadJson<{ games: Game[] }>('./catalog/games.json'),
    ]).then(([platforms, games]) => ({
      platforms: platforms.platforms,
      games: games.games,
    }))
  }
  return catalogPromise
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
