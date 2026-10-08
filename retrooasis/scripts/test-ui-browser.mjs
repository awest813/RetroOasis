#!/usr/bin/env node
// Opt-in browser audit of the built app: every Settings control, hostile routes and text, and layout on
// desktop, laptop, Chromebook, tablet and phone sizes. Needs a build (npm run oasis:build) and Playwright
// (npm i --no-save playwright-core, then npx playwright-core install chromium, or set PLAYWRIGHT_CORE).
//   npm --prefix retrooasis run test:ui
// It serves retrooasis/dist on loopback and uses a fresh browser profile; nothing outside it is touched.
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const dist = path.resolve(here, '../dist')
let playwright
try { playwright = await import(process.env.PLAYWRIGHT_CORE ? pathToFileURL(path.join(process.env.PLAYWRIGHT_CORE, 'index.mjs')).href : 'playwright-core') }
catch { console.log('SKIP UI browser test: Playwright is not installed. Run npm i --no-save playwright-core, then npx playwright-core install chromium.'); process.exit(0) }
if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error('Build RetroOasis first: npm run oasis:build')

const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm' }
const server = http.createServer((req, res) => {
  let p; try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname) } catch { res.statusCode = 400; return res.end() }
  const file = path.resolve(dist, p === '/' ? 'index.html' : p.slice(1))
  if (path.relative(dist, file).startsWith('..')) { res.statusCode = 403; return res.end() }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.statusCode = 404; return res.end('not found') }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-store' })
    fs.createReadStream(file).pipe(res)
  })
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${server.address().port}`
const browser = await playwright.chromium.launch({ headless: true })
let failed = 0
const check = (ok, label, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${extra ? `  [${extra}]` : ''}`); if (!ok) failed++ }
const ui = { errors: [] }

async function newPage(viewport = { width: 1366, height: 860 }, options = {}) {
  const context = await browser.newContext({ viewport, ...options })
  const page = await context.newPage()
  page.on('pageerror', error => ui.errors.push(error.message.slice(0, 160)))
  page.on('dialog', dialog => dialog.accept())
  return page
}
const stored = (page, key) => page.evaluate(key => localStorage.getItem(key), key)
const root = (page, name) => page.evaluate(name => document.documentElement.dataset[name], name)
const pressed = (page, selector) => page.evaluate(selector => document.querySelector(selector)?.getAttribute('aria-pressed'), selector)

// ---- Settings: every control, state, effect and persistence
{
  const page = await newPage()
  await page.goto(`${base}/#/settings`); await page.waitForSelector('[data-ro-settings]'); await page.waitForTimeout(300)
  const layout = await page.evaluate(() => { const s = document.querySelector('[data-ro-settings]'); return { outside: [...document.querySelectorAll('.ro-settings-row')].filter(r => !s.contains(r)).length, footer: s.contains(document.querySelector('.ro-settings__footer')), empty: [...document.querySelectorAll('.ro-settings-row')].filter(r => !r.textContent.trim()).length } })
  check(layout.outside === 0 && layout.footer && layout.empty === 0, 'Settings: every row and the footer sit inside the settings container', JSON.stringify(layout))
  await page.click('button[data-accent=ps]'); await page.waitForTimeout(250)
  check((await root(page, 'accent')) === 'ps' && (await stored(page, 'retrooasis.accent')) === 'ps' && (await pressed(page, 'button[data-accent=ps]')) === 'true', 'Accent PS applies, stores and shows pressed')
  await page.click('button[data-layout=tv]'); await page.waitForTimeout(250)
  check((await root(page, 'layout')) === 'tv' && (await stored(page, 'retrooasis.layout')) === 'tv', 'TV layout applies and stores')
  await page.click('#ro-crt'); await page.waitForTimeout(250)
  check((await root(page, 'crt')) === 'on' && (await stored(page, 'retrooasis.crt')) === '1', 'CRT overlay turns on')
  await page.reload(); await page.waitForSelector('[data-ro-settings]'); await page.waitForTimeout(300)
  check((await root(page, 'accent')) === 'ps' && (await root(page, 'layout')) === 'tv' && (await root(page, 'crt')) === 'on', 'Appearance persists across a reload')
  await page.click('button[data-accent=sega]'); await page.click('button[data-layout=standard]'); await page.click('#ro-crt'); await page.waitForTimeout(250)
  check((await root(page, 'accent')) === 'sega' && (await root(page, 'layout')) === 'standard' && (await root(page, 'crt')) === 'off', 'Appearance reverts')
  check(await page.evaluate(() => [...document.querySelectorAll('[data-pack]')].every(b => b.disabled)), 'Sound packs are disabled while UI sounds are off')
  await page.click('#ro-sounds'); await page.waitForTimeout(250)
  check((await stored(page, 'retrooasis.sounds')) === '1' && await page.evaluate(() => [...document.querySelectorAll('[data-pack]')].every(b => !b.disabled)), 'UI sounds on enables the packs')
  for (const pack of ['xmb', 'arcade', 'soft']) { await page.click(`[data-pack=${pack}]`); await page.waitForTimeout(200); check((await stored(page, 'retrooasis.soundPack')) === pack, `Sound pack ${pack} stores`) }
  await page.click('#ro-sounds'); await page.waitForTimeout(250)
  await page.click('#ro-check-controller'); await page.click('#ro-controller-test summary'); await page.waitForTimeout(200)
  check(await page.evaluate(() => document.querySelector('#ro-controller-test').open), 'Controller test opens')
  await page.click('#ro-controller-test summary')
  await page.waitForFunction(() => document.querySelector('#ro-lan-state').dataset.state !== 'checking', null, { timeout: 8000 }).catch(() => {})
  check(await page.evaluate(() => ['#ro-lan-host', '#ro-lan-join'].every(s => document.querySelector(s).getAttribute('aria-disabled') === 'true' && !document.querySelector(s).hasAttribute('href'))), 'Host and Join are disabled when no room host answers')
  await page.click('#ro-libretro'); await page.waitForTimeout(200)
  check((await stored(page, 'retrooasis.libretroCovers')) === '0', 'Online box art turns off')
  await page.click('#ro-libretro'); await page.click('#ro-refresh-covers'); await page.waitForTimeout(200)
  check(/reset/i.test(await page.textContent('#ro-cover-refresh-status')), 'Refresh cover art reports')
  await page.click('#ro-hide-demos'); await page.waitForTimeout(300)
  check((await stored(page, 'retrooasis.hideDemos')) === '1', 'Hide samples stores')
  await page.goto(`${base}/#/library/@all`); await page.waitForTimeout(800)
  check(await page.evaluate(() => /Add a ROM to start|Library is empty|0 games|No games/i.test(document.body.innerText)), 'Hiding samples on an empty library shows the empty state')
  await page.goto(`${base}/#/settings`); await page.waitForSelector('[data-ro-settings]'); await page.click('#ro-hide-demos'); await page.waitForTimeout(200)
  await page.evaluate(() => { localStorage.setItem('retrooasis.favorites', '["a"]'); localStorage.setItem('retrooasis.recents', '["a"]') })
  await page.click('#ro-clear-prefs'); await page.waitForTimeout(250)
  check((await stored(page, 'retrooasis.favorites')) === null && (await stored(page, 'retrooasis.recents')) === null, 'Clear recents and favorites empties both')
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }).catch(() => null), page.click('#ro-export-over')])
  check(download?.suggestedFilename() === 'retrooasis-overrides.json', 'Export edits downloads a JSON file')
  for (const channel of ['nightly', 'latest', 'local', 'stable']) { await page.click(`[data-ejs=${channel}]`); await page.waitForTimeout(200); check((await stored(page, 'retrooasis.ejsChannel')) === channel && (await pressed(page, `[data-ejs=${channel}]`)) === 'true', `Emulator files ${channel} stores`) }
  for (const section of ['look', 'playback', 'controller', 'lan', 'library', 'data', 'advanced']) {
    await page.click(`[data-settings-section=${section}]`); await page.waitForTimeout(350)
    const top = await page.evaluate(id => Math.round(document.querySelector('#ro-set-' + id).getBoundingClientRect().top), section)
    check((top >= 0 && top < 400) || section === 'advanced', `Section rail reaches ${section}`, `top=${top}`)
  }
  await page.context().close()
}

// ---- Hostile routes and text
{
  const page = await newPage()
  for (const hash of ['#/game/', '#/game/%E0%A4%A', '#/library/zzz', '#/library/tag/%00', '#//library', '#/library/@bogus', '#/' + 'x'.repeat(3000), '#/Settings', '#/library/GBA']) {
    const before = ui.errors.length
    await page.goto(base + '/' + hash); await page.waitForTimeout(500)
    check(ui.errors.length === before && await page.evaluate(() => document.body.innerText.length > 20), `Route ${hash.slice(0, 32)} renders without an error`)
  }
  await page.goto(`${base}/#/library/@all`); await page.waitForTimeout(800)
  for (const query of ['(', '[', '\\', '.*', '<img src=x onerror=window.__xss=1>', 'a'.repeat(500), '🎮', '   ']) {
    await page.fill('#ro-q', query); await page.waitForTimeout(300)
    check(!(await page.evaluate(() => window.__xss === 1)) && !!(await page.$('#ro-q')), `Search ${JSON.stringify(query.slice(0, 18))} is safe`)
  }
  await page.context().close()
}

// ---- Add ROM explains what it can't run, and a linked folder says what it skipped
{
  const page = await newPage()
  const chd = (tag, bytes) => { const b = Buffer.alloc(124 + 16 + 20); b.write('MComprHD', 0); b.writeUInt32BE(124, 8); b.writeUInt32BE(5, 12); b.writeBigUInt64BE(BigInt(bytes), 32); b.writeBigUInt64BE(124n, 48); b.write(tag, 124); b.writeUInt32BE(20, 128); return b }
  const xbox = Buffer.alloc(0x10100); xbox.write('MICROSOFT*XBOX*MEDIA', 0x10000)
  await page.goto(`${base}/#/upload`); await page.waitForSelector('#ro-file', { state: 'attached' })
  await page.setInputFiles('#ro-file', [
    { name: 'Crazy Taxi.gdi', mimeType: 'application/octet-stream', buffer: Buffer.from('3 1 0 4 2352 track01.bin 0') },
    { name: 'taxi.chd', mimeType: 'application/octet-stream', buffer: chd('CHGD', 1.3e9) },
    { name: 'madden.chd', mimeType: 'application/octet-stream', buffer: chd('DVD ', 1.5e9) },
    { name: 'ps2.chd', mimeType: 'application/octet-stream', buffer: chd('DVD ', 4.3e9) },
    { name: 'halo.iso', mimeType: 'application/octet-stream', buffer: xbox },
  ])
  await page.waitForFunction(() => document.querySelectorAll('.ro-upload__log-item').length >= 5, null, { timeout: 20000 }).catch(() => {})
  const log = await page.evaluate(() => [...document.querySelectorAll('.ro-upload__log-item')].map(li => li.innerText.replace(/\s+/g, ' ')))
  const row = name => log.find(line => line.includes(name)) ?? ''
  check(/skipped.*Dreamcast/i.test(row('Crazy Taxi.gdi')), 'A Dreamcast .gdi is refused with the reason', row('Crazy Taxi.gdi').slice(0, 90))
  check(/skipped.*Dreamcast/i.test(row('taxi.chd')), 'A Dreamcast .chd is refused with the reason')
  check(/skipped.*PSP game stored as \.chd/i.test(row('madden.chd')), 'A UMD-sized DVD .chd is recognised as a PSP game it cannot open')
  check(/skipped.*DVD/i.test(row('ps2.chd')), 'A full-size DVD .chd is refused')
  check(/skipped.*Xbox/i.test(row('halo.iso')), 'An Xbox disc image is refused', row('halo.iso').slice(0, 90))
  await page.context().close()
}
{
  const page = await newPage()
  await page.goto(`${base}/#/settings`); await page.waitForSelector('[data-ro-settings]')
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory()
    await root.removeEntry('ui-roms', { recursive: true }).catch(() => {})
    const top = await root.getDirectoryHandle('ui-roms', { create: true })
    const put = async (dir, name) => { const handle = await dir.getFileHandle(name, { create: true }); const writer = await handle.createWritable(); await writer.write('x'); await writer.close() }
    for (const [folder, file] of [['Nintendo - Game Boy Advance', 'Advance Wars.gba'], ['Sega - Dreamcast', 'Crazy Taxi.gdi'], ['Sony - PlayStation 2', 'Game.iso']]) await put(await top.getDirectoryHandle(folder, { create: true }), file)
    window.showDirectoryPicker = async () => top
  })
  await page.click('#ro-link'); await page.waitForTimeout(1200)
  const text = await page.evaluate(() => document.querySelector('#ro-link').closest('.ro-settings-row').innerText.replace(/\s+/g, ' '))
  check(/Skipped Dreamcast, PlayStation 2/.test(text), 'A linked folder lists the systems it skipped', text.slice(0, 160))
  await page.context().close()
}

// ---- Game cards: a placeholder cover names the system, not the game twice
{
  const page = await newPage()
  await page.goto(`${base}/#/library/@all`); await page.waitForSelector('.ro-tile'); await page.waitForTimeout(500)
  const cards = await page.evaluate(() => [...document.querySelectorAll('.ro-tile')].map(tile => ({ title: tile.querySelector('.ro-tile__title')?.textContent.trim(), cover: tile.querySelector('.ro-cover__label')?.textContent.trim(), system: tile.querySelector('.ro-tile__sub')?.textContent.trim().split(' ·')[0] })))
  check(cards.length > 0 && cards.every(card => card.cover && card.cover !== card.title && card.system.toUpperCase().startsWith(card.cover.toUpperCase().slice(0, 2))), 'Placeholder covers show the system, and the caption carries the title', JSON.stringify(cards[0]))
  await page.goto(`${base}/#/game/demo-nes-adventure`); await page.waitForSelector('.ro-detail'); await page.waitForTimeout(500)
  const meta = await page.evaluate(() => ({ badges: document.querySelectorAll('.ro-detail__badges .ro-badge').length, system: document.querySelector('.ro-detail__meta strong')?.textContent, hasFileName: /\.(zip|nes|gba|z64)/i.test(document.querySelector('.ro-detail__meta')?.textContent || '') }))
  check(meta.system && !meta.hasFileName, 'The game page header names the system without the file name', JSON.stringify(meta))
  await page.context().close()
}

// ---- A new page starts at the top; Back to Settings keeps your place
{
  const page = await newPage({ width: 390, height: 700 }, { hasTouch: true, isMobile: true })
  await page.goto(`${base}/#/settings`); await page.waitForSelector('[data-ro-settings]'); await page.waitForTimeout(400)
  await page.evaluate(() => window.scrollTo(0, 1400)); await page.waitForTimeout(300)
  await page.evaluate(() => { location.hash = '#/saves' }); await page.waitForTimeout(700)
  check(await page.evaluate(() => scrollY) === 0, 'Opening another page starts at the top')
  await page.goBack(); await page.waitForSelector('[data-ro-settings]'); await page.waitForTimeout(700)
  check(await page.evaluate(() => scrollY) > 400, 'Back to Settings returns to where you were', String(await page.evaluate(() => scrollY)))
  await page.evaluate(() => { location.hash = '#/' }); await page.waitForTimeout(500)
  await page.evaluate(() => { location.hash = '#/settings' }); await page.waitForSelector('[data-ro-settings]'); await page.waitForTimeout(700)
  check(await page.evaluate(() => scrollY) < 50, 'Opening Settings from the menu starts at the top', String(await page.evaluate(() => scrollY)))
  await page.context().close()
}

// ---- Layout on every device class
const devices = {
  'desktop 1920': { width: 1920, height: 1080 },
  'laptop 1366': { width: 1366, height: 768 },
  'Chromebook 1366 (touch)': { width: 1366, height: 768, hasTouch: true, userAgent: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36' },
  'tablet 768': { width: 768, height: 1024, hasTouch: true, isMobile: true },
  'tablet landscape 1024': { width: 1024, height: 768, hasTouch: true, isMobile: true },
  'phone 390': { width: 390, height: 844, hasTouch: true, isMobile: true },
  'phone 360': { width: 360, height: 740, hasTouch: true, isMobile: true },
  'phone landscape 844': { width: 844, height: 390, hasTouch: true, isMobile: true },
}
for (const [name, options] of Object.entries(devices)) {
  const { width, height, ...rest } = options
  const page = await newPage({ width, height }, rest)
  const problems = []
  for (const route of ['#/', '#/library/@all', '#/game/demo-nes-adventure', '#/upload', '#/settings', '#/saves']) {
    await page.goto(`${base}/${route}`); await page.waitForTimeout(700)
    const found = await page.evaluate(({ touch }) => {
      const visible = el => { const s = getComputedStyle(el), b = el.getBoundingClientRect(); return s.visibility !== 'hidden' && s.display !== 'none' && b.width > 0 && b.height > 0 && !el.closest('[hidden]') && !el.closest('details:not([open]) > :not(summary)') }
      const out = []
      if (document.documentElement.scrollWidth > document.documentElement.clientWidth) out.push('sideways scroll')
      if (touch) {
        const small = [...document.querySelectorAll('a[href], button, input:not([type=hidden]):not([type=file]), select, textarea, summary')].filter(visible).filter(e => !e.closest('p, li') && Math.min(e.getBoundingClientRect().width, e.getBoundingClientRect().height) < 43.5)
        if (small.length) out.push(`${small.length} small target(s): ${small.slice(0, 3).map(e => (e.id || e.className || e.tagName).toString().slice(0, 24)).join(', ')}`)
      }
      const tiny = [...document.querySelectorAll('p, span, a, button, li, label, strong, small')].filter(e => visible(e) && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 10.9)
      if (tiny.length) out.push(`${tiny.length} text run(s) under 11px`)
      return out
    }, { touch: !!rest.hasTouch })
    for (const item of found) problems.push(`${route} ${item}`)
  }
  check(problems.length === 0, `Layout on ${name}`, problems.join('; '))
  await page.context().close()
}

check(ui.errors.length === 0, 'No uncaught page errors in the whole run', ui.errors.slice(0, 3).join(' | '))
await browser.close(); server.close()
console.log(failed ? `${failed} UI check(s) failed` : 'All UI checks passed')
process.exit(failed ? 1 : 0)
