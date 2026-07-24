const RECENTS_KEY = 'retrooasis.recents'
const FAVORITES_KEY = 'retrooasis.favorites'
const ACCENT_KEY = 'retrooasis.accent'
const CRT_KEY = 'retrooasis.crt'
const HIDE_DEMOS_KEY = 'retrooasis.hideDemos'
const LAYOUT_KEY = 'retrooasis.layout'
const SOUNDS_KEY = 'retrooasis.sounds'
const SOUND_PACK_KEY = 'retrooasis.soundPack'
const LIBRETRO_COVERS_KEY = 'retrooasis.libretroCovers'
const MAX_RECENTS = 12

export type AccentMode = 'sega' | 'ps'
export type LayoutMode = 'standard' | 'tv'
export type SoundPack = 'soft' | 'arcade'

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value))
}

export function getRecents(): string[] {
  return readJson<string[]>(RECENTS_KEY, [])
}

export function pushRecent(gameId: string): void {
  const next = [gameId, ...getRecents().filter((id) => id !== gameId)].slice(0, MAX_RECENTS)
  writeJson(RECENTS_KEY, next)
}

export function clearRecents(): void {
  localStorage.removeItem(RECENTS_KEY)
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
  writeJson(FAVORITES_KEY, next)
  return !exists
}

export function clearFavorites(): void {
  localStorage.removeItem(FAVORITES_KEY)
}

export function getAccent(): AccentMode {
  const value = localStorage.getItem(ACCENT_KEY)
  return value === 'ps' ? 'ps' : 'sega'
}

export function setAccent(mode: AccentMode): void {
  localStorage.setItem(ACCENT_KEY, mode)
  document.documentElement.dataset.accent = mode
}

export function applyStoredAccent(): void {
  document.documentElement.dataset.accent = getAccent()
}

export function getCrtEnabled(): boolean {
  return localStorage.getItem(CRT_KEY) === '1'
}

export function setCrtEnabled(enabled: boolean): void {
  localStorage.setItem(CRT_KEY, enabled ? '1' : '0')
  document.documentElement.dataset.crt = enabled ? 'on' : 'off'
}

export function applyStoredCrt(): void {
  document.documentElement.dataset.crt = getCrtEnabled() ? 'on' : 'off'
}

export function getHideDemos(): boolean {
  return localStorage.getItem(HIDE_DEMOS_KEY) === '1'
}

export function setHideDemos(hide: boolean): void {
  localStorage.setItem(HIDE_DEMOS_KEY, hide ? '1' : '0')
}

export function getLayout(): LayoutMode {
  return localStorage.getItem(LAYOUT_KEY) === 'tv' ? 'tv' : 'standard'
}

export function setLayout(mode: LayoutMode): void {
  localStorage.setItem(LAYOUT_KEY, mode)
  document.documentElement.dataset.layout = mode
}

export function applyStoredLayout(): void {
  document.documentElement.dataset.layout = getLayout()
}

export function getSoundsEnabled(): boolean {
  return localStorage.getItem(SOUNDS_KEY) === '1'
}

export function setSoundsEnabled(enabled: boolean): void {
  localStorage.setItem(SOUNDS_KEY, enabled ? '1' : '0')
}

export function getSoundPack(): SoundPack {
  return localStorage.getItem(SOUND_PACK_KEY) === 'arcade' ? 'arcade' : 'soft'
}

export function setSoundPack(pack: SoundPack): void {
  localStorage.setItem(SOUND_PACK_KEY, pack)
}

export function getLibretroCovers(): boolean {
  return localStorage.getItem(LIBRETRO_COVERS_KEY) !== '0'
}

export function setLibretroCovers(enabled: boolean): void {
  localStorage.setItem(LIBRETRO_COVERS_KEY, enabled ? '1' : '0')
}

export function clearLocalPrefs(): void {
  clearRecents()
  clearFavorites()
}
