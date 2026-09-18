import type { Game } from './catalog'
import { coreNeedsThreads, normalizePlayCore } from './cores'
import {
  bundleFilesAsZip,
  discSetZipName,
  isDiscDescriptor,
  missingCompanionsMessage,
  parseDiscReferences,
} from './discSets'
import { getLocalRomFiles, hasLocalHandle } from './localLibrary'
import { hrefFor } from './router'
import { stageRomForPlay } from './romBridge'
import { pushRecent, resolveEjsChannel } from './store'

/** Build a static-friendly player URL (hash back-link preserved). */
export function buildPlayerUrl(
  game: Game,
  romUrl: string,
  backPath: string,
): string {
  const core = normalizePlayCore(game.core)
  const channel = resolveEjsChannel(core)
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

async function bundleIfNeeded(files: File[]): Promise<File> {
  if (files.length <= 1) return files[0]
  const primary = files[0]
  return bundleFilesAsZip(files, discSetZipName(primary.name))
}

function siblingUrl(romUrl: string, name: string): string {
  const cleaned = romUrl.split('?')[0] ?? romUrl
  const slash = cleaned.lastIndexOf('/')
  const dir = slash >= 0 ? cleaned.slice(0, slash + 1) : './'
  const leaf = name.replace(/\\/g, '/').split('/').pop() || name
  return `${dir}${encodeURIComponent(leaf)}`
}

async function fetchHostedCompanion(url: string): Promise<File | null> {
  try {
    const res = await fetch(url, { method: 'GET', cache: 'no-store' })
    if (!res.ok) return null
    const type = (res.headers.get('content-type') || '').toLowerCase()
    if (type.includes('text/html')) return null
    const bytes = await res.arrayBuffer()
    const filename = decodeURIComponent(url.split('/').pop()?.split('?')[0] || 'track.bin')
    return new File([bytes], filename, { type: type || 'application/octet-stream' })
  } catch {
    return null
  }
}

/** Pull CUE/M3U sibling dumps from the same hosted folder. */
export async function fetchHostedDiscSet(romUrl: string): Promise<File> {
  const res = await fetch(romUrl, { method: 'GET', cache: 'no-store' })
  if (!res.ok) {
    throw new Error(`Couldn’t find that ROM file at ${romUrl}.`)
  }
  const type = (res.headers.get('content-type') || '').toLowerCase()
  if (type.includes('text/html')) {
    throw new Error('That path isn’t a ROM file — the server sent a web page instead.')
  }
  const filename = decodeURIComponent(romUrl.split('/').pop()?.split('?')[0] || 'game.bin')
  const bytes = await res.arrayBuffer()
  const primary = new File([bytes], filename, { type: type || 'application/octet-stream' })
  if (!isDiscDescriptor(filename) || primary.size > 2_000_000) return primary

  let text = ''
  try {
    text = await primary.text()
  } catch {
    return primary
  }
  const refs = parseDiscReferences(filename, text)
  if (!refs.length) return primary

  const companions: File[] = []
  const missing: string[] = []
  for (const ref of refs) {
    const leaf = ref.replace(/\\/g, '/').split('/').pop() || ref
    if (leaf.toLowerCase() === filename.toLowerCase()) continue
    const file = await fetchHostedCompanion(siblingUrl(romUrl, leaf))
    if (file) companions.push(file)
    else missing.push(leaf)
  }
  if (missing.length && companions.length === 0) {
    throw new Error(missingCompanionsMessage(filename, missing) || 'Missing disc files.')
  }
  if (!companions.length) return primary
  return bundleIfNeeded([primary, ...companions])
}

export async function launchGame(
  game: Game,
  backRoute = hrefFor(`/game/${encodeURIComponent(game.id)}`),
): Promise<void> {
  pushRecent(game.id)

  let romUrl = game.file
  if (game.source === 'local' || hasLocalHandle(game.id) || game.file.startsWith('local://')) {
    const files = await getLocalRomFiles(game.id)
    const bundled = await bundleIfNeeded(files)
    // Blob URLs die on full-page navigation — stage bytes in IndexedDB instead.
    romUrl = await stageRomForPlay(bundled, bundled.name || `${game.title}.bin`)
  } else if (
    game.source === 'hosted' &&
    isDiscDescriptor(game.file) &&
    !game.file.startsWith('library:') &&
    !game.file.startsWith('idb:')
  ) {
    const bundled = await fetchHostedDiscSet(game.file)
    romUrl = await stageRomForPlay(bundled, bundled.name)
  }
  // Uploaded games already use durable library: refs — player reads without consuming.

  window.location.href = buildPlayerUrl(game, romUrl, backRoute)
}
