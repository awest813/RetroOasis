import { coreNeedsThreads } from './cores'

const RECENTS_KEY = 'retrooasis.recents'
const FAVORITES_KEY = 'retrooasis.favorites'
const ACCENT_KEY = 'retrooasis.accent'
const CRT_KEY = 'retrooasis.crt'
const HIDE_DEMOS_KEY = 'retrooasis.hideDemos'
const LAYOUT_KEY = 'retrooasis.layout'
const SOUNDS_KEY = 'retrooasis.sounds'
const SOUND_PACK_KEY = 'retrooasis.soundPack'
const LIBRETRO_COVERS_KEY = 'retrooasis.libretroCovers'
const EJS_CHANNEL_KEY = 'retrooasis.ejsChannel'
const MAX_RECENTS = 12

export type AccentMode = 'sega' | 'ps'
export type LayoutMode = 'standard' | 'tv'
export type SoundPack = 'soft' | 'arcade' | 'xmb'
/** Where EmulatorJS loader + cores are fetched from. Stable for most; nightly for PSP/3DS/DOS. */
export type EjsChannel = 'local' | 'stable' | 'latest' | 'nightly'

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

function writeRaw(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* quota / private mode — keep the in-session change */
  }
}

function removeRaw(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

export function getRecents(): string[] {
  return readJson<string[]>(RECENTS_KEY, [])
}

export function pushRecent(gameId: string): void {
  const next = [gameId, ...getRecents().filter((id) => id !== gameId)].slice(0, MAX_RECENTS)
  writeJson(RECENTS_KEY, next)
}

export function clearRecents(): void {
  removeRaw(RECENTS_KEY)
}

export function getFavorites(): string[] {
  return readJson<string[]>(FAVORITES_KEY, [])
}

export function isFavorite(gameId: string): boolean {
  return getFavorites().includes(gameId)
}

export function toggleFavorite(gameId: string): boolean {
  const current = getFavorites()
  const exists = current.includes(gameId)
  const next = exists ? current.filter((id) => id !== gameId) : [...current, gameId]
  if (!writeJson(FAVORITES_KEY, next)) return exists
  return !exists
}

export function clearFavorites(): void {
  removeRaw(FAVORITES_KEY)
}

/** Drop a game id from recents + favorites (e.g. after removing a saved upload). */
export function forgetGameId(gameId: string): void {
  writeJson(
    RECENTS_KEY,
    getRecents().filter((id) => id !== gameId),
  )
  writeJson(
    FAVORITES_KEY,
    getFavorites().filter((id) => id !== gameId),
  )
}

export function forgetGameIds(gameIds: string[]): void {
  if (!gameIds.length) return
  const drop = new Set(gameIds)
  writeJson(
    RECENTS_KEY,
    getRecents().filter((id) => !drop.has(id)),
  )
  writeJson(
    FAVORITES_KEY,
    getFavorites().filter((id) => !drop.has(id)),
  )
}

export function getAccent(): AccentMode {
  try {
    const value = localStorage.getItem(ACCENT_KEY)
    return value === 'ps' ? 'ps' : 'sega'
  } catch {
    return 'sega'
  }
}

export function setAccent(mode: AccentMode): void {
  writeRaw(ACCENT_KEY, mode)
  document.documentElement.dataset.accent = mode
}

export function applyStoredAccent(): void {
  document.documentElement.dataset.accent = getAccent()
}

export function getCrtEnabled(): boolean {
  try {
    return localStorage.getItem(CRT_KEY) === '1'
  } catch {
    return false
  }
}

export function setCrtEnabled(enabled: boolean): void {
  writeRaw(CRT_KEY, enabled ? '1' : '0')
  document.documentElement.dataset.crt = enabled ? 'on' : 'off'
}

export function applyStoredCrt(): void {
  document.documentElement.dataset.crt = getCrtEnabled() ? 'on' : 'off'
}

export function getHideDemos(): boolean {
  try {
    return localStorage.getItem(HIDE_DEMOS_KEY) === '1'
  } catch {
    return false
  }
}

export function setHideDemos(hide: boolean): void {
  writeRaw(HIDE_DEMOS_KEY, hide ? '1' : '0')
}

export function getLayout(): LayoutMode {
  try {
    return localStorage.getItem(LAYOUT_KEY) === 'tv' ? 'tv' : 'standard'
  } catch {
    return 'standard'
  }
}

export function setLayout(mode: LayoutMode): void {
  writeRaw(LAYOUT_KEY, mode)
  document.documentElement.dataset.layout = mode
}

export function applyStoredLayout(): void {
  document.documentElement.dataset.layout = getLayout()
}

export function getSoundsEnabled(): boolean {
  try {
    return localStorage.getItem(SOUNDS_KEY) === '1'
  } catch {
    return false
  }
}

export function setSoundsEnabled(enabled: boolean): void {
  writeRaw(SOUNDS_KEY, enabled ? '1' : '0')
}

export function getSoundPack(): SoundPack {
  try {
    const raw = localStorage.getItem(SOUND_PACK_KEY)
    if (raw === 'arcade' || raw === 'xmb' || raw === 'soft') return raw
  } catch {
    /* ignore */
  }
  return 'soft'
}

export function setSoundPack(pack: SoundPack): void {
  writeRaw(SOUND_PACK_KEY, pack)
}

export function getLibretroCovers(): boolean {
  // Opt-in: Libretro CDN images are blocked under COEP (SharedArrayBuffer),
  // so defaulting on floods the console and never paints covers.
  try {
    return localStorage.getItem(LIBRETRO_COVERS_KEY) === '1'
  } catch {
    return false
  }
}

export function setLibretroCovers(enabled: boolean): void {
  writeRaw(LIBRETRO_COVERS_KEY, enabled ? '1' : '0')
}

const EJS_CHANNEL_LABELS: Record<EjsChannel, string> = {
  local: 'Local',
  stable: 'Stable',
  latest: 'Latest',
  nightly: 'Nightly',
}

export function getEjsChannel(): EjsChannel {
  try {
    const value = localStorage.getItem(EJS_CHANNEL_KEY)
    if (value === 'local' || value === 'stable' || value === 'latest' || value === 'nightly') {
      return value
    }
  } catch {
    /* ignore */
  }
  // Stable CDN cores for most systems; PSP / 3DS / DOS still resolve to nightly at launch.
  return 'stable'
}

/** User-facing label for the Emulator files channel (Settings / upload status). */
export function formatEjsChannelLabel(channel: EjsChannel = getEjsChannel()): string {
  return EJS_CHANNEL_LABELS[channel]
}

/**
 * Effective EmulatorJS CDN channel for a core.
 * Local always wins. PSP / 3DS / DOS need Nightly builds (unless Local).
 * Otherwise honor the Settings preference (Stable / Nightly / Latest).
 */
export function resolveEjsChannel(core: string): EjsChannel {
  const preferred = getEjsChannel()
  if (preferred === 'local') return 'local'
  if (coreNeedsThreads(core)) return 'nightly'
  if (preferred === 'nightly' || preferred === 'latest') return preferred
  return 'stable'
}

export function setEjsChannel(channel: EjsChannel): void {
  writeRaw(EJS_CHANNEL_KEY, channel)
}

export function clearLocalPrefs(): void {
  clearRecents()
  clearFavorites()
}
