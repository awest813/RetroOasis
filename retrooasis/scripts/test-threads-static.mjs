#!/usr/bin/env node
// Opt-in: PSP, DOS and 3DS cores need threads, which need cross-origin isolation. A static host (GitHub Pages)
// can't send those headers, so the player installs the service worker and reloads once with them added.
// This serves the built app WITHOUT any isolation headers and checks that a PSP core still starts.
//   npm --prefix retrooasis run test:threads
// Needs a build, Playwright (see test:ui), and a network connection (cores come from cdn.emulatorjs.org).
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const dist = path.resolve(here, '../dist')
let playwright
try { playwright = await import(process.env.PLAYWRIGHT_CORE ? pathToFileURL(path.join(process.env.PLAYWRIGHT_CORE, 'index.mjs')).href : 'playwright-core') }
catch { console.log('SKIP thread test: Playwright is not installed. Run npm i --no-save playwright-core, then npx playwright-core install chromium.'); process.exit(0) }
if (!fs.existsSync(path.join(dist, 'player.html'))) throw new Error('Build RetroOasis first: npm run oasis:build')
try { await fetch('https://cdn.emulatorjs.org/nightly/data/cores/reports/ppsspp.json', { signal: AbortSignal.timeout(8000) }) }
catch { console.log('SKIP thread test: cdn.emulatorjs.org is not reachable.'); process.exit(0) }

const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' }
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  if (p === '/rom/game.iso') { res.writeHead(200, { 'Content-Type': 'application/octet-stream' }); return res.end(Buffer.alloc(49152)) }
  const file = path.resolve(dist, p === '/' ? 'index.html' : p.slice(1))
  if (path.relative(dist, file).startsWith('..')) { res.statusCode = 403; return res.end() }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.statusCode = 404; return res.end('not found') }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Content-Length': st.size })
    fs.createReadStream(file).pipe(res)
  })
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${server.address().port}`
const browser = await playwright.chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
let failed = 0
const check = (ok, label, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${extra ? `  [${extra}]` : ''}`); if (!ok) failed++ }
const url = `${base}/player.html?rom=${encodeURIComponent('/rom/game.iso')}&core=ppsspp&name=Test&channel=nightly&threads=1`
const settled = page => page.waitForFunction(() => window.EJS_emulator?.started ? 'started' : document.querySelector('.ro-play-error') ? 'error:' + document.querySelector('.ro-play-error').innerText.replace(/\s+/g, ' ') : false, null, { timeout: 120000 }).then(handle => handle.jsonValue(), () => 'timeout')

const context = await browser.newContext({ viewport: { width: 800, height: 500 } })
const first = await context.newPage()
await first.goto(url)
check(await settled(first) === 'started', 'A PSP core starts on a host that sends no isolation headers')
check(await first.evaluate(() => crossOriginIsolated && typeof SharedArrayBuffer === 'function'), 'The player page is cross-origin isolated (the service worker added the headers)')
const second = await context.newPage()
await second.goto(url)
check(await settled(second) === 'started', 'A second visit starts too')
const nes = await context.newPage()
await nes.goto(`${base}/index.html`)
check(!(await nes.evaluate(() => crossOriginIsolated)), 'Other pages are left alone (not isolated)')
const blocked = await (await browser.newContext({ serviceWorkers: 'block' })).newPage()
await blocked.goto(url)
const message = await blocked.waitForFunction(() => document.querySelector('.ro-play-error')?.innerText.replace(/\s+/g, ' ') || false, null, { timeout: 60000 }).then(handle => handle.jsonValue(), () => 'timeout')
check(/thread support/i.test(message), 'With service workers blocked the player explains instead of looping', message.slice(0, 100))
await browser.close(); server.close()
console.log(failed ? `${failed} thread check(s) failed` : 'All thread checks passed')
process.exit(failed ? 1 : 0)
