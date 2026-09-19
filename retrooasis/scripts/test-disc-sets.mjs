#!/usr/bin/env node
/**
 * Tests for src/lib/discSets.ts — run from retrooasis/:
 *   node scripts/test-disc-sets.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const srcDir = path.resolve(here, '..', 'src', 'lib')
const cacheDir = path.join(here, '.disc-sets-test-cache')

fs.rmSync(cacheDir, { recursive: true, force: true })
fs.mkdirSync(cacheDir, { recursive: true })

for (const name of ['discSets.ts', 'cores.ts']) {
  let source = fs.readFileSync(path.join(srcDir, name), 'utf8')
  source = source.replace(/from '\.\/cores'/g, "from './cores.ts'")
  fs.writeFileSync(path.join(cacheDir, name), source)
}

if (!process.features.typescript) {
  if (process.env.RO_TS_STRIP === '1') {
    console.error('This Node lacks native TypeScript stripping (needs Node >= 22.6).')
    process.exit(2)
  }
  const { spawnSync } = await import('node:child_process')
  const result = spawnSync(process.execPath, ['--experimental-strip-types', fileURLToPath(import.meta.url)], {
    stdio: 'inherit',
    env: { ...process.env, RO_TS_STRIP: '1' },
  })
  process.exit(result.status ?? 1)
}

const {
  parseCueFileReferences,
  parseM3uEntries,
  groupDiscSetNames,
  buildStoreZip,
  crc32,
  missingCompanionsMessage,
} = await import(`file://${path.join(cacheDir, 'discSets.ts').replace(/\\/g, '/')}`)

let passed = 0
let failed = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) {
    passed += 1
    console.log(`  ok  ${name}`)
  } else {
    failed += 1
    console.error(
      `FAIL  ${name}\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(actual)}`,
    )
  }
}

console.log('parseCueFileReferences')
check(
  'quoted binary',
  parseCueFileReferences('FILE "Metal Gear.bin" BINARY\nTRACK 01 MODE2/2352\n'),
  ['Metal Gear.bin'],
)
check(
  'multiple files',
  parseCueFileReferences(`FILE 'disc.bin' BINARY\nFILE track02.wav WAVE\n`),
  ['disc.bin', 'track02.wav'],
)

console.log('parseM3uEntries')
check(
  'skips comments',
  parseM3uEntries('# EXT\nDisc 1.cue\n\nDisc 2.cue\n'),
  ['Disc 1.cue', 'Disc 2.cue'],
)

console.log('groupDiscSetNames')
const cueBin = groupDiscSetNames(['Final Fantasy.cue', 'Final Fantasy.bin', 'notes.txt'], {
  texts: { 'Final Fantasy.cue': 'FILE "Final Fantasy.bin" BINARY\n' },
})
check(
  'cue+bin grouped',
  cueBin.map((p) => ({ primary: p.primary.name, files: p.files.map((f) => f.name).sort(), kind: p.kind, missing: p.missing })),
  [{ primary: 'Final Fantasy.cue', files: ['Final Fantasy.bin', 'Final Fantasy.cue'], kind: 'disc-set', missing: [] }],
)

const twoGames = groupDiscSetNames(['mario.nes', 'zelda.sfc'])
check(
  'carts stay separate',
  twoGames.map((p) => p.primary.name).sort(),
  ['mario.nes', 'zelda.sfc'],
)

const missing = groupDiscSetNames(['game.cue'], { texts: { 'game.cue': 'FILE "game.bin" BINARY\n' } })
check('missing companion listed', missing[0]?.missing, ['game.bin'])
check('orphan wav ignored', groupDiscSetNames(['song.wav']).length, 0)

const playlist = groupDiscSetNames(
  ['game.m3u', 'Disc 1.cue', 'track01.bin', 'Disc 2.cue', 'track02.bin'],
  {
    texts: {
      'game.m3u': 'Disc 1.cue\nDisc 2.cue\n',
      'Disc 1.cue': 'FILE "track01.bin" BINARY\n',
      'Disc 2.cue': 'FILE "track02.bin" BINARY\n',
    },
  },
)
check(
  'm3u walks cue file lines',
  playlist.map((p) => ({ primary: p.primary.name, files: p.files.map((f) => f.name).sort(), missing: p.missing })),
  [{
    primary: 'game.m3u',
    files: ['Disc 1.cue', 'Disc 2.cue', 'game.m3u', 'track01.bin', 'track02.bin'],
    missing: [],
  }],
)

console.log('zip')
const payload = new TextEncoder().encode('hello')
const zip = buildStoreZip([{ name: 'hello.txt', bytes: payload }])
check('zip signature', [zip[0], zip[1], zip[2], zip[3]], [0x50, 0x4b, 0x03, 0x04])
check('crc32 hello', crc32(payload), 0x3610a686)

console.log('copy')
check(
  'missing message',
  missingCompanionsMessage('game.cue', ['game.bin']),
  'game.cue also needs game.bin. Add those files with this one.',
)

console.log('player.html')
const playerHtml = fs.readFileSync(path.resolve(here, '..', 'public', 'player.html'), 'utf8')
const scriptMatch = playerHtml.match(/<script>\s*\(function \(\) \{([\s\S]*)\}\)\(\);\s*<\/script>/)
try {
  if (!scriptMatch) throw new Error('missing IIFE')
  new Function(scriptMatch[1])
  check('player script parses', true, true)
} catch (err) {
  check('player script parses', String(err?.message || err), 'ok')
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
