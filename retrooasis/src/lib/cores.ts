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
  ccd: 'psx', // CloneCD descriptor shipped with .img PSX dumps
  toc: 'psx',
  ecm: 'psx', // ECM-compressed .bin, common in PSX rips
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

/** Containers EmulatorJS can extract at play time; platform comes from their contents. */
export const ARCHIVE_EXTENSIONS = new Set(['zip', '7z', 'rar'])

/** ROM containers with no single-platform extension mapping (see peekArchive). */
const EXTRA_ROM_EXTENSIONS = new Set(['rar'])

const COVER_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif'])

export function normalizeFolderName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '')
}

/**
 * Folder names as Libretro / No-Intro / Redump collections spell them ("Nintendo - Game Boy
 * Advance", "Sega - Mega Drive - Genesis"). Keys are letters and digits only.
 */
const FOLDER_LONG_NAMES: Record<string, string> = {
  nintendoentertainmentsystem: 'nes',
  supernintendoentertainmentsystem: 'snes',
  supernintendo: 'snes',
  superfamicom: 'snes',
  gameboycolor: 'gb',
  gameboyadvance: 'gba',
  nintendods: 'nds',
  nintendodsi: 'nds',
  megadrivegenesis: 'segaMD',
  genesismegadrive: 'segaMD',
  segamegadrive: 'segaMD',
  segagenesis: 'segaMD',
  segamastersystem: 'segaMS',
  segagamegear: 'segaGG',
  segacdmegacd: 'segaCD',
  megacdsegacd: 'segaCD',
  segasaturn: 'segaSaturn',
  sonyplaystation: 'psx',
  sonyplaystationportable: 'psp',
  turbografx16: 'pce',
  pcenginetg16: 'pce',
  pcengineturbografx16: 'pce',
  neogeopocketcolor: 'ngp',
  wonderswancolor: 'ws',
  atarilynx: 'lynx',
  atarijaguar: 'jaguar',
}

/** Platform for a ROM folder name: short aliases ("gba", "Mega Drive") and long collection names. */
export function platformFromFolder(name: string): string | null {
  const direct = FOLDER_TO_PLATFORM[normalizeFolderName(name)]
  if (direct) return direct
  // "Maker - System [ - Region name]": try the whole name, then each part, letters and digits only.
  const squash = (text: string) => text.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '')
  const parts = name.split(/\s+-\s+/)
  const candidates = [squash(name), ...parts.map(squash), ...(parts.length > 2 ? [squash(parts.slice(1).join(' '))] : [])]
  for (const key of candidates) {
    const platform = FOLDER_LONG_NAMES[key] ?? FOLDER_TO_PLATFORM[key]
    if (platform) return platform
  }
  return null
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

export function isArchiveFile(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase()
  return !!ext && ARCHIVE_EXTENSIONS.has(ext)
}

const ARCHIVE_NAME_HINTS: Array<{ platform: string; test: (name: string, path: string) => boolean }> = [
  { platform: 'psp', test: (name, path) => name === 'UMD_DATA.BIN' || name === 'EBOOT.PBP' || path.includes('/PSP_GAME/') || path.startsWith('PSP_GAME/') },
  { platform: 'psx', test: (name) => name === 'SYSTEM.CNF' || name === 'PSX.EXE' || /^[A-Z]{4}_\d{3}\.\d{2}$/.test(name) },
  { platform: 'segaCD', test: (name) => name === 'IP.BIN' || name === 'ABS.TXT' || name === 'BIB.TXT' || name === 'CPY.TXT' },
  { platform: '3do', test: (name) => name === 'LAUNCHME' || name === 'LAUNCH.ME' },
]

/**
 * Platform for one entry filename found inside an archive.
 * Nested archives are skipped — a .zip inside a .zip says nothing about the game.
 */
export function platformForArchiveEntry(filename: string): string | null {
  const normalized = filename.replace(/\\/g, '/')
  const leaf = normalized.split('/').pop() ?? normalized
  const name = leaf.toUpperCase()
  const path = `/${normalized}/`.toUpperCase()
  for (const hint of ARCHIVE_NAME_HINTS) {
    if (hint.test(name, path)) return hint.platform
  }
  const ext = leaf.split('.').pop()?.toLowerCase()
  if (!ext || ARCHIVE_EXTENSIONS.has(ext)) return null
  // Loose .iso/.img are shared by PSP, PSX, Sega CD, 3DO, and DOS — path
  // hints above must decide, otherwise Auto-detect asks the user.
  if (ext === 'iso' || ext === 'img') return null
  return EXT_TO_PLATFORM[ext] ?? null
}

export function isRomFile(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase()
  if (!ext) return false
  return ROM_EXTENSIONS.has(ext) || EXTRA_ROM_EXTENSIONS.has(ext)
}

export function isCoverFile(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase()
  return !!ext && COVER_EXTENSIONS.has(ext)
}

/** Comma-separated accept list for `<input type="file">`. */
export function romFileAccept(): string {
  return [...new Set([...ROM_EXTENSIONS, ...EXTRA_ROM_EXTENSIONS])]
    .map((ext) => `.${ext}`)
    .sort()
    .join(',')
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
export const UPLOAD_CORE_OPTIONS: Array<{ label: string; value: string; group?: string }> = [
  { label: 'Auto-detect', value: 'auto' },
  { label: 'NES', value: 'nes', group: 'Nintendo' },
  { label: 'SNES', value: 'snes', group: 'Nintendo' },
  { label: 'Game Boy / Color', value: 'gb', group: 'Nintendo' },
  { label: 'Game Boy Advance', value: 'gba', group: 'Nintendo' },
  { label: 'Nintendo DS', value: 'nds', group: 'Nintendo' },
  { label: 'Nintendo 64', value: 'n64', group: 'Nintendo' },
  { label: 'Virtual Boy', value: 'vb', group: 'Nintendo' },
  { label: 'Nintendo 3DS (threads)', value: '3ds', group: 'Nintendo' },
  { label: 'PlayStation', value: 'psx', group: 'Sony' },
  { label: 'PlayStation Portable / PPSSPP (threads)', value: 'ppsspp', group: 'Sony' },
  { label: 'Sega Mega Drive / Genesis', value: 'segaMD', group: 'Sega' },
  { label: 'Sega Master System', value: 'segaMS', group: 'Sega' },
  { label: 'Sega Game Gear', value: 'segaGG', group: 'Sega' },
  { label: 'Sega CD', value: 'segaCD', group: 'Sega' },
  { label: 'Sega 32X', value: 'sega32x', group: 'Sega' },
  { label: 'Sega Saturn', value: 'segaSaturn', group: 'Sega' },
  { label: 'Arcade (FBNeo)', value: 'arcade', group: 'Arcade' },
  { label: 'MAME 2003', value: 'mame2003', group: 'Arcade' },
  { label: 'Atari 2600', value: 'atari2600', group: 'Atari' },
  { label: 'Atari 7800', value: 'atari7800', group: 'Atari' },
  { label: 'Atari 5200', value: 'atari5200', group: 'Atari' },
  { label: 'Atari Lynx', value: 'lynx', group: 'Atari' },
  { label: 'Atari Jaguar', value: 'jaguar', group: 'Atari' },
  { label: '3DO', value: '3do', group: 'Other consoles' },
  { label: 'PC Engine / TurboGrafx-16', value: 'pce', group: 'Other consoles' },
  { label: 'PC-FX', value: 'pcfx', group: 'Other consoles' },
  { label: 'Neo Geo Pocket', value: 'ngp', group: 'Other consoles' },
  { label: 'WonderSwan', value: 'ws', group: 'Other consoles' },
  { label: 'ColecoVision', value: 'coleco', group: 'Other consoles' },
  { label: 'Commodore 64', value: 'vice_x64sc', group: 'Computers' },
  { label: 'Commodore 128', value: 'vice_x128', group: 'Computers' },
  { label: 'Commodore VIC-20', value: 'vice_xvic', group: 'Computers' },
  { label: 'Commodore Plus/4', value: 'vice_xplus4', group: 'Computers' },
  { label: 'Commodore PET', value: 'vice_xpet', group: 'Computers' },
  { label: 'Amiga', value: 'puae', group: 'Computers' },
  { label: 'DOS (threads)', value: 'dosbox_pure', group: 'Computers' },
  { label: 'Intellivision', value: 'intv', group: 'Other consoles' },
]

const CORE_GROUP_ORDER = ['Nintendo', 'Sony', 'Sega', 'Arcade', 'Atari', 'Other consoles', 'Computers']

/** System picker options grouped by maker; an unknown current value is kept selectable. */
export function coreOptionsMarkup(selected: string, { includeAuto = false } = {}): string {
  const esc = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
  const option = (value: string, label: string) => `<option value="${esc(value)}"${value === selected ? ' selected' : ''}>${esc(label)}</option>`
  const known = UPLOAD_CORE_OPTIONS.some((o) => o.value === selected)
  const head = [
    ...(includeAuto ? [option('auto', 'Auto-detect')] : []),
    ...(!known && selected && selected !== 'auto' ? [option(selected, selected)] : []),
  ]
  const groups = CORE_GROUP_ORDER.map((group) => {
    const items = UPLOAD_CORE_OPTIONS.filter((o) => o.group === group).map((o) => option(o.value, o.label)).join('')
    return `<optgroup label="${group}">${items}</optgroup>`
  })
  return head.join('') + groups.join('')
}
