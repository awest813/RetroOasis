/** Libretro thumbnail CDN helpers (no API key). */

const SYSTEM_FOLDERS: Record<string, string> = {
  nes: 'Nintendo - Nintendo Entertainment System',
  snes: 'Nintendo - Super Nintendo Entertainment System',
  gb: 'Nintendo - Game Boy',
  gba: 'Nintendo - Game Boy Advance',
  n64: 'Nintendo - Nintendo 64',
  nds: 'Nintendo - Nintendo DS',
  vb: 'Nintendo - Virtual Boy',
  '3ds': 'Nintendo - Nintendo 3DS',
  segaMD: 'Sega - Mega Drive - Genesis',
  segaMS: 'Sega - Master System - Mark III',
  segaGG: 'Sega - Game Gear',
  segaCD: 'Sega - Mega-CD - Sega CD',
  sega32x: 'Sega - 32X',
  segaSaturn: 'Sega - Saturn',
  psx: 'Sony - PlayStation',
  psp: 'Sony - PlayStation Portable',
  arcade: 'MAME',
  mame: 'MAME',
  atari2600: 'Atari - 2600',
  atari7800: 'Atari - 7800',
  atari5200: 'Atari - 5200',
  lynx: 'Atari - Lynx',
  jaguar: 'Atari - Jaguar',
  '3do': 'The 3DO Company - 3DO',
  pce: 'NEC - PC Engine - TurboGrafx 16',
  pcfx: 'NEC - PC-FX',
  ngp: 'SNK - Neo Geo Pocket',
  ws: 'Bandai - WonderSwan',
  coleco: 'Coleco - ColecoVision',
  c64: 'Commodore - 64',
  amiga: 'Commodore - Amiga',
  dos: 'DOS',
  intv: 'Mattel - Intellivision',
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
