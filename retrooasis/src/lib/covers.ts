/** Libretro thumbnail CDN helpers (no API key). */

const SYSTEM_FOLDERS: Record<string, string> = {
  nes: 'Nintendo - Nintendo Entertainment System',
  snes: 'Nintendo - Super Nintendo Entertainment System',
  gb: 'Nintendo - Game Boy',
  gba: 'Nintendo - Game Boy Advance',
  n64: 'Nintendo - Nintendo 64',
  segaMD: 'Sega - Mega Drive - Genesis',
  segaMS: 'Sega - Master System - Mark III',
  segaGG: 'Sega - Game Gear',
  psx: 'Sony - PlayStation',
  arcade: 'MAME',
  nds: 'Nintendo - Nintendo DS',
}

const INVALID = /[&*/:`<>?\\|"]/g

export function libretroSystemFolder(platformId: string): string | null {
  return SYSTEM_FOLDERS[platformId] ?? null
}

/** Sanitize a game title for Named_Boxarts filenames. */
export function libretroThumbName(title: string): string {
  return title.replace(INVALID, '_').trim()
}

export function libretroBoxartUrl(platformId: string, title: string): string | null {
  const system = libretroSystemFolder(platformId)
  if (!system || !title.trim()) return null
  const file = `${libretroThumbName(title)}.png`
  const base = 'https://thumbnails.libretro.com'
  return `${base}/${encodeURIComponent(system).replace(/%20/g, '%20')}/Named_Boxarts/${encodeURIComponent(file)}`
}

/** Prefer existing cover; otherwise optional Libretro guess. */
export function resolveCoverUrl(
  platformId: string,
  title: string,
  cover: string | null | undefined,
  useLibretro: boolean,
): string | null {
  if (cover) return cover
  if (!useLibretro) return null
  return libretroBoxartUrl(platformId, title)
}
