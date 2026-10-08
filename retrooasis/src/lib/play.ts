import type { Game } from './catalog'
import { coreNeedsThreads, normalizePlayCore } from './cores'
import {
  bundleFilesAsZip,
  discSetZipName,
  isDiscDescriptor,
  missingCompanionsMessage,
  parseDiscReferences,
} from './discSets'
import { BIOS_REF_PREFIX, biosKindFor, hasBios, type BiosKind } from './bios'
import { getLocalRomFiles, hasLocalHandle } from './localLibrary'
import { hrefFor } from './router'
import { stageRomForPlay } from './romBridge'
import { pushRecent, resolveEjsChannel } from './store'

/** Build a static-friendly player URL (hash back-link preserved). */
export function buildPlayerUrl(
  game: Game,
  romUrl: string,
  backPath: string,
  lanHost = false,
  transferPak = '',
  biosRef = '',
): string {
  const core = normalizePlayCore(game.core)
  const channel = lanHost ? 'local' : resolveEjsChannel(core)
  const params = new URLSearchParams({
    rom: romUrl,
    core,
    name: game.title,
    channel,
    back: backPath.startsWith('#') ? `./${backPath}` : `./#${backPath}`,
  })
  // The player records this game's save path under its id, for the game page's save card.
  params.set('gid', game.id)
  if (game.bios) params.set('bios', game.bios)
  else if (biosRef) params.set('bios', biosRef)
  if (coreNeedsThreads(core)) params.set('threads', '1')
  if (lanHost) params.set('lanhost', '1')
  // N64 Transfer Pak: a Game Boy / Color game in Controller 1 (Pokémon Stadium).
  if (transferPak && core === 'n64') params.set('tpk', transferPak)
  return `./player.html?${params.toString()}`
}

/** Trade & link page: the host's browser runs both linked handheld consoles. */
export function buildLinkUrl(game: Game, romUrl: string, backPath: string): string {
  const params = new URLSearchParams({
    rom: romUrl,
    system: normalizePlayCore(game.core),
    name: game.title,
    back: backPath.startsWith('#') ? `./${backPath}` : `./#${backPath}`,
  })
  return `./link.html?${params.toString()}`
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
  const queued = [...refs]
  const seen = new Set<string>([filename.toLowerCase()])
  while (queued.length) {
    const ref = queued.pop()!
    const leaf = ref.replace(/\\/g, '/').split('/').pop() || ref
    const key = leaf.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    const file = await fetchHostedCompanion(siblingUrl(romUrl, leaf))
    if (!file) {
      missing.push(leaf)
      continue
    }
    companions.push(file)
    if (isDiscDescriptor(file.name) && file.size < 2_000_000) {
      try {
        queued.push(...parseDiscReferences(file.name, await file.text()))
      } catch {
        /* ignore unreadable nested descriptors */
      }
    }
  }
  if (missing.length) {
    throw new Error(missingCompanionsMessage(filename, missing) || 'Missing disc files.')
  }
  if (!companions.length) return primary
  return bundleIfNeeded([primary, ...companions])
}

/** A ROM reference the player can read after a full-page navigation. */
async function playableRef(game: Game): Promise<string> {
  if (game.source === 'local' || hasLocalHandle(game.id) || game.file.startsWith('local://')) {
    const files = await getLocalRomFiles(game.id)
    const bundled = await bundleIfNeeded(files)
    return stageRomForPlay(bundled, bundled.name || `${game.title}.bin`)
  }
  return game.file
}

export async function launchGame(
  game: Game,
  backRoute = hrefFor(`/game/${encodeURIComponent(game.id)}`),
  lanHost: boolean | 'link' = false,
  transferPak?: Game,
  biosKind: BiosKind | null = biosKindFor(game),
): Promise<void> {
  pushRecent(game.id)
  const cartRef = transferPak ? await playableRef(transferPak) : ''
  const biosRef = biosKind && (await hasBios(biosKind)) ? `${BIOS_REF_PREFIX}${biosKind}` : ''

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

  window.location.href = lanHost === 'link' ? buildLinkUrl(game, romUrl, backRoute) : buildPlayerUrl(game, romUrl, backRoute, lanHost, cartRef, biosRef)
}
