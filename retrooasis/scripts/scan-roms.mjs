#!/usr/bin/env node
/**
 * Thin scan tool: walk ../roms, write manifest.json, optionally probe Libretro covers.
 *
 *   node scripts/scan-roms.mjs
 *   node scripts/scan-roms.mjs --covers
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../..')
const manifestPath = path.join(repoRoot, 'roms', 'manifest.json')
const wantCovers = process.argv.includes('--covers')

const SYSTEM_FOLDERS = {
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

console.log('Scanning roms/ …')
const gen = spawnSync(process.execPath, [path.join(here, 'generate-roms-manifest.mjs')], {
  stdio: 'inherit',
})
if (gen.status !== 0) process.exit(gen.status ?? 1)

if (!wantCovers) {
  console.log('Tip: re-run with --covers to probe Libretro boxart URLs.')
  process.exit(0)
}

if (!fs.existsSync(manifestPath)) {
  console.error('manifest.json missing after scan')
  process.exit(1)
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
const games = Array.isArray(manifest.games) ? manifest.games : []
let filled = 0
let checked = 0

function thumbName(title) {
  return String(title).replace(/[&*/:`<>?\\|"]/g, '_').trim()
}

async function probe(url) {
  try {
    const res = await fetch(url, { method: 'HEAD' })
    return res.ok
  } catch {
    return false
  }
}

console.log(`Probing Libretro covers for ${games.length} game(s)…`)

for (const game of games) {
  if (game.cover) continue
  const system = SYSTEM_FOLDERS[game.platform]
  if (!system || !game.title) continue
  checked++
  const file = `${thumbName(game.title)}.png`
  const url = `https://thumbnails.libretro.com/${encodeURIComponent(system)}/Named_Boxarts/${encodeURIComponent(file)}`
  const ok = await probe(url)
  if (ok) {
    game.cover = url
    filled++
    console.log(`  + ${game.title}`)
  }
}

fs.writeFileSync(manifestPath, JSON.stringify({ games }, null, 2) + '\n')
console.log(`Done. Checked ${checked}, filled ${filled} cover URL(s).`)
