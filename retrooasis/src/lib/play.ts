import type { Game } from './catalog'
import { hrefFor } from './router'
import { pushRecent } from './store'

/** Build a static-friendly player URL (hash back-link preserved). */
export function buildPlayerUrl(game: Game, backPath: string): string {
  const params = new URLSearchParams({
    rom: game.file,
    core: game.core,
    name: game.title,
    back: backPath.startsWith('#') ? `./${backPath}` : `./#${backPath}`,
  })
  if (game.bios) params.set('bios', game.bios)
  return `./player.html?${params.toString()}`
}

export function launchGame(game: Game, backRoute = hrefFor(`/game/${game.id}`)): void {
  pushRecent(game.id)
  window.location.href = buildPlayerUrl(game, backRoute)
}
