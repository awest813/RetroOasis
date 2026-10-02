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
import ts from 'typescript'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../..')
const manifestPath = path.join(repoRoot, 'roms', 'manifest.json')
const wantCovers = process.argv.includes('--covers')

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

// Reuse the browser matcher so scan results retain identical filename/region rules.
const source = fs.readFileSync(path.join(here, '../src/lib/covers.ts'), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText
const { resolveCoverUrls, romFilenameFromUrl } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'))
const probed = new Map()

async function probe(url) {
  if (probed.has(url)) return probed.get(url)
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000) })
    const ok = res.ok && (res.headers.get('content-type') ?? '').startsWith('image/')
    probed.set(url, ok)
    return ok
  } catch {
    return false
  }
}

console.log(`Probing Libretro covers for ${games.length} game(s)…`)

for (const game of games) {
  if (game.cover) continue
  const urls = resolveCoverUrls(game.platform, game.title ?? '', null, true, game.romFilename ?? romFilenameFromUrl(game.file))
  if (!urls.length) continue
  checked++
  for (const url of urls) {
    if (await probe(url)) {
      game.cover = url
      filled++
      console.log(`  + ${game.title}`)
      break
    }
  }
}

fs.writeFileSync(manifestPath, JSON.stringify({ games }, null, 2) + '\n')
console.log(`Done. Checked ${checked}, filled ${filled} cover URL(s).`)
