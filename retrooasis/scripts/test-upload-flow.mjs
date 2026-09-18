#!/usr/bin/env node
/**
 * Tests for src/lib/uploadFlow.ts — run from retrooasis/:
 *   node scripts/test-upload-flow.mjs
 *
 * Uses Node's native TypeScript type-stripping (Node >= 22.18); import
 * specifiers are rewritten to explicit .ts paths in a cache dir first.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const srcDir = path.resolve(here, '..', 'src', 'lib')
const cacheDir = path.join(here, '.upload-flow-test-cache')

fs.rmSync(cacheDir, { recursive: true, force: true })
fs.mkdirSync(cacheDir, { recursive: true })

for (const name of ['uploadFlow.ts', 'cores.ts']) {
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
  filesFromList,
  formatUploadProgress,
  summarizeUpload,
  shouldLaunchAfterUpload,
  threadSupportHint,
  folderDropMessage,
  emptyDropMessage,
} = await import(`file://${path.join(cacheDir, 'uploadFlow.ts').replace(/\\/g, '/')}`)

const { romFileAccept, coreNeedsThreads } = await import(
  `file://${path.join(cacheDir, 'cores.ts').replace(/\\/g, '/')}`
)

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

function checkTrue(name, actual) {
  check(name, Boolean(actual), true)
}

console.log('filesFromList')
check('null', filesFromList(null), [])
check('empty', filesFromList([]), [])
check(
  'drops unnamed',
  filesFromList([new File([new Uint8Array([1])], 'mario.nes'), new File([new Uint8Array([1])], '   ')]).map(
    (f) => f.name,
  ),
  ['mario.nes'],
)

console.log('formatUploadProgress')
check(
  'single',
  formatUploadProgress(0, 1, 'Saving', 'mario.nes', '128 KB'),
  'Saving mario.nes (128 KB)…',
)
check(
  'batch',
  formatUploadProgress(1, 4, 'Checking', 'zelda.zip'),
  '2 of 4 · Checking zelda.zip…',
)

console.log('summarizeUpload')
check('empty', summarizeUpload([]), 'No ROM files to add.')
check(
  'one saved',
  summarizeUpload([{ kind: 'saved', filename: 'mario.nes', detail: 'Added', gameId: 'upload-nes-mario-nes' }]),
  'Saved mario.nes. It’s in your library.',
)
check(
  'all saved',
  summarizeUpload([
    { kind: 'saved', filename: 'a.nes', detail: 'Added', gameId: 'a' },
    { kind: 'saved', filename: 'b.nes', detail: 'Added', gameId: 'b' },
  ]),
  'Saved 2 ROMs. They’re in your library.',
)
check(
  'one skip keeps reason',
  summarizeUpload([{ kind: 'skipped', filename: 'notes.txt', detail: 'File type isn’t recognized.' }]),
  'File type isn’t recognized.',
)
check(
  'mixed',
  summarizeUpload([
    { kind: 'saved', filename: 'a.nes', detail: 'Added', gameId: 'a' },
    { kind: 'skipped', filename: 'b.txt', detail: 'nope' },
    { kind: 'error', filename: 'c.nes', detail: 'quota' },
  ]),
  'saved 1, skipped 1, 1 failed. See the list below.',
)

console.log('shouldLaunchAfterUpload')
check(
  'single save launches',
  shouldLaunchAfterUpload([{ kind: 'saved', filename: 'a.nes', detail: 'Added', gameId: 'a' }]),
  true,
)
check(
  'batch does not launch',
  shouldLaunchAfterUpload([
    { kind: 'saved', filename: 'a.nes', detail: 'Added', gameId: 'a' },
    { kind: 'saved', filename: 'b.nes', detail: 'Added', gameId: 'b' },
  ]),
  false,
)
check(
  'skip does not launch',
  shouldLaunchAfterUpload([{ kind: 'skipped', filename: 'notes.txt', detail: 'nope' }]),
  false,
)

console.log('threadSupportHint')
check('auto never warns', threadSupportHint('auto', false), null)
check('nes never warns', threadSupportHint('nes', false), null)
check('psp ok with threads', threadSupportHint('ppsspp', true), null)
checkTrue('psp warns without threads', Boolean(threadSupportHint('ppsspp', false)))
checkTrue('3ds is a thread core', coreNeedsThreads('3ds'))

console.log('copy')
checkTrue('folder message mentions Settings', folderDropMessage().includes('Settings'))
checkTrue('empty drop mentions ROM', emptyDropMessage().includes('ROM'))

console.log('romFileAccept')
checkTrue('includes zip', romFileAccept().includes('.zip'))
checkTrue('includes rar', romFileAccept().includes('.rar'))
checkTrue('includes 7z', romFileAccept().includes('.7z'))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
