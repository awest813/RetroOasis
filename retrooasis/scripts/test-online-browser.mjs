// Opt-in browser test of online play with your own ROMs (none ship with RetroOasis).
//   npm --prefix retrooasis run test:online-browser -- --room nes=contra.zip --room n64=smash.z64 \
//     --link gb=crystal.zip --browsers chromium,firefox
// Needs a build (npm run oasis:build) and Playwright: npm i --no-save playwright-core, then
// npx playwright-core install chromium firefox (or point PLAYWRIGHT_CORE at an install).
// The host always runs in Chromium; guests run in each browser listed.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { createLanServer } from './lan-server.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '../..')
const args = process.argv.slice(2)
const values = name => args.flatMap((arg, i) => (arg === name && args[i + 1] ? [args[i + 1]] : []))
const pairs = name => values(name).map(value => { const at = value.indexOf('='); return { core: value.slice(0, at), file: path.resolve(value.slice(at + 1)) } })
const rooms = pairs('--room'), links = pairs('--link')
const browsers = (values('--browsers')[0] || 'chromium').split(',')
if (!rooms.length && !links.length) {
  console.log('Usage: test-online-browser.mjs --room <nes|snes|segaMD|psx|n64>=<rom> [--link <gb|gba>=<rom>] [--browsers chromium,firefox,webkit]')
  process.exit(0)
}
let playwright
try { playwright = await import(process.env.PLAYWRIGHT_CORE ? pathToFileURL(path.join(process.env.PLAYWRIGHT_CORE, 'index.mjs')).href : 'playwright-core') }
catch {
  console.log('SKIP online browser test: Playwright is not installed. Run npm i --no-save playwright-core, then npx playwright-core install chromium.')
  process.exit(0)
}
if (!fs.existsSync(path.join(repo, 'retrooasis/dist/index.html'))) throw new Error('Build RetroOasis first: npm run oasis:build')

// The ROMs are served from a scratch folder under roms/ for the length of the test.
const stage = path.join(repo, 'roms/.online-test')
fs.mkdirSync(stage, { recursive: true })
const cleanup = () => { if (stage.startsWith(path.join(repo, 'roms') + path.sep)) fs.rmSync(stage, { recursive: true, force: true }) }
for (const item of [...rooms, ...links]) {
  if (!fs.existsSync(item.file)) throw new Error(`ROM not found: ${item.file}`)
  item.url = `./roms/.online-test/${item.core}-${path.basename(item.file).replace(/[^\w.-]/g, '_')}`
  fs.copyFileSync(item.file, path.join(stage, path.basename(item.url)))
}
const lan = createLanServer({ port: 0 })
await new Promise(resolve => lan.server.listen(0, '127.0.0.1', resolve))
lan.setPort(lan.server.address().port)
const base = `http://127.0.0.1:${lan.server.address().port}`
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const hostBrowser = await playwright.chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] })
let failed = 0
const check = (ok, label) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`); if (!ok) failed++ }

async function guestPage(browser, code, name) {
  const page = await (await browser.newContext()).newPage()
  await page.goto(`${base}/lan.html#${code}`)
  await page.waitForFunction(() => !document.querySelector('#join-form button').disabled, null, { timeout: 15000 })
  await page.fill('#join-form [name=nickname]', name)
  await page.click('#join-form button[type=submit]')
  return page
}
const lobbyHidden = page => page.waitForFunction(() => document.querySelector('[data-lan-lobby]').hidden, null, { timeout: 30000 }).then(() => true, () => false)

try {
  for (const name of browsers) {
    const browser = name === 'chromium' ? hostBrowser : await playwright[name].launch({ headless: true })
    for (const room of rooms) {
      const label = `${name} guest · ${room.core} room`
      const host = await (await hostBrowser.newContext()).newPage()
      await host.goto(`${base}/player.html?rom=${encodeURIComponent(room.url)}&core=${room.core}&name=test&channel=local&lanhost=1`)
      const started = await host.waitForFunction(() => window.EJS_emulator?.started, null, { timeout: 120000 }).then(() => true, () => false)
      if (!started) {
        check(false, `${label}: the host game starts (${(await host.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 160)})`)
        await host.context().close(); continue
      }
      await host.locator('button:has-text("Create room")').click()
      await host.waitForFunction(() => document.querySelector('[data-lan-invite]')?.value.includes('#'), null, { timeout: 15000 })
      const code = (await host.locator('[data-lan-invite]').inputValue()).split('#')[1]
      await host.evaluate(() => { const f = EJS_emulator.gameManager.functions, send = f.simulateInput; window.__p2 = []; f.simulateInput = (p, i, v) => { if (p === 1) window.__p2.push(v); return send(p, i, v) } })
      const guest = await guestPage(browser, code, `${name}-guest`)
      check(await lobbyHidden(guest), `${label}: lobby clears when the game is on screen`)
      check(await guest.evaluate(() => { const v = document.querySelector('#lan-video'); return v.readyState >= 2 && v.videoWidth > 0 }), `${label}: video plays`)
      await guest.keyboard.down('KeyZ'); await sleep(250); await guest.keyboard.up('KeyZ'); await sleep(600)
      check(await host.evaluate(() => window.__p2.some(Boolean)), `${label}: a key reaches Player 2`)
      await host.evaluate(() => document.querySelector('[data-lan-pause]').click())
      check(await guest.waitForFunction(() => document.querySelector('[data-lan-lobby]').dataset.mode === 'paused' && !document.querySelector('[data-lan-lobby]').hidden, null, { timeout: 5000 }).then(() => true, () => false), `${label}: guest sees the pause`)
      await host.evaluate(() => document.querySelector('[data-lan-pause]').click())
      check(await lobbyHidden(guest), `${label}: resume clears it`)
      await guest.click('#leave'); await guest.context().close(); await host.context().close()
    }
    for (const link of links) {
      const label = `${name} guest · ${link.core} Trade & link`
      const host = await (await hostBrowser.newContext()).newPage()
      await host.goto(`${base}/link.html?rom=${encodeURIComponent(link.url)}&system=${link.core}&name=test`)
      await host.locator('button:has-text("Create room")').click({ timeout: 30000 })
      await host.waitForFunction(() => document.querySelector('[data-lan-invite]')?.value.includes('#'), null, { timeout: 15000 })
      const code = (await host.locator('[data-lan-invite]').inputValue()).split('#')[1]
      const guest = await guestPage(browser, code, `${name}-guest`)
      await guest.waitForFunction(() => document.querySelector('[data-lobby-head]').textContent.includes('Add your game'), null, { timeout: 30000 })
      await guest.setInputFiles('#cart-form [name=rom]', link.file)
      await guest.click('#cart-form button[type=submit]')
      check(await host.waitForFunction(() => !document.querySelector('#start').disabled, null, { timeout: 30000 }).then(() => true, () => false), `${label}: the guest's cartridge reaches the host`)
      await host.click('#start')
      check(await lobbyHidden(guest), `${label}: the link starts for the guest`)
      await guest.click('#leave'); await guest.context().close(); await host.context().close()
    }
    if (browser !== hostBrowser) await browser.close()
  }
} finally {
  await hostBrowser.close()
  lan.rooms.close(); lan.io.close(); lan.server.close()
  cleanup()
}
console.log(failed ? `${failed} online browser check(s) failed` : 'All online browser checks passed')
process.exit(failed ? 1 : 0)
