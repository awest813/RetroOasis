// Loopback-only, explicitly selected prototype assets. No library or LAN exposure.
import fs from 'node:fs/promises'
import http from 'node:http'
const cache = new URL('../../.handheld-cache/', import.meta.url)
const files = new Map([
  ['/fixture.js', new URL('./browser-fixture.js', import.meta.url)],
  ['/link-fixtures.js', new URL('./link-fixtures.js', import.meta.url)],
  ['/frame-clock.js', new URL('./frame-clock.js', import.meta.url)],
  ['/lan-shared.js', new URL('../../public/lan-shared.js', import.meta.url)],
  ['/lan-capabilities.js', new URL('../../public/lan-capabilities.js', import.meta.url)],
  ...['sameboy-link.mjs', 'sameboy-link.wasm', 'gpsp-link.mjs', 'gpsp-link.wasm'].map(name => ['/' + name, new URL(name, cache)]),
])
let rom
if (process.argv[2]) {
  rom = await fs.readFile(process.argv[2])
  if (rom.subarray(0xac, 0xb0).toString() !== 'AWRE') throw new Error('Only the supplied Advance Wars USA (AWRE) cartridge is accepted by this prototype.')
}
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Handheld link feasibility</title>
<style>body{background:#071016;color:#e7f5f7;font:16px system-ui;margin:32px}button{padding:12px;margin:4px;background:#12303a;color:white;border:1px solid #38dcc8;border-radius:6px}button:focus-visible{outline:3px solid white}canvas{width:min(100%,480px);image-rendering:pixelated}section{display:inline-block;vertical-align:top;margin:12px}pre{white-space:pre-wrap}</style>
<h1>Handheld link feasibility</h1><p>Core prototype only. Gameplay, audio playback and library save handling are still acceptance gates.</p>
<button id="gb">Test GB and GBC serial / saves</button><button id="gba" ${rom ? '' : 'disabled'}>Run supplied Advance Wars on two consoles</button><button id="pause" hidden>Pause both</button>
<pre id="result" role="status">Ready. Original GB/GBC serial fixtures; GBA requires a supplied AWRE ROM.</pre><div id="screens"></div><script type="module" src="/fixture.js"></script></html>`
const server = http.createServer(async (request, response) => {
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
  response.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
  response.setHeader('Cache-Control', 'no-store')
  if (request.method !== 'GET') { response.writeHead(405); response.end(); return }
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname
    const body = pathname === '/' ? html : pathname === '/rom' && rom ? rom : files.has(pathname) ? await fs.readFile(files.get(pathname)) : null
    if (body === null) { response.writeHead(404); response.end(); return }
    response.setHeader('Content-Type', pathname === '/' ? 'text/html; charset=utf-8' : pathname.endsWith('.wasm') ? 'application/wasm' : files.has(pathname) && !pathname.endsWith('.wasm') ? 'text/javascript; charset=utf-8' : 'application/octet-stream')
    response.end(body)
  } catch { response.writeHead(500); response.end('Build the local prototype first.') }
})
server.listen(0, '127.0.0.1', () => console.log(`Handheld browser fixture: http://127.0.0.1:${server.address().port}/ (Ctrl+C to stop)`))
