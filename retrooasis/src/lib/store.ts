const RECENTS_KEY = 'retrooasis.recents'
const FAVORITES_KEY = 'retrooasis.favorites'
const ACCENT_KEY = 'retrooasis.accent'
const MAX_RECENTS = 12

export type AccentMode = 'sega' | 'ps'

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
