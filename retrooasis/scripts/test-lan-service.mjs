import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { LAN_PROTOCOL } from '../public/lan-capabilities.js'

const source = ts.transpileModule(fs.readFileSync(new URL('../src/lib/lan.ts', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText.replaceAll("'../../public/lan-capabilities.js'", JSON.stringify(new URL('../public/lan-capabilities.js', import.meta.url).href))
const { checkLanService, getLanInfo } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))
const info = { available: true, protocol: LAN_PROTOCOL, maxPlayers: 4, secure: false, addresses: [], cores: ['nes', 'snes', 'segaMD', 'n64'] }
const originalFetch = globalThis.fetch
let passed = 0
const json = data => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } })
async function check(name, response, expected) {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, './api/lan')
    assert.equal(options.cache, 'no-store')
    assert.ok(options.signal instanceof AbortSignal)
    return typeof response === 'function' ? response(options.signal) : response
  }
  assert.equal((await checkLanService()).state, expected, name)
  passed++
}
try {
  await check('Current service', json(info), 'ready')
  await check('HTTPS service', json({ ...info, secure: true }), 'ready')
  await check('Missing API', new Response('', { status: 404 }), 'unavailable')
  await check('SPA HTML fallback', new Response('<html></html>', { headers: { 'content-type': 'text/html' } }), 'unavailable')
  await check('Server failure', new Response('', { status: 503 }), 'unreachable')
  await check('Network failure', () => { throw new TypeError('Network unavailable') }, 'unreachable')
  await check('Wrong protocol', json({ ...info, protocol: LAN_PROTOCOL - 1 }), 'incompatible')
  await check('Unknown cores only', json({ ...info, cores: ['future-core'] }), 'incompatible')
  await check('Service disabled', json({ ...info, available: false }), 'unavailable')
  await check('Null response', json(null), 'invalid')
  await check('Non-JSON response', new Response('{broken'), 'invalid')
  for (const override of [{ secure: 'yes' }, { maxPlayers: 5 }, { maxPlayers: 2.5 }, { addresses: [42] }, { cores: [null] }]) {
    await check('Reject malformed fields ' + JSON.stringify(override), json({ ...info, ...override }), 'invalid')
  }
  await check('Bounded timeout', signal => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })), 'timeout')
  const controller = new AbortController()
  globalThis.fetch = async (url, options) => new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }))
  const pending = checkLanService(controller.signal)
  controller.abort()
  assert.equal((await pending).state, 'unreachable', 'View cancellation stops its request')
  passed++
  globalThis.fetch = async () => json(info)
  assert.deepEqual(await getLanInfo(), info, 'Existing detail-page API remains compatible')
  globalThis.fetch = async () => json({ ...info, protocol: -1 })
  assert.equal(await getLanInfo(), null, 'Detail page rejects an incompatible host')
  passed += 2
} finally { globalThis.fetch = originalFetch }
console.log(`LAN service: ${passed} checks passed`)

// An owned fixture serves the built Settings view without altering its code.
// Use the separate control page to change responses, then press Check again.
if (process.argv.includes('--browser')) {
  const dist = path.resolve(fileURLToPath(new URL('../dist/', import.meta.url)))
  if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error('Run npm run oasis:build first')
  const modes = ['ready', 'slow-ready', 'https', 'unavailable', 'incompatible', 'invalid', 'timeout', 'unreachable']
  let mode = 'ready'
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' }
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
    if (url.pathname === '/__test') {
      if (req.method === 'POST' && modes.includes(url.searchParams.get('mode'))) mode = url.searchParams.get('mode')
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.end(`<h1>Settings service fixture</h1><p>Current response: ${mode}</p>${modes.map(value => `<form method="post" action="/__test?mode=${value}" style="display:inline"><button>${value}</button></form>`).join('')}<p><a href="/#/settings">Open Settings</a> · <a href="/#/game/lan-audit-detail">Open game detail</a></p>`)
      return
    }
    if (url.pathname === '/api/lan') {
      if (mode === 'timeout') { const timer = setTimeout(() => res.end('{}'), 6000); res.once('close', () => clearTimeout(timer)); return }
      if (mode === 'unavailable' || mode === 'unreachable') { res.writeHead(mode === 'unavailable' ? 404 : 503); res.end(); return }
      res.setHeader('Content-Type', 'application/json')
      const body = mode === 'invalid' ? '{broken' : JSON.stringify({ ...info, secure: mode === 'https', protocol: mode === 'incompatible' ? -1 : LAN_PROTOCOL })
      if (mode === 'slow-ready') { const timer = setTimeout(() => res.end(body), 1800); res.once('close', () => clearTimeout(timer)); return }
      res.end(body)
      return
    }
    if (url.pathname === '/catalog/games.json') {
      const catalog = JSON.parse(fs.readFileSync(path.join(dist, 'catalog/games.json'), 'utf8'))
      catalog.games.push({ id: 'lan-audit-detail', title: 'LAN audit fixture', platform: 'n64', core: 'n64', file: 'roms/audit.z64', cover: './favicon.svg', demo: false })
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(catalog))
      return
    }
    let file
    try { file = path.resolve(dist, '.' + decodeURIComponent(url.pathname)) } catch { res.writeHead(400); res.end(); return }
    if (file !== dist && !file.startsWith(dist + path.sep)) { res.writeHead(403); res.end(); return }
    if (url.pathname === '/') file = path.join(dist, 'index.html')
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return }
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream')
    fs.createReadStream(file).pipe(res)
  })
  server.listen(0, '127.0.0.1', () => console.log(`Settings fixture: http://127.0.0.1:${server.address().port}/__test`))
  process.once('SIGINT', () => server.close())
  process.once('SIGTERM', () => server.close())
}
