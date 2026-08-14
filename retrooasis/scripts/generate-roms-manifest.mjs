#!/usr/bin/env node
/**
 * Walk ../roms/<platform>/* and write ../roms/manifest.json for static hosts.
 * Usage: node scripts/generate-roms-manifest.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../..')
const romsRoot = path.join(repoRoot, 'roms')
const outFile = path.join(romsRoot, 'manifest.json')

const FOLDER_TO_PLATFORM = {
  nes: 'nes', famicom: 'nes', snes: 'snes', sfc: 'snes',
  gb: 'gb', gameboy: 'gb', gbc: 'gb', gba: 'gba',
  n64: 'n64', nintendo64: 'n64', nds: 'nds', ds: 'nds',
  vb: 'vb', virtualboy: 'vb', '3ds': '3ds', nintendo3ds: '3ds',
  psx: 'psx', ps1: 'psx', playstation: 'psx',
  psp: 'psp', ppsspp: 'psp', playstationportable: 'psp',
  segamd: 'segaMD', md: 'segaMD', genesis: 'segaMD', megadrive: 'segaMD',
  segams: 'segaMS', sms: 'segaMS', mastersystem: 'segaMS',
  segagg: 'segaGG', gg: 'segaGG', gamegear: 'segaGG',
  segacd: 'segaCD', megacd: 'segaCD', sega32x: 'sega32x', '32x': 'sega32x',
  segasaturn: 'segaSaturn', saturn: 'segaSaturn',
  arcade: 'arcade', mame: 'mame', fbneo: 'arcade',
  atari2600: 'atari2600', a2600: 'atari2600',
  atari7800: 'atari7800', a7800: 'atari7800',
  atari5200: 'atari5200', a5200: 'atari5200',
  lynx: 'lynx', jaguar: 'jaguar', '3do': '3do',
  pce: 'pce', tg16: 'pce', pcengine: 'pce', pcfx: 'pcfx',
  ngp: 'ngp', ngpc: 'ngp', ws: 'ws', wonderswan: 'ws',
  coleco: 'coleco', colecovision: 'coleco',
  c64: 'c64', commodore64: 'c64', c128: 'c128',
  vic20: 'vic20', plus4: 'plus4', pet: 'pet',
  amiga: 'amiga', dos: 'dos', dosbox: 'dos', pc: 'dos',
  intv: 'intv', intellivision: 'intv',
}

const PLATFORM_TO_CORE = {
  nes: 'nes', snes: 'snes', gb: 'gb', gba: 'gba', n64: 'n64', nds: 'nds',
  vb: 'vb', '3ds': '3ds', psx: 'psx', psp: 'ppsspp',
  segaMD: 'segaMD', segaMS: 'segaMS', segaGG: 'segaGG', segaCD: 'segaCD',
  sega32x: 'sega32x', segaSaturn: 'segaSaturn',
  arcade: 'arcade', mame: 'mame2003',
  atari2600: 'atari2600', atari7800: 'atari7800', atari5200: 'atari5200',
  lynx: 'lynx', jaguar: 'jaguar', '3do': '3do',
  pce: 'pce', pcfx: 'pcfx', ngp: 'ngp', ws: 'ws', coleco: 'coleco',
  c64: 'vice_x64sc', c128: 'vice_x128', vic20: 'vice_xvic',
  plus4: 'vice_xplus4', pet: 'vice_xpet', amiga: 'puae',
  dos: 'dosbox_pure', intv: 'intv',
}

const ROM_EXT = new Set([
  'nes', 'fds', 'unif', 'unf', 'smc', 'fig', 'sfc', 'gb', 'gbc', 'gba',
  'nds', 'z64', 'n64', 'v64', 'vb', '3ds', 'cci', 'cia', 'cxi', 'app',
  'md', 'smd', 'gen', 'bin', 'iso', 'cue', 'img', 'pbp', 'cso', 'chd', 'm3u',
  'sms', 'gg', 'zip', '7z', 'a26', 'a78', 'a52', 'lnx', 'j64', 'jag',
  'pce', 'ngp', 'ngc', 'ws', 'wsc', 'col', 'cv', 'd64', 't64', 'adf', 'hdf',
  'exe', 'com', 'int', 'itv',
])

const COVER_EXT = ['png', 'jpg', 'jpeg', 'webp']

function titleFromFilename(filename) {
  return filename
    .replace(/\.[^.]+$/, '')
    .replace(/[._]+/g, ' ')
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s*\[[^\]]*]\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || filename
}

function slugId(platform, filename) {
  const raw = `${platform}-${filename}`.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  return `hosted-${raw.replace(/^-|-$/g, '')}`
}

function findCover(platformDir, platform, base) {
  for (const ext of COVER_EXT) {
    const sidecar = path.join(platformDir, `${base}.${ext}`)
    if (fs.existsSync(sidecar)) return `roms/${platform}/${base}.${ext}`
  }
  for (const ext of COVER_EXT) {
    const bucket = path.join(romsRoot, 'covers', platform, `${base}.${ext}`)
    if (fs.existsSync(bucket)) return `roms/covers/${platform}/${base}.${ext}`
  }
  return null
}

function readJsonFile(full) {
  if (!fs.existsSync(full)) return null
  try {
    const data = JSON.parse(fs.readFileSync(full, 'utf8'))
    return data && typeof data === 'object' ? data : null
  } catch {
    return null
  }
}

function readSidecar(platformDir, base, allowSharedGameJson) {
  return (
    readJsonFile(path.join(platformDir, `${base}.json`)) ||
    (allowSharedGameJson ? readJsonFile(path.join(platformDir, 'game.json')) : null)
  )
}

if (!fs.existsSync(romsRoot)) {
  console.error(`No roms/ directory at ${romsRoot}`)
  process.exit(1)
}

const games = []

for (const entry of fs.readdirSync(romsRoot, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  const key = entry.name.trim().toLowerCase().replace(/\s+/g, '')
  const platform = FOLDER_TO_PLATFORM[key]
  if (!platform) continue

  const platformDir = path.join(romsRoot, entry.name)
  const romFiles = fs.readdirSync(platformDir).filter((file) => {
    const ext = file.split('.').pop()?.toLowerCase()
    return !!ext && ROM_EXT.has(ext)
  })
  const allowShared = romFiles.length === 1

  for (const file of romFiles) {
    const base = file.replace(/\.[^.]+$/, '')
    const meta = readSidecar(platformDir, base, allowShared) || {}
    const game = {
      id: slugId(platform, file),
      title: meta.title || titleFromFilename(file),
      platform,
      core: meta.core || PLATFORM_TO_CORE[platform] || platform,
      file: `roms/${entry.name}/${file}`,
      cover: meta.cover || findCover(platformDir, entry.name, base),
    }
    if (meta.bios != null) game.bios = meta.bios
    if (meta.description) game.description = meta.description
    if (meta.year != null) game.year = meta.year
    if (meta.developer) game.developer = meta.developer
    if (Array.isArray(meta.tags)) game.tags = meta.tags
    games.push(game)
  }
}

games.sort((a, b) => a.title.localeCompare(b.title))
fs.writeFileSync(outFile, JSON.stringify({ games }, null, 2) + '\n')
console.log(`Wrote ${games.length} game(s) → ${outFile}`)
