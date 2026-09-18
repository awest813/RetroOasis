#!/usr/bin/env node
/**
 * Tests for src/lib/router.ts — run from retrooasis/:
 *   node scripts/test-router.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const srcDir = path.resolve(here, '..', 'src', 'lib')
const cacheDir = path.join(here, '.router-test-cache')

fs.rmSync(cacheDir, { recursive: true, force: true })
fs.mkdirSync(cacheDir, { recursive: true })
fs.writeFileSync(path.join(cacheDir, 'router.ts'), fs.readFileSync(path.join(srcDir, 'router.ts'), 'utf8'))

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

const { parseRouteHash } = await import(`file://${path.join(cacheDir, 'router.ts').replace(/\\/g, '/')}`)

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

console.log('parseRouteHash')
check('home', parseRouteHash('#/'), { name: 'lobby' })
check('bare hash', parseRouteHash('#'), { name: 'lobby' })
check('library all', parseRouteHash('#/library'), { name: 'collection', collection: 'all' })
check('library slash', parseRouteHash('#/library/'), { name: 'collection', collection: 'all' })
check('favorites', parseRouteHash('#/library/@favorites'), { name: 'collection', collection: 'favorites' })
check('unknown collection', parseRouteHash('#/library/@nope'), { name: 'notfound' })
check('platform', parseRouteHash('#/library/nes'), { name: 'platform', platformId: 'nes' })
check('tag', parseRouteHash('#/library/tag/demo'), { name: 'tag', tagId: 'demo' })
check('tag without slug', parseRouteHash('#/library/tag'), { name: 'notfound' })
check('tag trailing slash', parseRouteHash('#/library/tag/'), { name: 'notfound' })
check('game', parseRouteHash('#/game/demo-nes-adventure'), { name: 'game', gameId: 'demo-nes-adventure' })
check('upload', parseRouteHash('#/upload'), { name: 'upload' })
check('settings', parseRouteHash('#/settings'), { name: 'settings' })
check('saves', parseRouteHash('#/saves'), { name: 'saves' })
check('unknown', parseRouteHash('#/nope'), { name: 'notfound' })

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
