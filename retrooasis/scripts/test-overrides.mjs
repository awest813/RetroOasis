#!/usr/bin/env node
/**
 * Tests for src/lib/overrides.ts — run from retrooasis/:
 *   node scripts/test-overrides.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const srcDir = path.resolve(here, '..', 'src', 'lib')
const cacheDir = path.join(here, '.overrides-test-cache')

fs.rmSync(cacheDir, { recursive: true, force: true })
fs.mkdirSync(cacheDir, { recursive: true })

for (const name of ['overrides.ts', 'sidecar.ts', 'userErrors.ts']) {
  let source = fs.readFileSync(path.join(srcDir, name), 'utf8')
  source = source.replace(/from '\.\/sidecar'/g, "from './sidecar.ts'")
  source = source.replace(/from '\.\/userErrors'/g, "from './userErrors.ts'")
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

const store = new Map()
globalThis.localStorage = {
  getItem(key) {
    return store.has(key) ? store.get(key) : null
  },
  setItem(key, value) {
    store.set(key, String(value))
  },
  removeItem(key) {
    store.delete(key)
  },
}

const { getOverride, setOverride, clearOverride } = await import(
  `file://${path.join(cacheDir, 'overrides.ts').replace(/\\/g, '/')}`
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

console.log('overrides')
check('missing', getOverride('demo-1'), undefined)

const saved = setOverride('demo-1', { title: 'Pixel Quest+', year: '1990' })
check('saves title', saved?.title, 'Pixel Quest+')
check('reads back', getOverride('demo-1')?.title, 'Pixel Quest+')

const empty = setOverride('demo-1', { title: '', year: '', developer: '', cover: '', description: '' })
check('empty patch drops override', empty, undefined)
check('empty patch is not readable', getOverride('demo-1'), undefined)
check('empty patch not persisted', store.has('retrooasis.overrides'), false)

setOverride('demo-2', { title: 'Keep me' })
clearOverride('demo-2')
check('clear removes', getOverride('demo-2'), undefined)

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
