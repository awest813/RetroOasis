/** EmulatorJS system ids, extensions, and folder aliases (from data/src/consts.js). */

export const REQUIRES_THREADS = new Set(['ppsspp', 'psp', 'dosbox_pure', 'dos', 'azahar', '3ds'])

export const REQUIRES_WEBGL2 = new Set(['ppsspp', 'psp', 'azahar', '3ds'])

/** Canonical platform id → EmulatorJS core/system key. */
export const PLATFORM_TO_CORE: Record<string, string> = {
  nes: 'nes',
  snes: 'snes',
  gb: 'gb',
  gba: 'gba',
  n64: 'n64',
  nds: 'nds',
  vb: 'vb',
  '3ds': '3ds',
  psx: 'psx',
  psp: 'ppsspp',
  segaMD: 'segaMD',
  segaMS: 'segaMS',
  segaGG: 'segaGG',
  segaCD: 'segaCD',
  sega32x: 'sega32x',
  segaSaturn: 'segaSaturn',
  arcade: 'arcade',
  mame: 'mame2003',
  atari2600: 'atari2600',
  atari7800: 'atari7800',
  atari5200: 'atari5200',
  lynx: 'lynx',
  jaguar: 'jaguar',
  '3do': '3do',
  pce: 'pce',
  pcfx: 'pcfx',
  ngp: 'ngp',
  ws: 'ws',
  coleco: 'coleco',
  c64: 'vice_x64sc',
  c128: 'vice_x128',
  vic20: 'vice_xvic',
  plus4: 'vice_xplus4',
  pet: 'vice_xpet',
  amiga: 'puae',
  dos: 'dosbox_pure',
  intv: 'intv',
}

const EXT_TO_PLATFORM: Record<string, string> = {
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
  vb: 'vb',
  '3ds': '3ds',
  cci: '3ds',
  cia: '3ds',
  cxi: '3ds',
  app: '3ds',
  md: 'segaMD',
  smd: 'segaMD',
  gen: 'segaMD',
  sms: 'segaMS',
  gg: 'segaGG',
  '32x': 'sega32x',
  cue: 'psx',
  chd: 'psx',
  pbp: 'psp',
  cso: 'psp',
  prc: 'psp',
  iso: 'psp', // folder/platform hint preferred (also psx/segaCD/dos)
  img: 'psx',
  bin: 'psx',
  m3u: 'psx',
  zip: 'arcade',
  '7z': 'arcade',
  a26: 'atari2600',
  a78: 'atari7800',
  a52: 'atari5200',
  lnx: 'lynx',
  j64: 'jaguar',
  jag: 'jaguar',
  pce: 'pce',
  ngp: 'ngp',
  ngc: 'ngp',
  ws: 'ws',
  wsc: 'ws',
  col: 'coleco',
  cv: 'coleco',
  d64: 'c64',
  t64: 'c64',
  g64: 'c64',
  x64: 'c64',
  prg: 'c64',
  dsk: 'amiga',
  adf: 'amiga',
  hdf: 'amiga',
  ipf: 'amiga',
  exe: 'dos',
  com: 'dos',
  bat: 'dos',
  conf: 'dos',
  int: 'intv',
  itv: 'intv',
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
  nds: 'nds',
  ds: 'nds',
  vb: 'vb',
  virtualboy: 'vb',
  '3ds': '3ds',
  nintendo3ds: '3ds',
  psx: 'psx',
  ps1: 'psx',
  playstation: 'psx',
  psp: 'psp',
  ppsspp: 'psp',
  playstationportable: 'psp',
  segamd: 'segaMD',
  md: 'segaMD',
  genesis: 'segaMD',
  megadrive: 'segaMD',
  'mega-drive': 'segaMD',
  segams: 'segaMS',
  sms: 'segaMS',
  mastersystem: 'segaMS',
  'master-system': 'segaMS',
  segagg: 'segaGG',
  gg: 'segaGG',
  gamegear: 'segaGG',
  segacd: 'segaCD',
  megacd: 'segaCD',
  sega32x: 'sega32x',
  '32x': 'sega32x',
  segasaturn: 'segaSaturn',
  saturn: 'segaSaturn',
  arcade: 'arcade',
  mame: 'mame',
  fbneo: 'arcade',
  atari2600: 'atari2600',
  a2600: 'atari2600',
  atari7800: 'atari7800',
  a7800: 'atari7800',
  atari5200: 'atari5200',
  a5200: 'atari5200',
  lynx: 'lynx',
  jaguar: 'jaguar',
  '3do': '3do',
  pce: 'pce',
  tg16: 'pce',
  pcengine: 'pce',
  turbografx: 'pce',
  pcfx: 'pcfx',
  ngp: 'ngp',
  ngpc: 'ngp',
  neogeopocket: 'ngp',
  ws: 'ws',
  wswan: 'ws',
  wonderswan: 'ws',
  coleco: 'coleco',
  colecovision: 'coleco',
  c64: 'c64',
  commodore64: 'c64',
  c128: 'c128',
  vic20: 'vic20',
  plus4: 'plus4',
  pet: 'pet',
  amiga: 'amiga',
  dos: 'dos',
  dosbox: 'dos',
  pc: 'dos',
  intv: 'intv',
  intellivision: 'intv',
}

const ROM_EXTENSIONS = new Set(Object.keys(EXT_TO_PLATFORM))
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
  const platform = EXT_TO_PLATFORM[ext]
  return platform ? coreForPlatform(platform) : null
}

export function platformFromExtension(filename: string): string | null {
  const ext = filename.split('.').pop()?.toLowerCase()
  if (!ext) return null
  return EXT_TO_PLATFORM[ext] ?? null
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
  return (
    base
      .replace(/[._]+/g, ' ')
      .replace(/\s*\([^)]*\)\s*/g, ' ')
      .replace(/\s*\[[^\]]*]\s*/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || filename
  )
}

export function slugId(platform: string, filename: string): string {
  const raw = `${platform}-${filename}`.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  return `local-${raw.replace(/^-|-$/g, '')}`
}

export function coreNeedsThreads(core: string): boolean {
  return REQUIRES_THREADS.has(core) || REQUIRES_THREADS.has(core.toLowerCase())
}

export function normalizePlayCore(core: string): string {
  if (core === 'psp') return 'ppsspp'
  if (core === 'dos') return 'dosbox_pure'
  if (core === '3ds') return 'azahar'
  return core
}

/** All EmulatorJS system keys users can pick in Upload. */
export const UPLOAD_CORE_OPTIONS: Array<{ label: string; value: string }> = [
  { label: 'Auto-detect', value: 'auto' },
  { label: 'NES', value: 'nes' },
  { label: 'SNES', value: 'snes' },
  { label: 'Game Boy / Color', value: 'gb' },
  { label: 'Game Boy Advance', value: 'gba' },
  { label: 'Nintendo DS', value: 'nds' },
  { label: 'Nintendo 64', value: 'n64' },
  { label: 'Virtual Boy', value: 'vb' },
  { label: 'Nintendo 3DS (threads)', value: '3ds' },
  { label: 'PlayStation', value: 'psx' },
  { label: 'PlayStation Portable / PPSSPP (threads)', value: 'ppsspp' },
  { label: 'Sega Mega Drive / Genesis', value: 'segaMD' },
  { label: 'Sega Master System', value: 'segaMS' },
  { label: 'Sega Game Gear', value: 'segaGG' },
  { label: 'Sega CD', value: 'segaCD' },
  { label: 'Sega 32X', value: 'sega32x' },
  { label: 'Sega Saturn', value: 'segaSaturn' },
  { label: 'Arcade (FBNeo)', value: 'arcade' },
  { label: 'MAME 2003', value: 'mame2003' },
  { label: 'Atari 2600', value: 'atari2600' },
  { label: 'Atari 7800', value: 'atari7800' },
  { label: 'Atari 5200', value: 'atari5200' },
  { label: 'Atari Lynx', value: 'lynx' },
  { label: 'Atari Jaguar', value: 'jaguar' },
  { label: '3DO', value: '3do' },
  { label: 'PC Engine / TurboGrafx-16', value: 'pce' },
  { label: 'PC-FX', value: 'pcfx' },
  { label: 'Neo Geo Pocket', value: 'ngp' },
  { label: 'WonderSwan', value: 'ws' },
  { label: 'ColecoVision', value: 'coleco' },
  { label: 'Commodore 64', value: 'vice_x64sc' },
  { label: 'Commodore 128', value: 'vice_x128' },
  { label: 'Commodore VIC-20', value: 'vice_xvic' },
  { label: 'Commodore Plus/4', value: 'vice_xplus4' },
  { label: 'Commodore PET', value: 'vice_xpet' },
  { label: 'Amiga', value: 'puae' },
  { label: 'DOS (threads)', value: 'dosbox_pure' },
  { label: 'Intellivision', value: 'intv' },
]
