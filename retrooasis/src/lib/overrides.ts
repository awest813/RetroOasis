import type { Game } from './catalog'
import { parseSidecar, type GameSidecar } from './sidecar'

const OVERRIDES_KEY = 'retrooasis.overrides'

export type GameOverride = GameSidecar & { id: string }

function readAll(): Record<string, GameOverride> {
  try {
    const raw = localStorage.getItem(OVERRIDES_KEY)
    if (!raw) return {}
    const data = JSON.parse(raw) as Record<string, GameOverride>
    return data && typeof data === 'object' ? data : {}
  } catch {
    return {}
  }
}

function writeAll(map: Record<string, GameOverride>): void {
  localStorage.setItem(OVERRIDES_KEY, JSON.stringify(map))
}

export function getOverride(gameId: string): GameOverride | undefined {
  return readAll()[gameId]
}

export function setOverride(gameId: string, patch: GameSidecar): GameOverride {
  const map = readAll()
  const next: GameOverride = { ...map[gameId], ...patch, id: gameId }
  // Drop empty fields
  for (const key of Object.keys(next) as Array<keyof GameOverride>) {
    if (key === 'id') continue
    const value = next[key]
    if (value === '' || value === undefined) delete next[key]
  }
  map[gameId] = next
  writeAll(map)
  return next
}

export function clearOverride(gameId: string): void {
  const map = readAll()
  delete map[gameId]
  writeAll(map)
}

export function clearAllOverrides(): void {
  localStorage.removeItem(OVERRIDES_KEY)
}

export function exportOverridesJson(): string {
  return JSON.stringify({ overrides: Object.values(readAll()) }, null, 2)
}

export function applyOverridesToGames(games: Game[]): Game[] {
  const map = readAll()
  if (!Object.keys(map).length) return games
  return games.map((game) => {
    const over = map[game.id]
    if (!over) return game
    const parsed = parseSidecar(over)
    if (!parsed) return game
    return {
      ...game,
      title: parsed.title || game.title,
      core: parsed.core || game.core,
      cover: parsed.cover ?? game.cover,
      bios: parsed.bios !== undefined ? parsed.bios : game.bios,
      description: parsed.description ?? game.description,
      year: parsed.year ?? game.year,
      developer: parsed.developer ?? game.developer,
      tags: parsed.tags?.length ? parsed.tags : game.tags,
    }
  })
}
