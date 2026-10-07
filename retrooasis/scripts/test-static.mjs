import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const app = path.resolve(fileURLToPath(new URL('../', import.meta.url)))
const repo = path.dirname(app)
const romRoot = path.join(repo, 'roms')
await fs.mkdir(romRoot, { recursive: true })
const fixture = await fs.mkdtemp(path.join(romRoot, '.static-test-'))
const outside = await fs.mkdtemp(path.join(repo, 'roms-static-test-'))
let server
try {
  await fs.writeFile(path.join(fixture, 'Game #1%20.nes'), 'test-rom')
  await fs.writeFile(path.join(outside, 'private.txt'), 'outside-public-root')
  // Junctions also work on Windows without enabling symlink privileges.
  await fs.symlink(outside, path.join(fixture, 'escape'), process.platform === 'win32' ? 'junction' : 'dir')
  server = await createServer({ root: app, configFile: path.join(app, 'vite.config.ts'), server: { host: '127.0.0.1', port: 0 }, logLevel: 'silent' })
  await server.listen()
  const port = server.httpServer.address().port
  const request = (url, method = 'GET') => new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: url, method }, res => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', chunk => { body += chunk })
      res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers }))
    })
    req.on('error', reject)
    req.end()
  })
  const prefix = `/roms/${path.basename(fixture)}`
  const normal = await request(`${prefix}/${encodeURIComponent('Game #1%20.nes')}`)
  assert.equal(normal.status, 200)
  assert.equal(normal.body, 'test-rom', 'Special filename characters decode exactly once')
  const head = await request(`${prefix}/${encodeURIComponent('Game #1%20.nes')}`, 'HEAD')
  assert.equal(head.status, 200)
  assert.equal(head.body, '')
  assert.equal(head.headers['content-length'], '8')
  for (const separator of ['%2f', '%5c']) {
    const escaped = await request(`/roms/..${separator}${path.basename(outside)}${separator}private.txt`)
    assert.notEqual(escaped.body, 'outside-public-root', 'Sibling-prefix traversal cannot read outside the ROM directory')
    // A backslash only separates paths on Windows; elsewhere it names a missing file inside roms/.
    const expected = separator === '%5c' && process.platform !== 'win32' ? 404 : 403
    assert.equal(escaped.status, expected, 'Sibling-prefix traversal cannot escape the ROM directory')
  }
  assert.equal((await request(`${prefix}/escape/private.txt`)).status, 403, 'Symlink targets must remain inside the public root')
  for (const suffix of ['bad%ZZ.nes', '%00.nes']) assert.equal((await request(`${prefix}/${suffix}`)).status, 400)
  assert.equal((await request(`${prefix}/missing.nes`)).status, 404, 'Missing ROMs cannot fall through to SPA HTML')
  assert.equal((await request(prefix)).status, 404, 'Directories cannot fall through to SPA HTML')
  assert.equal((await request(`${prefix}/missing.nes`, 'POST')).status, 405)
  const player = await request('/emulator/loader.js')
  assert.equal(player.status, 200)
  assert.match(player.headers['content-type'], /javascript/)
  assert.equal((await request('/data/loader.js')).status, 200)
  console.log('PASS: development static routes, encoded filenames, HEAD, invalid paths, traversal and symlink boundaries')
} finally {
  await server?.close()
  for (const target of [fixture, outside]) {
    if (!path.resolve(target).startsWith(repo + path.sep)) throw new Error('Static fixture outside workspace')
    await fs.rm(target, { recursive: true, force: true })
  }
}
