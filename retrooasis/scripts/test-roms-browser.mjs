#!/usr/bin/env node
// Opt-in: boot every ROM in a folder of system folders in the real player and report what happens.
//   npm --prefix retrooasis run test:roms -- "C:\path\Games" [--limit 20] [--concurrency 3] [--channel stable] [--out report.json]
// The folder holds one folder per system (gba/, "Nintendo - Game Boy Advance/", ...). Needs a build
// (npm run oasis:build) and Playwright (npm i --no-save playwright-core, then npx playwright-core install chromium,
// or set PLAYWRIGHT_CORE). No ROMs ship with RetroOasis, and none are copied: the folder is served read-only
// on loopback for the length of the run. Cores come from the CDN for the chosen channel.
//
// A ROM passes when the player starts, draws something other than one flat colour, and shows no error card.
// Slow fades and title screens are given time, but a flat frame after 12 s is reported as "blank".
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import ts from 'typescript'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '../..')
const args = process.argv.slice(2)
const flag = (name, fallback) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : fallback }
const root = args.find(arg => !arg.startsWith('--') && !args[args.indexOf(arg) - 1]?.startsWith('--'))
if (!root) { console.log('Usage: test-roms-browser.mjs <folder of system folders> [--limit N] [--concurrency N] [--channel stable|nightly] [--out file.json]'); process.exit(0) }
const limit = Number(flag('--limit', 0)), concurrency = Number(flag('--concurrency', 3)), channel = flag('--channel', 'stable'), outFile = flag('--out', '')

let playwright
try { playwright = await import(process.env.PLAYWRIGHT_CORE ? pathToFileURL(path.join(process.env.PLAYWRIGHT_CORE, 'index.mjs')).href : 'playwright-core') }
catch { console.log('SKIP ROM browser test: Playwright is not installed. Run npm i --no-save playwright-core, then npx playwright-core install chromium.'); process.exit(0) }
const dist = path.join(repo, 'retrooasis/dist')
if (!fs.existsSync(path.join(dist, 'player.html'))) throw new Error('Build RetroOasis first: npm run oasis:build')
if (!fs.existsSync(root)) throw new Error(`Folder not found: ${root}`)

// Reuse the app's own folder and extension rules instead of keeping a second table here.
const compiled = ts.transpileModule(fs.readFileSync(path.join(repo, 'retrooasis/src/lib/cores.ts'), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
const cores = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'))

const jobs = []
for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  const platform = cores.platformFromFolder(entry.name)
  if (!platform) { console.log(`skip folder "${entry.name}": not a system name`); continue }
  const core = cores.normalizePlayCore(cores.coreForPlatform(platform))
  const files = fs.readdirSync(path.join(root, entry.name)).filter(name => cores.isRomFile(name)).sort()
  for (const name of files) jobs.push({ id: `${entry.name}/${name}`, rom: `/rom/${encodeURIComponent(entry.name)}/${encodeURIComponent(name)}`, core, name })
}
const todo = limit > 0 ? jobs.slice(0, limit) : jobs
if (!todo.length) { console.log('No ROMs found.'); process.exit(0) }

const types = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' }
const inside = (base, target) => { const rel = path.relative(base, target); return rel && !rel.startsWith('..') && !path.isAbsolute(rel) }
const server = http.createServer((req, res) => {
  let p; try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname) } catch { res.statusCode = 400; return res.end() }
  const [base, rel] = p.startsWith('/rom/') ? [root, p.slice(5)] : p.startsWith('/data/') ? [path.join(repo, 'data'), p.slice(6)] : [dist, p === '/' ? 'index.html' : p.slice(1)]
  const file = path.resolve(base, rel)
  if (!inside(base, file)) { res.statusCode = 403; return res.end() }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.statusCode = 404; return res.end('not found') }
    res.writeHead(200, { 'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size, 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp', 'Cache-Control': 'no-store' })
    if (req.method === 'HEAD') return res.end()
    fs.createReadStream(file).pipe(res)
  })
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${server.address().port}`
const browser = await playwright.chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const context = await browser.newContext({ viewport: { width: 640, height: 480 } })
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

// Number of distinct colours in a small copy of the game canvas, read inside a frame so GL output is intact.
const shades = page => page.evaluate(() => new Promise(resolve => {
  const canvas = document.querySelector('#game canvas'); if (!canvas) return resolve(null)
  requestAnimationFrame(() => {
    try {
      const probe = document.createElement('canvas'); probe.width = 64; probe.height = 48
      const ctx = probe.getContext('2d', { willReadFrequently: true }); ctx.drawImage(canvas, 0, 0, 64, 48)
      const data = ctx.getImageData(0, 0, 64, 48).data, seen = new Set()
      for (let i = 0; i < data.length; i += 4) seen.add((data[i] >> 4) * 256 + (data[i + 1] >> 4) * 16 + (data[i + 2] >> 4))
      resolve(seen.size)
    } catch { resolve(null) }
  })
}))

async function run(job) {
  const page = await context.newPage(), started = Date.now(), result = { id: job.id, core: job.core }
  const errors = []
  page.on('pageerror', error => errors.push(error.message.slice(0, 160)))
  try {
    await page.goto(`${base}/player.html?rom=${encodeURIComponent(job.rom)}&core=${job.core}&name=${encodeURIComponent(job.name)}&channel=${channel}`, { waitUntil: 'domcontentloaded' })
    const outcome = await page.waitForFunction(() => window.EJS_emulator?.started ? 'started' : document.querySelector('.ro-play-error') ? 'error:' + document.querySelector('.ro-play-error').innerText.replace(/\s+/g, ' ').slice(0, 160) : false, null, { timeout: 240000, polling: 250 }).then(h => h.jsonValue(), () => 'timeout')
    result.start = outcome
    if (outcome === 'started') {
      let best = 0
      for (let waited = 0; waited < 12000 && best <= 1; waited += 1500) { await sleep(1500); best = Math.max(best, (await shades(page)) ?? 0) }
      result.shades = best
      result.verdict = best > 1 ? 'ok' : 'blank'
    } else result.verdict = 'failed'
  } catch (error) { result.verdict = 'failed'; result.start = String(error).slice(0, 160) }
  result.errors = [...new Set(errors)]
  result.seconds = Math.round((Date.now() - started) / 100) / 10
  await page.close().catch(() => {})
  return result
}

const results = []
let next = 0
await Promise.all(Array.from({ length: concurrency }, async () => {
  while (next < todo.length) {
    const job = todo[next++], result = await run(job)
    results.push(result)
    console.log(`${String(results.length).padStart(String(todo.length).length)}/${todo.length} ${result.verdict.toUpperCase().padEnd(6)} ${result.seconds}s ${job.id}${result.verdict === 'failed' ? '  ' + result.start : ''}`)
  }
}))
await browser.close(); server.close()
const count = verdict => results.filter(result => result.verdict === verdict).length
if (outFile) fs.writeFileSync(outFile, JSON.stringify(results, null, 1))
console.log(`\n${results.length} ROMs: ${count('ok')} ok, ${count('blank')} blank, ${count('failed')} failed`)
process.exit(count('failed') ? 1 : 0)
