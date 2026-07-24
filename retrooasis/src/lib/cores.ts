/** Map ROM extensions and folder names to EmulatorJS cores / platform ids. */

const EXT_TO_CORE: Record<string, string> = {
  nes: 'nes',
  fds: 'nes',
  unif: 'nes',
  unf: 'nes',
  smc: 'snes',
  fig: 'snes',
  sfc: 'snes',
  gd3: 'snes',
  gd7: 'snes',
  dx2: 'snes',
  bsx: 'snes',
  swc: 'snes',
  gb: 'gb',
  gbc: 'gb',
  gba: 'gba',
  nds: 'nds',
  z64: 'n64',
  n64: 'n64',
  v64: 'n64',
  md: 'segaMD',
  smd: 'segaMD',
  gen: 'segaMD',
  bin: 'segaMD', // ambiguous; folder wins when present
  iso: 'psx',
  cue: 'psx',
  img: 'psx',
  pbp: 'psx',
  chd: 'psx',
  sms: 'segaMS',
  gg: 'segaGG',
  zip: 'arcade',
  '7z': 'arcade',
}

const FOLDER_TO_PLATFORM: Record<string, string> = {
  nes: 'nes',
  famicom: 'nes',
  snes: 'snes',
  sfc: 'snes',
  gb: 'gb',
  gameboy: 'gb',
  gbc: 'gb',
  gba: 'gba',
  n64: 'n64',
  nintendo64: 'n64',
  psx: 'psx',
  ps1: 'psx',
  playstation: 'psx',
  segamd: 'segaMD',
  md: 'segaMD',
  genesis: 'segaMD',
  megadrive: 'segaMD',
  'mega-drive': 'segaMD',
  segams: 'segaMS',
  sms: 'segaMS',
  mastersystem: 'segaMS',
  'master-system': 'segaMS',
  arcade: 'arcade',
  mame: 'arcade',
  fbneo: 'arcade',
}

const PLATFORM_TO_CORE: Record<string, string> = {
  nes: 'nes',
  snes: 'snes',
  gb: 'gb',
  gba: 'gba',
  n64: 'n64',
  psx: 'psx',
  segaMD: 'segaMD',
  segaMS: 'segaMS',
  arcade: 'arcade',
}

const ROM_EXTENSIONS = new Set(Object.keys(EXT_TO_CORE))
const COVER_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif'])

export function normalizeFolderName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '')
}

export function platformFromFolder(name: string): string | null {
  const key = normalizeFolderName(name)
  return FOLDER_TO_PLATFORM[key] ?? null
}

export function coreForPlatform(platformId: string): string {
  return PLATFORM_TO_CORE[platformId] ?? platformId
}

export function coreFromExtension(filename: string, platformHint?: string | null): string | null {
  if (platformHint) return coreForPlatform(platformHint)
  const ext = filename.split('.').pop()?.toLowerCase()
  if (!ext) return null
  return EXT_TO_CORE[ext] ?? null
}

export function isRomFile(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase()
  return !!ext && ROM_EXTENSIONS.has(ext)
}

export function isCoverFile(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase()
  return !!ext && COVER_EXTENSIONS.has(ext)
}

export function titleFromFilename(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, '')
  return base
    .replace(/[._]+/g, ' ')
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s*\[[^\]]*]\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || filename
}

export function slugId(platform: string, filename: string): string {
  const raw = `${platform}-${filename}`.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  return `local-${raw.replace(/^-|-$/g, '')}`
}
