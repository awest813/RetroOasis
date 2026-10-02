import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'

const compile = name => ts.transpileModule(fs.readFileSync(new URL(`../src/lib/${name}.ts`, import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText
const source = compile('covers')
const dom = compile('dom')
const { libretroBoxartUrl, resolveCoverUrls, romFilenameFromUrl, gamesForLocalCover } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))
const { coverMarkup } = await import('data:text/javascript;base64,' + Buffer.from(dom).toString('base64'))
const name = url => decodeURIComponent(new URL(url).pathname.split('/').pop())
assert.equal(libretroBoxartUrl('unknown', 'Game'), null)
assert.equal(libretroBoxartUrl('nes', ' '), null)
assert.equal(name(libretroBoxartUrl('nes', 'A & B: Test?')), 'A _ B_ Test_.png')
assert.equal(name(libretroBoxartUrl('nes', 'Cafe\u0301')), 'Café.png', 'Normalize equivalent Unicode filenames')
const urls = resolveCoverUrls('nes', 'Super Mario Bros', null, true, 'Super Mario Bros. (World).nes')
assert.equal(name(urls[0]), 'Super Mario Bros. (World).png', 'Use original punctuation and region')
assert(urls.every(url => url.startsWith('https://raw.githubusercontent.com/libretro-thumbnails/')))
assert.equal(new Set(urls).size, urls.length)
assert(urls.length <= 18, 'Bound the number of guesses')
assert.equal(name(resolveCoverUrls('snes', 'Game (USA) [!]', null, true)[1]), 'Game (USA).png')
assert(resolveCoverUrls('nes', 'Super Mario Bros', null, true, 'Super Mario Bros. (Europe) [!].nes').some(url => name(url) === 'Super Mario Bros. (World).png'), 'Preserve filename punctuation in region guesses')
assert.deepEqual(resolveCoverUrls('nes', 'Game', null, false), [])
assert.deepEqual(resolveCoverUrls('unknown', 'Game', './local.png', true), ['./local.png'])
assert.equal(resolveCoverUrls('nes', 'Game', 'blob:fixture', true)[0], 'blob:fixture')
assert.equal(resolveCoverUrls('nes', 'Game', 'https://custom.example/art.png', false)[0], 'https://custom.example/art.png')
const legacy = 'https://thumbnails.libretro.com/Nintendo%20-%20Nintendo%20Entertainment%20System/Named_Boxarts/Game%20(USA).png'
assert.equal(resolveCoverUrls('nes', 'Game', legacy, false)[0], libretroBoxartUrl('nes', 'Game (USA)'))
assert.equal(name(resolveCoverUrls('nes', 'Game', null, true, romFilenameFromUrl('roms/nes/Game%20(Europe).zip?download=1'))[0]), 'Game (Europe).png')
assert.equal(name(resolveCoverUrls('nes', 'Game', null, true, 'local://record-id')[0]), 'Game.png')
assert(resolveCoverUrls('gb', 'Game', null, true, 'Game (USA).gbc')[0].includes('Nintendo_-_Game_Boy_Color'))
assert(!coverMarkup('<Title>', 'cyan', []).includes('<img'))
assert(coverMarkup('<Title>', 'cyan', ['a".png', 'b.png']).includes('a&quot;.png'))
const candidates = (title, filename = '', platform = 'nes') => resolveCoverUrls(platform, title, null, true, filename).map(name)
assert.deepEqual(candidates('Game', 'Game (Europe) (En,Fr) (Rev 1) [!].nes').slice(0, 3), [
  'Game (Europe) (En,Fr) (Rev 1) [!].png', 'Game (Europe) (En,Fr).png', 'Game (Europe).png',
], 'Drop dump metadata before changing regions')
assert(candidates('Game', 'Game (U) [!].nes').includes('Game (USA).png'), 'Expand GoodTools region alias')
assert(candidates('Game', 'Game (UE) [!].nes').includes('Game (USA, Europe).png'), 'Expand combined GoodTools regions')
assert(candidates('Game (Special Edition)', 'Game (Special Edition) (USA).nes').every(value => value.includes('(Special Edition)')), 'Keep meaningful subtitles')
assert(candidates('Game', 'Game (Special Edition) (USA).nes').every(value => value.includes('(Special Edition)')), 'Keep subtitles stripped by legacy display titles')
assert(candidates('Game (II)', 'Game (II) (USA).nes').every(value => value.includes('(II)')), 'Do not treat a Roman sequel as a language')
assert.equal(candidates('Correct Game', 'Wrong Game (USA).nes')[0], 'Correct Game.png', 'Explicit renamed title wins over unrelated filename')
assert.equal(candidates('Game', 'Game (Europe) (Disc 1) (Track 01).bin')[1], 'Game (Europe).png', 'Drop disc and track tags')
assert(candidates('Super Mario Bros', 'Super_Mario_Bros (USA).nes').includes('Super Mario Bros (USA).png'), 'Normalize underscores only for fallbacks')
assert(candidates('Sonic the Hedgehog', 'Sonic.the.Hedgehog.bin').includes('Sonic the Hedgehog (USA).png'), 'Try equivalent display punctuation')
assert(candidates('The Legend of Zelda').includes('Legend of Zelda, The (USA).png'), 'Try trailing article conventions')
assert(candidates('Legend of Zelda, The').includes('The Legend of Zelda (USA).png'), 'Try leading article conventions')
assert.equal(candidates('', 'Game (USA).nes.zip')[0], 'Game (USA).png', 'Unwrap archive and ROM extensions')
assert.equal(candidates('Game #1', 'Game #1.nes')[0], 'Game #1.png', 'Do not truncate literal hash')
assert.equal(candidates('Game%20', 'Game%20.nes')[0], 'Game%20.png', 'Do not URL-decode a literal filename')
assert.equal(candidates('Game_1', 'Game?1.nes')[0], 'Game_1.png', 'Sanitize literal question mark without truncation')
assert.equal(romFilenameFromUrl('https://host.test/roms/Game%2520%23%3F.gbc?token=x#section'), 'Game%20#?.gbc', 'Decode hosted path once without query/fragment')
assert.equal(romFilenameFromUrl('roms/Game%broken.nes'), 'Game%broken.nes', 'Malformed percent encoding is safe')
assert(resolveCoverUrls('gb', 'Game', null, true, romFilenameFromUrl('roms/Game.gbc.zip?q=1'))[0].includes('Nintendo_-_Game_Boy_Color'))
assert(resolveCoverUrls('gb', 'The Long Game (USA) (Rev 1) [!]', null, true, 'The Long Game (USA) (Rev 1) [!].gbc').length <= 36, 'Bound cross-system guesses')
assert(!coverMarkup('Game', 'cyan', ['', ' ']).includes('<img'), 'Blank candidates are placeholders')
assert.equal((coverMarkup('Game', 'cyan', ['a.png', 'a.png']).match(/a.png/g) ?? []).length, 3, 'Deduplicate candidate markup')
const localGames = [
  { title: 'Game', platform: 'nes', romFilename: 'Game (USA).nes', id: 'us' },
  { title: 'Game', platform: 'nes', romFilename: 'Game (Europe).nes', id: 'eu' },
  { title: 'Game 2', platform: 'nes', romFilename: 'Game 2 (USA).nes', id: 'sequel' },
  { title: 'Game', platform: 'snes', romFilename: 'Game.sfc', id: 'other-platform' },
  { title: 'Game', platform: 'nes', romFilename: 'Game (Japan).nes', cover: 'custom.png', id: 'custom' },
]
assert.deepEqual(gamesForLocalCover(localGames, 'nes', 'Game.png').map(game => game.id), ['us', 'eu'], 'Generic local cover matches full title and preserves custom art')
assert.deepEqual(gamesForLocalCover(localGames, 'nes', 'Game (Europe).png').map(game => game.id), ['eu'], 'Tagged local cover stays in its region')
assert.deepEqual(gamesForLocalCover(localGames, 'nes', 'Game (World).png'), [], 'Unknown tagged cover does not cross regions')
assert.deepEqual(gamesForLocalCover(localGames, 'nes', 'Gam.png'), [], 'Local cover never matches a title prefix')
assert.deepEqual(gamesForLocalCover([{title: '星のカービィ', platform: 'gb', romFilename: '星のカービィ.gb'}], 'gb', '星のカービィ.png').length, 1, 'Unicode local covers match full filenames without slug collisions')
assert.deepEqual(gamesForLocalCover(localGames, 'nes', '.png'), [], 'An empty local cover name matches nothing')
assert.deepEqual(gamesForLocalCover([{title: 'A+B', platform: 'nes', romFilename: 'A+B (USA).nes'}], 'nes', 'AB.png'), [], 'Generic local matching preserves significant punctuation')
console.log('PASS: cover filename parsing, metadata, region/article fallbacks, legacy migration and markup')

// Run the real manifest generator and --covers scanner against disposable files.
const here = path.dirname(fileURLToPath(import.meta.url))
const fixtureDir = fs.mkdtempSync(path.join(here, '.covers-test-cache-'))
try {
  const scripts = path.join(fixtureDir, 'retrooasis', 'scripts')
  const libs = path.join(fixtureDir, 'retrooasis', 'src', 'lib')
  const roms = path.join(fixtureDir, 'roms', 'nes')
  fs.mkdirSync(scripts, { recursive: true })
  fs.mkdirSync(libs, { recursive: true })
  fs.mkdirSync(roms, { recursive: true })
  for (const script of ['generate-roms-manifest.mjs', 'scan-roms.mjs']) fs.copyFileSync(path.join(here, script), path.join(scripts, script))
  fs.copyFileSync(new URL('../src/lib/covers.ts', import.meta.url), path.join(libs, 'covers.ts'))
  const literal = 'Game #1%20 (Europe) (Rev 1).nes'
  fs.writeFileSync(path.join(roms, literal), 'fixture')
  const covered = 'Local #2%20'
  fs.writeFileSync(path.join(roms, `${covered}.nes`), 'fixture')
  fs.writeFileSync(path.join(roms, `${covered}.png`), 'fixture')
  const shim = path.join(fixtureDir, 'fetch.mjs')
  const wanted = libretroBoxartUrl('nes', 'Game #1%20 (Europe)')
  fs.writeFileSync(shim, `globalThis.fetch = async (url, options) => {
    if (options.method !== 'HEAD' || !options.signal) throw new Error('Probe must be bounded HEAD');
    return new Response(null, {status: url === ${JSON.stringify(wanted)} ? 200 : 404, headers: {'content-type': 'image/png'}});
  };`)
  const run = spawnSync(process.execPath, ['--import', pathToFileURL(shim).href, path.join(scripts, 'scan-roms.mjs'), '--covers'], { encoding: 'utf8', timeout: 20000 })
  assert.equal(run.status, 0, run.stdout + run.stderr)
  const manifest = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'roms', 'manifest.json'), 'utf8'))
  const game = manifest.games.find(game => game.romFilename === literal)
  assert(game, 'Manifest preserves literal filename')
  assert.equal(game.file, `roms/nes/${encodeURIComponent(literal)}`, 'Manifest paths encode special characters')
  assert.equal(game.cover, wanted, 'Scanner shares region-preserving fallback matcher')
  assert.equal(manifest.games.find(game => game.romFilename === `${covered}.nes`).cover, `roms/nes/${encodeURIComponent(covered)}.png`, 'Local cover path encodes special characters')
  console.log('PASS: isolated manifest generation and scanner fallbacks')
} finally {
  if (!fixtureDir.startsWith(here + path.sep)) throw new Error('Fixture cleanup outside test directory')
  fs.rmSync(fixtureDir, { recursive: true, force: true })
}

if (process.argv.includes('--browser')) {
  const counts = new Map()
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="48"><rect width="32" height="48" fill="cyan"/></svg>'
  const images = http.createServer((req, res) => {
    counts.set(req.url, (counts.get(req.url) ?? 0) + 1)
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
    const attempt = counts.get(req.url)
    const requestUrl = new URL(req.url, 'http://127.0.0.1')
    const transientArt = (requestUrl.pathname === '/flaky.svg' && !requestUrl.searchParams.has('expired'))
      || (requestUrl.pathname === '/recovering.svg' && attempt > 1)
    if (req.url === '/art.svg' || transientArt) {
      res.setHeader('Cache-Control', req.url === '/art.svg' ? 'public, max-age=3600' : 'no-store')
      res.setHeader('Content-Type', 'image/svg+xml'); res.end(svg)
    } else if (req.url === '/bad-image.svg') {
      res.setHeader('Cache-Control', 'no-store')
      res.setHeader('Content-Type', 'image/svg+xml'); res.end('invalid image')
    } else if (req.url === '/slow-missing.svg') {
      res.setHeader('Cache-Control', 'no-store')
      setTimeout(() => { res.statusCode = 404; res.end('Missing') }, 100)
    } else {
      res.setHeader('Cache-Control', 'no-store')
      res.statusCode = 404; res.end('Missing')
    }
  })
  await new Promise(resolve => images.listen(0, '127.0.0.1', resolve))
  const imageOrigin = `http://127.0.0.1:${images.address().port}`
  const fixture = fs.readFileSync(new URL('./covers-browser-tests.js', import.meta.url), 'utf8')
  const server = http.createServer((req, res) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
    if (req.url === '/dom.js' || req.url === '/covers.js' || req.url === '/tests.js') {
      res.setHeader('Content-Type', 'text/javascript')
      res.end(req.url === '/dom.js' ? dom : req.url === '/covers.js' ? source : `const imageOrigin = ${JSON.stringify(imageOrigin)};\n${fixture}`)
    } else if (req.url === '/counts') {
      res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(Object.fromEntries(counts)))
    } else {
      res.setHeader('Content-Type', 'text/html')
      res.end('<!doctype html><title>Cover loading tests</title><style>#fixture { position: fixed; top: 12px; right: 12px; max-width: 240px } #fixture img { max-width: 200px; max-height: 240px }</style><h1>Cover loading tests</h1><pre id="results">Running…</pre><div id="fixture"></div><script type="module" src="/tests.js"></script>')
    }
  })
  server.listen(0, '127.0.0.1', () => console.log(`Cover browser tests: http://127.0.0.1:${server.address().port}/`))
}
