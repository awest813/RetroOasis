import type { Game } from './catalog'
import { parseSidecar, type GameSidecar } from './sidecar'
import { isQuotaError } from './userErrors'

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
  try {
    if (Object.keys(map).length === 0) {
      localStorage.removeItem(OVERRIDES_KEY)
      return
    }
    localStorage.setItem(OVERRIDES_KEY, JSON.stringify(map))
  } catch (err) {
    if (isQuotaError(err)) {
      throw new Error(
        'This browser is out of storage space. Remove some saved ROMs in Settings, free up disk space, then try again.',
      )
    }
    throw err instanceof Error ? err : new Error('Couldn’t save those edits.')
  }
}

export function getOverride(gameId: string): GameOverride | undefined {
  const over = readAll()[gameId]
  if (!over || !parseSidecar(over)) return undefined
  return over
}

/** Map the metadata form to a patch. Unchanged / empty fields become '' so they drop. */
export function formFieldsToPatch(
  game: Pick<Game, 'title' | 'core' | 'cover' | 'description' | 'year' | 'developer'>,
  fields: {
    title: string
    core: string
    year: string
    developer: string
    cover: string
    description: string
  },
): GameSidecar {
  const origYear = game.year == null ? '' : String(game.year)
  return {
    title: fields.title !== game.title ? fields.title : '',
    core: fields.core !== game.core ? fields.core : '',
    year: fields.year !== origYear ? fields.year : '',
    developer: fields.developer !== (game.developer ?? '') ? fields.developer : '',
    cover: fields.cover !== (game.cover ?? '') ? fields.cover : '',
    description: fields.description !== (game.description ?? '') ? fields.description : '',
  }
}

export function setOverride(gameId: string, patch: GameSidecar): GameOverride | undefined {
  const map = readAll()
  const next: GameOverride = { ...map[gameId], ...patch, id: gameId }
  // Drop empty fields
  for (const key of Object.keys(next) as Array<keyof GameOverride>) {
    if (key === 'id') continue
    const value = next[key]
    if (value === '' || value === undefined) delete next[key]
  }
  if (!parseSidecar(next)) {
    delete map[gameId]
    writeAll(map)
    return undefined
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
  try {
    localStorage.removeItem(OVERRIDES_KEY)
  } catch {
    /* ignore */
  }
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
