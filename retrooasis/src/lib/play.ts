import type { Game } from './catalog'
import { coreNeedsThreads, normalizePlayCore } from './cores'
import { getLocalRomFile, hasLocalHandle } from './localLibrary'
import { hrefFor } from './router'
import { getEjsChannel, pushRecent } from './store'

/** Build a static-friendly player URL (hash back-link preserved). */
export function buildPlayerUrl(
  game: Game,
  romUrl: string,
  backPath: string,
): string {
  const core = normalizePlayCore(game.core)
  const channel = getEjsChannel()
  const params = new URLSearchParams({
    rom: romUrl,
    core,
    name: game.title,
    channel,
    back: backPath.startsWith('#') ? `./${backPath}` : `./#${backPath}`,
  })
  if (game.bios) params.set('bios', game.bios)
  if (coreNeedsThreads(core)) params.set('threads', '1')
  return `./player.html?${params.toString()}`
}

export async function launchGame(
  game: Game,
  backRoute = hrefFor(`/game/${game.id}`),
): Promise<void> {
  pushRecent(game.id)

  let romUrl = game.file
  if (game.source === 'local' || hasLocalHandle(game.id) || game.file.startsWith('local://')) {
    const file = await getLocalRomFile(game.id)
    romUrl = URL.createObjectURL(file)
  }

  window.location.href = buildPlayerUrl(game, romUrl, backRoute)
}
