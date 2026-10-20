/**
 * Talks to the RetroAchievements web API from the browser.
 * Unlocks are not submitted: EmulatorJS cores don’t run the achievement runtime,
 * and the site does not accept browser clients on the emulator protocol.
 */

import type { Game } from './catalog'
import { getLocalRomFiles, hasLocalHandle } from './localLibrary'
import { consolesForMatchedFile, hashForPlan, planRaHash, type ByteSource } from './raHash'
import {
  clearRaAccount,
  getRaAccount,
  getRaLink,
  parseGameList,
  parseProfile,
  parseProgress,
  raFailureMessage,
  rememberProgress,
  setRaAccount,
  setRaLink,
  type RaAccount,
  type RaCard,
  type RaListedGame,
  type RaProfile,
  type RaProgress,
} from './raModel'
import { getUploadedRomFile } from './uploadedLibrary'

const API = 'https://retroachievements.org/API/'
const INDEX_TTL = 7 * 24 * 60 * 60 * 1000
const UNMATCHED_TTL = 7 * 24 * 60 * 60 * 1000
const DB_NAME = 'retrooasis-ra'
const DB_STORE = 'consoles'

interface StoredIndex {
  at: number
  games: RaListedGame[]
}

const memoryIndex = new Map<number, StoredIndex>()

export function raHashPath(game: Pick<Game, 'file' | 'romFilename'>): string {
  const file = game.file || ''
  if (!file || /^(?:local|library|idb|blob):/.test(file)) return game.romFilename || 'game.bin'
  return file
}

function sourceFromFile(file: File): ByteSource {
  return {
    size: file.size,
    async read(start: number, end: number) {
      const slice = file.slice(Math.max(0, start), Math.min(file.size, Math.max(start, end)))
      return new Uint8Array(await slice.arrayBuffer())
    },
  }
}

async function raGet(file: string, params: Record<string, string>, signal?: AbortSignal): Promise<{ status: number; body: unknown }> {
  const url = new URL(file, API)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  let response: Response
  try {
    response = await fetch(url, { signal, cache: 'no-store' })
  } catch (err) {
    if (signal?.aborted) throw err
    throw new Error('Couldn’t reach RetroAchievements. Check your connection and try again.')
  }
  const text = await response.text()
  let body: unknown = null
  if (text) {
    try {
      body = JSON.parse(text) as unknown
    } catch {
      body = null
    }
  }
  return { status: response.status, body }
}

function authParams(account: RaAccount): Record<string, string> {
  return { y: account.key, u: account.username }
}

export async function connectRaAccount(username: string, key: string, signal?: AbortSignal): Promise<RaProfile> {
  const user = username.trim()
  const apiKey = key.trim()
  if (!user || !apiKey) throw new Error('Enter your RetroAchievements username and web API key.')
  const { status, body } = await raGet('API_GetUserSummary.php', { u: user, y: apiKey, g: '0', a: '0' }, signal)
  if (status !== 200) throw new Error(raFailureMessage(status, body))
  const profile = parseProfile(body, user)
  if (!profile) throw new Error('RetroAchievements couldn’t find that username.')
  setRaAccount({ ...profile, username: profile.username, key: apiKey })
  return profile
}

export async function refreshRaProfile(signal?: AbortSignal): Promise<RaProfile | 'unauthorized' | 'offline' | null> {
  const account = getRaAccount()
  if (!account) return null
  try {
    const { status, body } = await raGet('API_GetUserSummary.php', { ...authParams(account), g: '0', a: '0' }, signal)
    if (status === 401) {
      clearRaAccount()
      return 'unauthorized'
    }
    if (status !== 200) return 'offline'
    const profile = parseProfile(body, account.username)
    if (!profile) return 'offline'
    setRaAccount({ ...account, ...profile, key: account.key })
    return profile
  } catch (err) {
    if (signal?.aborted) throw err
    return 'offline'
  }
}

export function disconnectRaAccount(): void {
  clearRaAccount()
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(DB_STORE)) req.result.createObjectStore(DB_STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'))
  })
}

async function readStoredIndex(consoleId: number): Promise<StoredIndex | null> {
  const cached = memoryIndex.get(consoleId)
  if (cached) return cached
  try {
    const db = await openDb()
    const stored = await new Promise<StoredIndex | undefined>((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readonly')
      const req = tx.objectStore(DB_STORE).get(consoleId)
      req.onsuccess = () => resolve(req.result as StoredIndex | undefined)
      req.onerror = () => reject(req.error)
    })
    db.close()
    if (stored?.games && stored.at) {
      memoryIndex.set(consoleId, stored)
      return stored
    }
  } catch {
    /* a full or blocked database still allows a one-off lookup */
  }
  return null
}

async function writeStoredIndex(consoleId: number, index: StoredIndex): Promise<void> {
  memoryIndex.set(consoleId, index)
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite')
      tx.objectStore(DB_STORE).put(index, consoleId)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch {
    /* memory copy is enough for this visit */
  }
}

function indexMap(index: StoredIndex): Map<string, RaListedGame> {
  const map = new Map<string, RaListedGame>()
  for (const game of index.games) {
    for (const hash of game.hashes) map.set(hash, game)
  }
  return map
}

async function consoleIndex(account: RaAccount, consoleId: number, fresh: boolean, signal?: AbortSignal): Promise<Map<string, RaListedGame>> {
  const cached = await readStoredIndex(consoleId)
  if (cached && !fresh && Date.now() - cached.at < INDEX_TTL) return indexMap(cached)
  try {
    const { status, body } = await raGet('API_GetGameList.php', { ...authParams(account), i: String(consoleId), h: '1', f: '1' }, signal)
    if (status !== 200) {
      if (cached) return indexMap(cached)
      throw new Error(raFailureMessage(status, body))
    }
    const games = parseGameList(body).filter((game) => game.hashes.length > 0)
    if (!games.length && cached) return indexMap(cached)
    const stored = { at: Date.now(), games }
    await writeStoredIndex(consoleId, stored)
    return indexMap(stored)
  } catch (err) {
    if (signal?.aborted) throw err
    if (cached) return indexMap(cached)
    throw err
  }
}

async function openGame(
  game: Game,
  signal?: AbortSignal,
  skipFileKey = '',
): Promise<{ source: ByteSource; name: string; fileKey: string; unchanged?: boolean } | { reason: string; missing?: boolean }> {
  if (game.source === 'upload' || game.file.startsWith('library:')) {
    try {
      const file = await getUploadedRomFile(game.id)
      return { source: sourceFromFile(file), name: file.name, fileKey: `${file.name}:${file.size}` }
    } catch (err) {
      return { reason: err instanceof Error ? err.message : 'That ROM isn’t on this device anymore.', missing: true }
    }
  }
  if (game.source === 'local' || game.file.startsWith('local://') || hasLocalHandle(game.id)) {
    try {
      const files = await getLocalRomFiles(game.id)
      const file = files[0]
      if (!file) return { reason: 'That ROM isn’t in the linked folder anymore.', missing: true }
      return { source: sourceFromFile(file), name: file.name, fileKey: `${file.name}:${file.size}` }
    } catch (err) {
      return { reason: err instanceof Error ? err.message : 'Lost access to that folder. Link it again in Settings.', missing: true }
    }
  }
  if (!game.file || game.demo) return { reason: 'Add the ROM on this device to match it.', missing: true }
  try {
    const response = await fetch(game.file, { signal, cache: 'no-store' })
    if (!response.ok) return { reason: 'Couldn’t read that ROM to match it.', missing: true }
    const type = (response.headers.get('content-type') || '').toLowerCase()
    if (type.includes('text/html')) {
      await response.body?.cancel()
      return { reason: 'Add the ROM on this device to match it.', missing: true }
    }
    const name = game.romFilename || game.file.split('/').pop() || 'game.bin'
    const length = Number(response.headers.get('content-length') || 0)
    if (length > 192 * 1024 * 1024) {
      await response.body?.cancel()
      return { reason: 'That ROM is too large to match in the browser.' }
    }
    // Same URL and size as a match we already stored: don't download the ROM again.
    if (skipFileKey && length > 0 && skipFileKey === `${name}:${length}`) {
      await response.body?.cancel()
      return { source: sourceFromFile(new File([], name)), name, fileKey: skipFileKey, unchanged: true }
    }
    const blob = await response.blob()
    return { source: sourceFromFile(new File([blob], name)), name, fileKey: `${name}:${blob.size}` }
  } catch (err) {
    if (signal?.aborted) throw err
    return { reason: 'Couldn’t read that ROM to match it.', missing: true }
  }
}

async function loadProgress(account: RaAccount, gameId: number, signal?: AbortSignal): Promise<RaProgress> {
  const { status, body } = await raGet('API_GetGameInfoAndUserProgress.php', { ...authParams(account), g: String(gameId) }, signal)
  if (status !== 200) throw new Error(raFailureMessage(status, body))
  const progress = parseProgress(body)
  if (!progress) throw new Error('RetroAchievements sent a response RetroOasis couldn’t read.')
  rememberProgress(progress)
  return progress
}

function readyCard(progress: RaProgress): RaCard {
  const matched = progress.consoleName ? `${progress.title} on ${progress.consoleName}` : progress.title
  return {
    state: 'ready',
    message: `Matched to ${matched}. Playing here doesn’t unlock these — earn them in RetroArch or another supported emulator, then check again.`,
    progress,
  }
}

export async function loadGameAchievements(
  game: Game,
  opts: { fresh?: boolean; signal?: AbortSignal; onStatus?: (message: string) => void } = {},
): Promise<RaCard> {
  const account = getRaAccount()
  if (!account) {
    return {
      state: 'signed-out',
      message: 'Connect RetroAchievements in Settings to see your progress for this game. Playing here doesn’t unlock achievements.',
    }
  }
  const path = raHashPath(game)
  const plan = planRaHash(game.platform, path)
  if ('reason' in plan) return { state: 'unsupported', message: plan.reason }

  const status = (message: string) => opts.onStatus?.(message)
  let hash = ''
  let fileKey = plan.kind === 'arcade' ? `arcade:${plan.arcadeName}` : ''
  let consoleIds = consolesForMatchedFile(plan, path)
  const previous = getRaLink(game.id)

  if (plan.kind === 'arcade') {
    const hashed = await hashForPlan({ size: 0, async read() { return new Uint8Array() } }, path, plan)
    if ('reason' in hashed) return { state: 'unsupported', message: hashed.reason }
    hash = hashed.hash
  } else {
    status('Reading the ROM…')
    const reusable = !opts.fresh && previous?.hash ? previous.fileKey : ''
    const opened = await openGame(game, opts.signal, reusable)
    if ('reason' in opened) return { state: opened.missing ? 'missing' : 'error', message: opened.reason }
    fileKey = opened.fileKey
    if (!opts.fresh && previous && previous.fileKey === fileKey && previous.hash) {
      hash = previous.hash
    } else {
      const hashed = await hashForPlan(opened.source, opened.name, plan)
      if ('reason' in hashed) return { state: 'unsupported', message: hashed.reason }
      hash = hashed.hash
      consoleIds = consolesForMatchedFile(plan, path, hashed.name ?? '')
    }
  }

  if (!opts.fresh && previous && previous.fileKey === fileKey && previous.hash === hash && previous.raId <= 0 && Date.now() - previous.at < UNMATCHED_TTL) {
    return { state: 'unmatched', message: 'RetroAchievements has no set for this file.' }
  }

  status('Matching with RetroAchievements…')
  let listed: RaListedGame | null = null
  if (!opts.fresh && previous && previous.fileKey === fileKey && previous.hash === hash && previous.raId > 0) {
    listed = { id: previous.raId, title: '', icon: '', points: 0, achievements: 0, hashes: [hash] }
  } else {
    try {
      for (const consoleId of consoleIds) {
        if (!memoryIndex.has(consoleId)) status('Downloading this system’s achievement list…')
        const index = await consoleIndex(account, consoleId, Boolean(opts.fresh), opts.signal)
        const hit = index.get(hash.toLowerCase())
        if (hit) {
          listed = hit
          break
        }
      }
    } catch (err) {
      if (opts.signal?.aborted) throw err
      return { state: 'error', message: err instanceof Error ? err.message : 'Couldn’t match this game.' }
    }
    setRaLink(game.id, { fileKey, hash, raId: listed?.id ?? 0, at: Date.now() })
    if (!listed) return { state: 'unmatched', message: 'RetroAchievements has no set for this file.' }
  }

  status('Loading your progress…')
  try {
    const progress = await loadProgress(account, listed.id, opts.signal)
    setRaLink(game.id, { fileKey, hash, raId: progress.id, at: Date.now() })
    return readyCard(progress)
  } catch (err) {
    if (opts.signal?.aborted) throw err
    return { state: 'error', message: err instanceof Error ? err.message : 'Couldn’t load achievements for this game.' }
  }
}

export async function matchSavedGames(
  games: Game[],
  onStatus: (message: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const targets = games.filter((game) => !game.demo && (game.source === 'upload' || game.source === 'local' || game.file.startsWith('local://') || game.file.startsWith('library:')))
  if (!targets.length) return 'No saved or linked games to match. Open a hosted game’s page to check that one.'
  let matched = 0
  let none = 0
  let skipped = 0
  let failed = 0
  for (let i = 0; i < targets.length; i++) {
    if (signal?.aborted) return 'Stopped. The games already checked keep their results.'
    onStatus(`Checking ${i + 1} of ${targets.length}…`)
    try {
      const card = await loadGameAchievements(targets[i], { signal })
      if (card.state === 'error' && /web API key/i.test(card.message)) {
        clearRaAccount()
        return card.message
      }
      if (card.state === 'error' && /busy/i.test(card.message)) {
        return matched ? `${card.message} Matched ${matched} before stopping.` : card.message
      }
      if (card.state === 'ready') matched += 1
      else if (card.state === 'unmatched') none += 1
      else if (card.state === 'unsupported' || card.state === 'missing') skipped += 1
      else failed += 1
    } catch {
      if (signal?.aborted) return 'Stopped. The games already checked keep their results.'
      failed += 1
    }
  }
  const parts = [`Matched ${matched} of ${targets.length}`]
  if (none) parts.push(`${none} ${none === 1 ? 'has' : 'have'} no achievement set`)
  if (skipped) parts.push(`${skipped} can’t be checked`)
  if (failed) parts.push(`${failed} didn’t finish`)
  return `${parts.join('. ')}.`
}
