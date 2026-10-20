#!/usr/bin/env node
/**
 * RetroAchievements hash, parser, and badge tests.
 *   node scripts/test-ra.mjs
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const srcDir = path.resolve(here, '..', 'src', 'lib')
const cacheDir = path.join(here, '.ra-test-cache')

fs.rmSync(cacheDir, { recursive: true, force: true })
fs.mkdirSync(cacheDir, { recursive: true })

for (const name of ['md5.ts', 'raHash.ts', 'dom.ts', 'router.ts', 'raModel.ts']) {
  let source = fs.readFileSync(path.join(srcDir, name), 'utf8')
  source = source.replace(/from '\.\/([^']+)'/g, (match, spec) => (
    spec.endsWith('.ts') ? match : `from './${spec}.ts'`
  ))
  fs.writeFileSync(path.join(cacheDir, name), source)
}

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

const store = new Map()
globalThis.localStorage = {
  getItem(key) { return store.has(key) ? store.get(key) : null },
  setItem(key, value) { store.set(key, String(value)) },
  removeItem(key) { store.delete(key) },
}

const { md5Hex, md5Text } = await import(`file://${path.join(cacheDir, 'md5.ts').replace(/\\/g, '/')}`)
const hashMod = await import(`file://${path.join(cacheDir, 'raHash.ts').replace(/\\/g, '/')}`)
const model = await import(`file://${path.join(cacheDir, 'raModel.ts').replace(/\\/g, '/')}`)

let passed = 0
let failed = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) {
    passed += 1
    console.log(`  ok  ${name}`)
  } else {
    failed += 1
    console.error(`FAIL  ${name}\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(actual)}`)
  }
}

const ref = (bytes) => crypto.createHash('md5').update(bytes).digest('hex')
const text = (value) => new TextEncoder().encode(value)
const bytes = (...parts) => {
  const list = parts.map((part) => (typeof part === 'string' ? text(part) : part))
  const size = list.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(size)
  let offset = 0
  for (const part of list) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

console.log('md5')
check('empty', md5Hex(new Uint8Array()), 'd41d8cd98f00b204e9800998ecf8427e')
check('a', md5Text('a'), '0cc175b9c0f1b6a831c399e269772661')
check('abc', md5Text('abc'), '900150983cd24fb0d6963f7d28e17f72')
check('message digest', md5Text('message digest'), 'f96b697d7cb7938d525a2f31aaf161d0')
const long = new Uint8Array(100_000)
for (let i = 0; i < long.length; i++) long[i] = i & 255
check('100kb matches node crypto', md5Hex(long), ref(long))

console.log('hashes')
const hello = text('HELLO')
const nes = bytes(text('NES\x1a'), new Uint8Array(12), hello)
check('nes skips iNES header', hashMod.hashRomBytes(nes, 'nes'), ref(hello))
const headerOnly = bytes(text('NES\x1a'), new Uint8Array(12))
check('nes header alone stays whole', hashMod.hashRomBytes(headerOnly, 'nes'), ref(headerOnly))
check('fds skips header', hashMod.hashRomBytes(bytes(text('FDS\x1a'), new Uint8Array(12), hello), 'nes'), ref(hello))
check('raw nes hashes the whole file', hashMod.hashRomBytes(hello, 'nes'), ref(hello))

const snesBody = new Uint8Array(8192).fill(0x41)
check('snes skips 512-byte header', hashMod.hashRomBytes(bytes(new Uint8Array(512), snesBody), 'snes'), ref(snesBody))
check('snes without header hashes the whole file', hashRom(snesBody, 'snes'), ref(snesBody))
check('snes 511 extra bytes is not a header', hashMod.hashRomBytes(bytes(new Uint8Array(511), snesBody), 'snes'), ref(bytes(new Uint8Array(511), snesBody)))

const pceBody = new Uint8Array(100).fill(7)
check('pce skips when size bit 9 is set', hashMod.hashRomBytes(bytes(new Uint8Array(512), pceBody), 'pce'), ref(pceBody))
check('pce plain file', hashMod.hashRomBytes(pceBody, 'pce'), ref(pceBody))

const lynx = new Uint8Array(64 + hello.length)
lynx.set(text('LYNX\0'))
lynx.set(hello, 64)
check('lynx skips 64-byte header', hashMod.hashRomBytes(lynx, 'lynx'), ref(hello))

const a78 = new Uint8Array(128 + hello.length)
a78[0] = 1
a78.set(text('ATARI7800'), 1)
a78.set(hello, 128)
check('7800 skips header', hashMod.hashRomBytes(a78, 'a7800'), ref(hello))
check('7800 without header', hashMod.hashRomBytes(hello, 'a7800'), ref(hello))

const z64 = Uint8Array.from([0x80, 0x37, 0x12, 0x40, 0x11, 0x22, 0x33, 0x44])
const v64 = Uint8Array.from([0x37, 0x80, 0x40, 0x12, 0x22, 0x11, 0x44, 0x33])
const n64 = Uint8Array.from([0x40, 0x12, 0x37, 0x80, 0x44, 0x33, 0x22, 0x11])
check('n64 z64', hashMod.hashRomBytes(z64, 'n64'), ref(z64))
check('n64 v64 normalizes to z64', hashMod.hashRomBytes(v64, 'n64'), ref(z64))
check('n64 little-endian normalizes to z64', hashMod.hashRomBytes(n64, 'n64'), ref(z64))
check('n64 rejects other files', hashMod.hashRomBytes(hello, 'n64'), null)

function ndsRom(prefix = 0) {
  const rom = new Uint8Array(prefix + 0x800)
  if (prefix) {
    rom[0] = 0x2e
    rom[3] = 0xea
    rom[0xb0] = 0x44
    rom[0xb1] = 0x46
    rom[0xb2] = 0x96
  }
  const headerAt = prefix
  const view = new DataView(rom.buffer)
  view.setUint32(headerAt + 0x20, 0x200, true)
  view.setUint32(headerAt + 0x2c, 4, true)
  view.setUint32(headerAt + 0x30, 0x300, true)
  view.setUint32(headerAt + 0x3c, 4, true)
  view.setUint32(headerAt + 0x68, 0x400, true)
  rom.set(text('ARM9'), prefix + 0x200)
  rom.set(text('ARM7'), prefix + 0x300)
  rom.set(new Uint8Array(8).fill(0xab), prefix + 0x400)
  const header = rom.subarray(headerAt, headerAt + 0x160)
  const icon = new Uint8Array(0xa00)
  icon.set(rom.subarray(prefix + 0x400, prefix + 0x408))
  const expected = ref(bytes(header, text('ARM9'), text('ARM7'), icon))
  return { rom, expected }
}
const plainDs = ndsRom(0)
check('nds hashes header, code and icon', hashMod.hashRomBytes(plainDs.rom, 'nds'), plainDs.expected)
const slotted = ndsRom(512)
check('nds ignores a SuperCard header', hashMod.hashRomBytes(slotted.rom, 'nds'), slotted.expected)
check('nds rejects a short file', hashMod.hashRomBytes(hello, 'nds'), null)
const ndsPlan = hashMod.planRaHash('nds', 'game.nds')
check('nds file hash matches the byte hash', (await hashMod.hashForPlan(hashMod.sourceFromBytes(plainDs.rom), 'game.nds', ndsPlan)).hash, plainDs.expected)
let ndsSpan = 0
const sparseDs = {
  size: 32 * 1024 * 1024,
  async read(start, end) {
    ndsSpan = Math.max(ndsSpan, end - start)
    const out = new Uint8Array(Math.max(0, end - start))
    if (start < plainDs.rom.length) out.set(plainDs.rom.subarray(start, Math.min(plainDs.rom.length, end)))
    return out
  },
}
check('nds hashes slices instead of the whole cart', (await hashMod.hashForPlan(sparseDs, 'large.nds', ndsPlan)).hash, plainDs.expected)
check('nds slice stays within the icon', ndsSpan <= 0xa00, true)

check('whole file caps', hashMod.hashRomBytes(bytes(text('HELLO')), 'whole', 4), ref(text('HELL')))
check('arcade filename', hashMod.arcadeHashName('roms/arcade/galaga.zip'), 'galaga')
check('fbneo folder prefix', hashMod.arcadeHashName('nes/smb.zip'), 'nes_smb')
check('fbneo folder is lowercased', hashMod.arcadeHashName('NES/Smb.zip'), 'nes_Smb')
check('arcade hash is the name', md5Text('galaga'), ref(text('galaga')))

const nesPlan = hashMod.planRaHash('nes', 'roms/nes/Mario.nes')
check('nes console', nesPlan.consoleIds, [7])
check('fds consoles', hashMod.planRaHash('nes', 'game.fds').consoleIds, [81, 7])
check('gbc tries color first', hashMod.planRaHash('gb', 'Crystal.gbc').consoleIds, [6, 4])
check('gb tries original first', hashMod.planRaHash('gb', 'Red.gb').consoleIds, [4, 6])
check('psx is not guessed', hashMod.planRaHash('psx', 'game.cue').reason.includes('Disc'), true)
check('unif is not guessed', hashMod.planRaHash('nes', 'board.unif').reason.includes('UNIF'), true)
check('jaguar cdi is a disc', hashMod.planRaHash('jaguar', 'game.cdi').reason.includes('Disc'), true)
const nesPlanZip = hashMod.planRaHash('nes', 'disk.zip')
check('zip can be an fds set', hashMod.consolesForMatchedFile(nesPlanZip, 'disk.zip', 'Zelda.fds'), [81, 7])
check('zip of a nes rom still searches fds too', hashMod.consolesForMatchedFile(nesPlanZip, 'disk.zip', 'Mario.nes'), [81, 7])
check('plain nes stays on nes', hashMod.consolesForMatchedFile(nesPlan, 'Mario.nes'), [7])

function zipOf(name, data, method = 0) {
  const stored = method === 8 ? zlib.deflateRawSync(data) : data
  const nameBytes = Buffer.from(name)
  const local = Buffer.alloc(30 + nameBytes.length)
  local.writeUInt32LE(0x04034b50, 0)
  local.writeUInt16LE(method, 8)
  local.writeUInt16LE(nameBytes.length, 26)
  nameBytes.copy(local, 30)
  const cd = Buffer.alloc(46 + nameBytes.length)
  cd.writeUInt32LE(0x02014b50, 0)
  cd.writeUInt16LE(method, 10)
  cd.writeUInt32LE(stored.length, 20)
  cd.writeUInt32LE(data.length, 24)
  cd.writeUInt16LE(nameBytes.length, 28)
  nameBytes.copy(cd, 46)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(1, 8)
  eocd.writeUInt16LE(1, 10)
  eocd.writeUInt32LE(cd.length, 12)
  eocd.writeUInt32LE(local.length + stored.length, 16)
  return new Uint8Array(Buffer.concat([local, stored, cd, eocd]))
}

const inner = bytes(text('NES\x1a'), new Uint8Array(12), hello)
const zipped = zipOf('Mario.nes', inner)
const deflated = zipOf('Mario.nes', inner, 8)
const plan = hashMod.planRaHash('nes', 'Mario.zip')
check('stored zip hashes the ROM inside', await hashMod.hashForPlan(hashMod.sourceFromBytes(zipped), 'Mario.zip', plan), { hash: ref(hello), name: 'Mario.nes' })
check('deflated zip hashes the ROM inside', await hashMod.hashForPlan(hashMod.sourceFromBytes(deflated), 'Mario.zip', plan), { hash: ref(hello), name: 'Mario.nes' })
const arcadePlan = hashMod.planRaHash('arcade', 'roms/arcade/galaga.zip')
check('arcade zip is hashed by name', await hashMod.hashForPlan(hashMod.sourceFromBytes(new Uint8Array()), 'roms/arcade/galaga.zip', arcadePlan), { hash: ref(text('galaga')) })
const seven = new Uint8Array([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c, 0, 0])
check('7z is explained', (await hashMod.hashForPlan(hashMod.sourceFromBytes(seven), 'game.7z', plan)).reason.includes('7z'), true)

console.log('account and card')
check('no account, no badge', model.achievementBadge('game-1'), '')
model.setRaAccount({ username: 'Scout', key: 'secret-key', points: 10, softcore: 2, rank: 4, totalRanked: 100, pic: '/UserPic/Scout.png' })
check('account round trip', model.getRaAccount().username, 'Scout')
check('key stays on the account', model.getRaAccount().key, 'secret-key')
model.setRaLink('game-1', { fileKey: 'a:1', hash: 'ab', raId: 9, at: Date.now() })
model.rememberProgress({
  id: 9, title: 'Demo', consoleName: 'NES', icon: '', points: 5, earned: 5, total: 5, hardcore: 5, earnedPoints: 5, award: 'Mastered', achievements: [],
})
check('mastered badge', model.achievementBadge('game-1'), 'Mastered')
model.rememberProgress({
  id: 9, title: 'Demo', consoleName: 'NES', icon: '', points: 10, earned: 3, total: 10, hardcore: 0, earnedPoints: 4, award: 'Beaten', achievements: [],
})
check('beaten badge', model.achievementBadge('game-1'), 'Beaten')
check('beaten title', model.achievementBadgeTitle('game-1'), 'Beaten on RetroAchievements')
model.forgetRaGames(['game-1'])
check('removed game drops its match', model.getRaLink('game-1'), null)
model.setRaLink('game-1', { fileKey: 'a:1', hash: 'ab', raId: 9, at: Date.now() })
model.rememberProgress({
  id: 9, title: 'Demo', consoleName: 'NES', icon: '', points: 5, earned: 5, total: 5, hardcore: 5, earnedPoints: 5, award: 'Mastered', achievements: [],
})
check('badge title', model.achievementBadgeTitle('game-1'), 'Mastered on RetroAchievements')
model.clearRaAccount()
check('disconnect hides the badge', model.achievementBadge('game-1'), '')
check('disconnect drops the key', model.getRaAccount(), null)

const progress = model.parseProgress({
  ID: 1446,
  Title: 'Super <Mario>',
  ConsoleName: 'NES',
  NumAchievements: 2,
  Points: 8,
  Achievements: {
    2: { ID: 2, Title: 'Later', Description: 'Second', Points: 5, BadgeName: 'abc', DisplayOrder: 2 },
    1: { ID: 1, Title: '<script>', Description: 'First & done', Points: 3, BadgeName: 'bad name', DisplayOrder: 1, DateEarned: '2016-03-12 17:47:29', DateEarnedHardcore: '2016-03-12 17:47:29', type: 'win_condition' },
  },
})
check('progress sorts and counts', [progress.earned, progress.hardcore, progress.achievements[0].title, progress.earnedPoints], [1, 1, '<script>', 3])
check('date', model.formatRaDate(progress.achievements[0].earned), 'Mar 12, 2016')
const collapsed = model.achievementCardHtml({ state: 'ready', message: 'Matched', progress })
check('card starts as a summary', collapsed.includes('Show achievements') && !collapsed.includes('&lt;script&gt;'), true)
check('ready card can be checked again', collapsed.includes('id="ro-ra-retry"'), true)
check('set link waits until the list is open', collapsed.includes('retroachievements.org/game/'), false)
const html = model.achievementCardHtml({ state: 'ready', message: 'Matched', progress }, 2)
check('open list links to the set', html.includes('retroachievements.org/game/1446'), true)
check('card escapes the title', html.includes('&lt;script&gt;'), true)
check('card drops an unsafe badge name', html.includes('badname') || !html.includes('bad name'), true)
check('card does not include a raw script tag', html.includes('<script>'), false)
check('profile rejects a different user', model.parseProfile({ User: 'Other', TotalPoints: 1 }, 'Scout'), null)
check('profile accepts the signed-in user', model.parseProfile({ User: 'Scout', TotalPoints: 12, Rank: 3 }, 'scout').points, 12)
check('image urls stay on RetroAchievements', model.raImageUrl('javascript:alert(1)'), '')
check('image icon path is allowed', model.raImageUrl('/Images/000010.png'), 'https://media.retroachievements.org/Images/000010.png')
check('401 message', model.raFailureMessage(401, { message: 'Unauthenticated.' }), 'RetroAchievements didn’t accept that web API key.')
const hardcoreOnly = model.parseProgress({
  ID: 8,
  Title: 'Hardcore only',
  NumAchievements: 1,
  Achievements: { 1: { ID: 1, Title: 'Clear', Points: 5, BadgeName: 'a', DisplayOrder: 1, DateEarnedHardcore: '2020-01-02 00:00:00' } },
})
check('hardcore date counts as earned', [hardcoreOnly.achievements[0].earned, hardcoreOnly.achievements[0].hardcore, hardcoreOnly.earned, hardcoreOnly.earnedPoints], ['2020-01-02 00:00:00', true, 1, 5])
const beaten = model.achievementCardHtml({
  state: 'ready',
  message: 'Matched',
  progress: { ...progress, award: 'Beaten', earned: 1, total: 2, hardcore: 0 },
})
check('beaten shows before the set is complete', beaten.includes('Beaten'), true)
check('game list keeps real hashes only', model.parseGameList([{ ID: 4, Title: 'Demo', Hashes: ['abcd', '0123456789abcdef0123456789abcdef'] }])[0].hashes, ['0123456789abcdef0123456789abcdef'])

function hashRom(data, kind) {
  return hashMod.hashRomBytes(data, kind)
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
