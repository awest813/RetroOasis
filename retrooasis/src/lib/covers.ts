/** Libretro thumbnails hosted on GitHub (CORP/CORS compatible with COEP). */

const SYSTEM_FOLDERS: Record<string, string> = {
  nes: 'Nintendo - Nintendo Entertainment System',
  snes: 'Nintendo - Super Nintendo Entertainment System',
  gb: 'Nintendo - Game Boy',
  gbc: 'Nintendo - Game Boy Color',
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
const IMAGE_BASE = 'https://raw.githubusercontent.com/libretro-thumbnails'

export function libretroSystemFolder(platformId: string): string | null {
  return SYSTEM_FOLDERS[platformId] ?? null
}

/** Sanitize a game title for Named_Boxarts filenames. */
export function libretroThumbName(title: string): string {
  return title.normalize('NFC').replace(INVALID, '_').trim()
}

export function libretroBoxartUrl(platformId: string, title: string): string | null {
  const system = libretroSystemFolder(platformId)
  if (!system || !title.trim()) return null
  const file = `${libretroThumbName(title)}.png`
  return `${IMAGE_BASE}/${encodeURIComponent(system.replaceAll(' ', '_'))}/master/Named_Boxarts/${encodeURIComponent(file)}`
}

/** Upgrade older manifest/override URLs from the CDN that lacks isolation headers. */
function compatibleCoverUrl(cover: string): string {
  try {
    const url = new URL(cover)
    if (url.hostname !== 'thumbnails.libretro.com') return cover
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts.length !== 3 || parts[1] !== 'Named_Boxarts') return cover
    const system = decodeURIComponent(parts[0])
    return `${IMAGE_BASE}/${encodeURIComponent(system.replaceAll(' ', '_'))}/master/Named_Boxarts/${parts[2]}`
  } catch {
    return cover
  }
}

/** Decode a hosted URL once; original File.name values must never pass through this. */
export function romFilenameFromUrl(file: string): string {
  if (/^(local:|library:|blob:|data:)/i.test(file)) return ''
  let pathname = file
  if (/^https?:\/\//i.test(file)) {
    try { pathname = new URL(file).pathname } catch { return '' }
  } else {
    pathname = file.split(/[?#]/)[0]
  }
  const leaf = pathname.replaceAll('\\', '/').split('/').pop() ?? ''
  try { return decodeURIComponent(leaf) } catch { return leaf }
}

const REGIONS: Record<string, string> = {
  u: 'USA', usa: 'USA', us: 'USA', e: 'Europe', europe: 'Europe', j: 'Japan', japan: 'Japan',
  ue: 'USA, Europe', ju: 'Japan, USA', jue: 'Japan, USA, Europe',
  w: 'World', world: 'World', uk: 'United Kingdom', 'united kingdom': 'United Kingdom',
  australia: 'Australia', canada: 'Canada', france: 'France', germany: 'Germany',
  italy: 'Italy', spain: 'Spain', korea: 'Korea', china: 'China', taiwan: 'Taiwan',
  brazil: 'Brazil', netherlands: 'Netherlands', sweden: 'Sweden', russia: 'Russia', asia: 'Asia',
}
const COMMON_REGIONS = ['USA', 'USA, Europe', 'Europe', 'World', 'USA, World', 'Japan']
const LANGUAGES = new Set(['en', 'ja', 'fr', 'de', 'es', 'it', 'nl', 'pt', 'sv', 'no', 'da', 'fi', 'zh', 'ko', 'ru', 'pl', 'cs', 'hu', 'el', 'tr', 'ar', 'sk', 'ro', 'uk', 'he', 'ca'])
const MAX_NAMES = 18
const ARCHIVE_EXT = /\.(?:zip|7z|rar)$/i
const INNER_ROM_EXT = /\.(?:nes|fds|sfc|smc|gb|gbc|gba|nds|n64|z64|v64|md|gen|sms|gg|iso|cue|bin|chd|pbp|cso|pce|ngp|ngc|ws|wsc)$/i

function regionName(value: string): string | null {
  const regions = value.split(',').map((part) => REGIONS[part.trim().toLowerCase()])
  return regions.every(Boolean) ? regions.join(', ') : null
}

/** Only remove recognized trailing dump metadata; preserve meaningful subtitles. */
function nameParts(name: string): { base: string; variants: string[]; region: string | null } {
  let base = name.trim()
  const suffixes: Array<{ raw: string; kind: 'region' | 'language' | 'dump'; region: string | null }> = []
  let match: RegExpMatchArray | null
  while ((match = base.match(/\s*(\(([^()]*)\)|\[([^\[\]]*)\])$/))) {
    const value = (match[2] ?? match[3]).trim()
    const region = regionName(value)
    const language = !region && value.split(',').every((part) => LANGUAGES.has(part.trim().toLowerCase()))
    const dump = /^(?:rev(?:ision)?\s+[\w.]+|v\d[\w.]*|disc\s+\d+(?:\s+of\s+\d+)?|track\s+\d+|(?:beta|proto(?:type)?|demo)(?:\s+\d+)?)$/i.test(value)
      || (match[3] !== undefined && /^(?:!|[abofhp]\d*|[abofhp]\s+.+|t[+-].+)$/i.test(value))
    if (!region && !language && !dump) break
    suffixes.unshift({ raw: match[1], kind: region ? 'region' : language ? 'language' : 'dump', region })
    base = base.slice(0, match.index).trim()
  }
  const format = (languages: boolean) => [base, ...suffixes.filter((part) => part.kind === 'region' || (languages && part.kind === 'language')).map((part) => part.raw)].join(' ').trim()
  return {
    base,
    variants: [name.trim(), format(true), format(false)],
    region: suffixes.find((part) => part.region)?.region ?? null,
  }
}

function comparableName(value: string): string {
  return value.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
}

function articleVariant(base: string): string | null {
  const trailing = base.match(/^(.*), (The|An|A)$/i)
  if (trailing) return `${trailing[2]} ${trailing[1]}`
  const leading = base.match(/^(The|An|A) (.+)$/i)
  return leading ? `${leading[2]}, ${leading[1]}` : null
}

/** Match local cover buckets by full names, never by substrings in slug IDs. */
export function gamesForLocalCover<T extends { platform: string; title: string; romFilename?: string; cover?: string | null }>(
  games: T[],
  platformId: string,
  coverFilename: string,
): T[] {
  const stem = coverFilename.replace(/\.[^.]+$/, '').trim()
  if (!stem) return []
  const key = (value: string) => value.normalize('NFC').trim().toLowerCase()
  const eligible = games.filter((game) => game.platform === platformId && !game.cover)
  const exact = eligible.filter((game) => key((game.romFilename ?? '').replace(/\.[^.]+$/, '')) === key(stem))
  if (exact.length) return exact
  // A generic, untagged cover can serve regional variants of the same full title.
  // Tagged covers must not cross region/revision boundaries after exact matching.
  const coverParts = nameParts(stem)
  if (coverParts.base !== stem || !comparableName(stem)) return []
  const baseKey = (value: string) => key(value.replaceAll('_', ' ').replace(/\s+/g, ' '))
  return eligible.filter((game) => {
    const gameStem = game.romFilename ? game.romFilename.replace(/\.[^.]+$/, '') : game.title
    return baseKey(nameParts(gameStem).base) === baseKey(stem)
  })
}

/** Original filename is literal. URL references must use romFilenameFromUrl first. */
export function resolveCoverUrls(
  platformId: string,
  title: string,
  cover: string | null | undefined,
  useLibretro: boolean,
  filename = '',
): string[] {
  const urls: string[] = []
  if (cover?.trim()) urls.push(compatibleCoverUrl(cover.trim()))
  if (!useLibretro) return urls
  const leaf = /^(local:|library:|blob:|data:)/i.test(filename) ? '' : filename.replaceAll('\\', '/').split('/').pop() ?? ''
  let stem = leaf.replace(/\.[^.]+$/, '').trim()
  if (ARCHIVE_EXT.test(leaf) && INNER_ROM_EXT.test(stem)) stem = stem.replace(INNER_ROM_EXT, '')
  const fromFile = nameParts(stem)
  const fromTitle = nameParts(title)
  // A renamed title can identify a different game; don't prefer unrelated file art.
  // Older imports stripped all parentheses, so accept that legacy display spelling.
  const legacyBase = fromFile.base.replace(/\([^)]*\)|\[[^\]]*\]/g, '')
  const related = !title.trim() || comparableName(fromFile.base) === comparableName(fromTitle.base)
    || comparableName(legacyBase) === comparableName(fromTitle.base)
    || comparableName(articleVariant(fromFile.base) ?? '') === comparableName(fromTitle.base)
  const primary = stem && related ? fromFile : fromTitle
  const base = primary.base.replaceAll('_', ' ').replace(/\s+/g, ' ').trim()
  if (!base) return urls
  const regions = [...new Set([primary.region, ...COMMON_REGIONS].filter((region): region is string => !!region))]
  const names = [
    ...primary.variants,
    ...(comparableName(base) === comparableName(fromTitle.base) ? fromTitle.variants : []),
    base,
    ...regions.map((region) => `${base} (${region})`),
  ]
  const alternatives = [articleVariant(base)]
  if (comparableName(base) === comparableName(fromTitle.base) && base !== fromTitle.base) alternatives.push(fromTitle.base)
  for (const alternative of new Set(alternatives.filter((value): value is string => !!value))) {
    names.push(alternative, ...regions.map((region) => `${alternative} (${region})`))
  }
  const uniqueNames = [...new Set(names.filter(Boolean).map(libretroThumbName))].slice(0, MAX_NAMES)
  // The app combines Game Boy and Color into one platform; Color has its own art.
  const systems = platformId === 'gb' ? (/\.gbc(?:\.(?:zip|7z|rar))?$/i.test(leaf) ? ['gbc', 'gb'] : ['gb', 'gbc']) : [platformId]
  for (const system of systems) {
    for (const name of uniqueNames) {
      const url = libretroBoxartUrl(system, name)
      if (url) urls.push(url)
    }
  }
  return [...new Set(urls)]
}

/** First choice, for callers that only need one URL. */
export function resolveCoverUrl(
  platformId: string,
  title: string,
  cover: string | null | undefined,
  useLibretro: boolean,
): string | null {
  return resolveCoverUrls(platformId, title, cover, useLibretro)[0] ?? null
}
