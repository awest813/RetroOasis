#!/usr/bin/env node
// Opt-in: play your own ROMs in the real player on emulated phones and tablets, and check the on-screen
// touch controls end to end.
//   npm --prefix retrooasis run test:touch -- --rom gba="C:\Games\Emerald.zip" [--rom psx=game.chd] [--channel stable]
//   npm --prefix retrooasis run test:touch -- --rom gba=game.zip --cores path/to/cores   (no CDN: a folder of
//     <core>-wasm.data files and reports/, e.g. the unpacked @emulatorjs/core-<name> npm package)
// Needs a build (npm run oasis:build) and Playwright (npm i --no-save playwright-core, then
// npx playwright-core install chromium, or set PLAYWRIGHT_CORE). No ROMs ship with RetroOasis and none are
// copied: each file is served read-only on loopback for the length of the run.
//
// For each ROM and device it checks that the game starts and draws, the pad shows by default and every
// control is on screen and clear of the player's Exit and menu buttons, every button and D-pad direction
// reaches the core as a press and a release (including two fingers at once), a controller tucks the pad
// away and a touch brings it back, and Settings → On-screen controls Off / Left-handed reach the player.
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '../..')
const args = process.argv.slice(2)
const values = name => args.flatMap((arg, i) => (arg === name && args[i + 1] ? [args[i + 1]] : []))
const roms = values('--rom').map(value => { const at = value.indexOf('='); return { core: value.slice(0, at), file: path.resolve(value.slice(at + 1)) } })
const coresDir = values('--cores')[0] ? path.resolve(values('--cores')[0]) : ''
const channel = coresDir ? 'local' : values('--channel')[0] || 'stable'
if (!roms.length) {
  console.log('Usage: test-touch-browser.mjs --rom <core>=<rom file> [--rom ...] [--channel stable|nightly] [--cores <folder>]')
  process.exit(0)
}
let playwright
try { playwright = await import(process.env.PLAYWRIGHT_CORE ? pathToFileURL(path.join(process.env.PLAYWRIGHT_CORE, 'index.mjs')).href : 'playwright-core') }
catch { console.log('SKIP touch browser test: Playwright is not installed. Run npm i --no-save playwright-core, then npx playwright-core install chromium.'); process.exit(0) }
const { chromium, devices } = playwright.default ?? playwright
const dist = path.join(repo, 'retrooasis/dist')
if (!fs.existsSync(path.join(dist, 'player.html'))) throw new Error('Build RetroOasis first: npm run oasis:build')
for (const rom of roms) if (!fs.existsSync(rom.file)) throw new Error(`ROM not found: ${rom.file}`)

const types = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' }
const inside = (base, target) => { const rel = path.relative(base, target); return rel && !rel.startsWith('..') && !path.isAbsolute(rel) }
const server = http.createServer((req, res) => {
  let p; try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname) } catch { res.statusCode = 400; return res.end() }
  let file
  if (p.startsWith('/rom/')) file = roms[Number(p.split('/')[2])]?.file
  else {
    const [base, rel] = coresDir && p.startsWith('/data/cores/') ? [coresDir, p.slice(12)] : p.startsWith('/data/') ? [path.join(repo, 'data'), p.slice(6)] : [dist, p === '/' ? 'index.html' : p.slice(1)]
    file = path.resolve(base, rel)
    if (!inside(base, file)) { res.statusCode = 403; return res.end() }
  }
  fs.stat(file || '', (err, st) => {
    if (err || !st.isFile()) { res.statusCode = 404; return res.end('not found') }
    res.writeHead(200, { 'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size, 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp', 'Cache-Control': 'no-store' })
    fs.createReadStream(file).pipe(res)
  })
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${server.address().port}`
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] })
let failed = 0
const check = (ok, label, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${extra ? `  [${extra}]` : ''}`); if (!ok) failed++ }

// Records every input the core receives.
const recordInputs = () => {
  window.__inputs = []
  const timer = setInterval(() => {
    const manager = window.EJS_emulator && window.EJS_emulator.gameManager
    if (!manager || manager.__recorded) return
    const raw = manager.simulateInput.bind(manager)
    manager.simulateInput = (port, index, value) => { window.__inputs.push([port, index, value]); return raw(port, index, value) }
    manager.__recorded = true
    clearInterval(timer)
  }, 20)
}
async function boot(rom, index, device, prefs = {}) {
  const context = await browser.newContext({ ...devices[device] })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message.slice(0, 160)))
  await page.addInitScript(prefs => { for (const [key, value] of Object.entries(prefs)) localStorage.setItem(key, value) }, prefs)
  await page.addInitScript(recordInputs)
  const name = path.basename(rom.file)
  await page.goto(`${base}/player.html?rom=${encodeURIComponent(`/rom/${index}/${name}`)}&core=${encodeURIComponent(rom.core)}&name=${encodeURIComponent(name)}&channel=${channel}`)
  const started = await page.waitForFunction(() => (window.EJS_emulator && window.EJS_emulator.started) || document.querySelector('.ro-play-error'), null, { timeout: 120000 }).then(() => page.evaluate(() => !!window.EJS_emulator?.started)).catch(() => false)
  // EmulatorJS shows its menu bar for 3 s at start; let it hide so it doesn't cover the pad.
  if (started) await page.waitForTimeout(3500)
  return { context, page, errors, started, cdp: started ? await context.newCDPSession(page) : null }
}
const touch = async (cdp, page, points, holdMs = 120) => {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points.map(([x, y], id) => ({ x, y, id })) })
  await page.waitForTimeout(holdMs)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await page.waitForTimeout(80)
}
const takeInputs = page => page.evaluate(() => window.__inputs.splice(0))
const pressedAndReleased = inputs => { const down = new Set(inputs.filter(([, , v]) => v).map(([, i]) => i)); return [...down].filter(i => inputs.some(([, j, v]) => j === i && !v)) }

for (const [index, rom] of roms.entries()) {
  const label = `${rom.core} ${path.basename(rom.file)}`
  for (const device of ['iPhone 13', 'iPhone 13 landscape', 'iPhone SE', 'iPad Mini']) {
    const { context, page, errors, started, cdp } = await boot(rom, index, device)
    check(started, `${label} on ${device}: the game starts`)
    if (!started) { await context.close(); continue }
    // A WebGL canvas can only be read inside a frame; fades and title screens get a few seconds.
    let shades = 0
    for (let tries = 0; tries < 8 && shades <= 1; tries++) {
      if (tries) await page.waitForTimeout(1000)
      shades = await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => {
        const c = document.querySelector('#game canvas'), p = document.createElement('canvas'); p.width = 48; p.height = 32
        const x = p.getContext('2d', { willReadFrequently: true }); x.drawImage(c, 0, 0, 48, 32)
        const d = x.getImageData(0, 0, 48, 32).data, seen = new Set()
        for (let i = 0; i < d.length; i += 4) seen.add((d[i] >> 4) * 256 + (d[i + 1] >> 4) * 16 + (d[i + 2] >> 4))
        resolve(seen.size)
      })))
    }
    check(shades > 1, `${label} on ${device}: the game draws`, `${shades} shades`)
    const layout = await page.evaluate(() => {
      const box = el => el.getBoundingClientRect()
      const overlap = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
      const controls = [...document.querySelectorAll('.ejs_virtualGamepad_button, .ejs_dpad_main, .nipple .back')]
      const chrome = [document.querySelector('#back'), document.querySelector('.ejs_virtualGamepad_open')].filter(Boolean).map(box)
      return {
        shown: window.EJS_emulator.virtualGamepad.style.display !== 'none',
        offScreen: controls.filter(el => { const b = box(el); return b.left < 0 || b.top < 0 || b.right > innerWidth || b.bottom > innerHeight }).map(el => el.textContent || el.className),
        covering: controls.filter(el => chrome.some(c => overlap(box(el), c))).map(el => el.textContent || el.className),
      }
    })
    check(layout.shown, `${label} on ${device}: on-screen controls show by default`)
    check(!layout.offScreen.length, `${label} on ${device}: every control is on screen`, layout.offScreen.join(', '))
    check(!layout.covering.length, `${label} on ${device}: no control covers Exit or the game menu button`, layout.covering.join(', '))
    if (device === 'iPhone 13') {
      await takeInputs(page)
      const buttons = await page.evaluate(() => [...document.querySelectorAll('.ejs_virtualGamepad_button')].map(el => { const b = el.getBoundingClientRect(); return { text: el.textContent, x: b.left + b.width / 2, y: b.top + b.height / 2 } }))
      const dead = []
      for (const button of buttons) { await touch(cdp, page, [[button.x, button.y]]); if (!pressedAndReleased(await takeInputs(page)).length) dead.push(button.text) }
      check(!dead.length, `${label}: all ${buttons.length} on-screen buttons press and release`, dead.join(', '))
      const dpad = await page.evaluate(() => { const b = document.querySelector('.ejs_dpad_main')?.getBoundingClientRect(); return b && [b.left, b.top, b.width, b.height] })
      if (dpad) {
        const dirs = []
        for (const [dx, dy] of [[0, -0.4], [0, 0.4], [-0.4, 0], [0.4, 0]]) { await touch(cdp, page, [[dpad[0] + dpad[2] * (0.5 + dx), dpad[1] + dpad[3] * (0.5 + dy)]]); dirs.push(pressedAndReleased(await takeInputs(page))) }
        check(dirs.every(d => d.length === 1) && new Set(dirs.map(d => d[0])).size === 4, `${label}: the D-pad's four directions are four different inputs`, JSON.stringify(dirs))
        const face = buttons.find(b => /^(A|B|✕|○|1|2)$/.test(b.text)) || buttons[0]
        await touch(cdp, page, [[face.x, face.y], [dpad[0] + dpad[2] * 0.9, dpad[1] + dpad[3] / 2]], 200)
        check(pressedAndReleased(await takeInputs(page)).length >= 2, `${label}: two fingers at once (${face.text} + D-pad) both register`)
      }
      // A standard controller in use tucks the pad away; the next touch brings it back.
      await page.evaluate(() => {
        const pad = { index: 0, id: 'Test controller', connected: true, mapping: 'standard', timestamp: 1, buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0] }
        window.__pad = pad
        Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad] })
      })
      await page.waitForTimeout(300)
      await page.evaluate(() => { window.__pad.buttons[0] = { pressed: true, value: 1 }; window.__pad.timestamp++ }); await page.waitForTimeout(200)
      await page.evaluate(() => { window.__pad.buttons[0] = { pressed: false, value: 0 }; window.__pad.timestamp++ }); await page.waitForTimeout(200)
      const tucked = await page.evaluate(() => window.EJS_emulator.virtualGamepad.style.display === 'none')
      await touch(cdp, page, [[page.viewportSize().width / 2, 200]])
      const back = await page.evaluate(() => window.EJS_emulator.virtualGamepad.style.display !== 'none')
      check(tucked && back, `${label}: a controller hides the on-screen pad and a touch brings it back`, `hidden ${tucked}, back ${back}`)
      // Phones suspend a page's audio on an app switch or a call; the next touch must bring the sound back.
      const audioCtx = () => page.evaluate(() => { const al = window.EJS_emulator.Module.AL; return al && al.currentCtx && al.currentCtx.audioCtx ? al.currentCtx.audioCtx.state : 'none' })
      if ((await audioCtx()) !== 'none') {
        await page.evaluate(() => window.EJS_emulator.Module.AL.currentCtx.audioCtx.suspend()); await page.waitForTimeout(300)
        const face = buttons[0]
        await touch(cdp, page, [[face.x, face.y]]); await page.waitForTimeout(300)
        const state = await audioCtx()
        check(state === 'running', `${label}: sound comes back on the next touch after the phone suspends it`, state)
      }
    }
    check(!errors.length, `${label} on ${device}: no page errors`, errors.join(' | '))
    await context.close()
  }
  for (const [setting, prefs, expect] of [['Off', { 'retrooasis.touchControls': 'off' }, r => !r.shown], ['Left-handed', { 'retrooasis.touchLeftHanded': '1' }, r => r.shown && r.dpadRight]]) {
    const { context, page, started } = await boot(rom, index, 'iPhone 13', prefs)
    const result = started && await page.evaluate(() => ({ shown: window.EJS_emulator.virtualGamepad.style.display !== 'none', dpadRight: !!document.querySelector('.ejs_virtualGamepad_right .ejs_dpad_main, .ejs_virtualGamepad_right .nipple') }))
    check(!!result && expect(result), `${label}: Settings → On-screen controls ${setting} reaches the player`, JSON.stringify(result))
    await context.close()
  }
}
await browser.close()
server.close()
console.log(failed ? `${failed} touch check(s) failed` : 'All touch checks passed')
process.exit(failed ? 1 : 0)
