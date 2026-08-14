/** Optional metadata sidecar next to a ROM: `<romBase>.json` or `game.json`. */

export interface GameSidecar {
  title?: string
  core?: string
  cover?: string
  bios?: string | null
  description?: string
  year?: string | number
  developer?: string
  tags?: string[]
}

export function parseSidecar(raw: unknown): GameSidecar | null {
  if (!raw || typeof raw !== 'object') return null
  const data = raw as Record<string, unknown>
  const out: GameSidecar = {}

  if (typeof data.title === 'string') out.title = data.title
  if (typeof data.core === 'string') out.core = data.core
  if (typeof data.cover === 'string') out.cover = data.cover
  if (typeof data.bios === 'string' || data.bios === null) out.bios = data.bios as string | null
  if (typeof data.description === 'string') out.description = data.description
  if (typeof data.year === 'string' || typeof data.year === 'number') out.year = data.year
  if (typeof data.developer === 'string') out.developer = data.developer
  if (Array.isArray(data.tags)) {
    out.tags = data.tags.filter((t): t is string => typeof t === 'string')
  }

  return Object.keys(out).length ? out : null
}
