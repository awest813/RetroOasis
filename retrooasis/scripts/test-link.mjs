// Linked handheld sessions on the real built cores, with original fixture cartridges.
// Requires `npm run oasis:lan:link` once; skips (exit 0) when the cores are not built.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { inspectLink, linkRoot } from './lan-link.mjs'
import { createLinkSession, cartridgeInfo, gbaLinkMode, validSaveSize } from '../public/link-session.js'
import { blockCartridge, withGbHeader, transferByte, gbaCartridge } from './handheld/link-fixtures.js'
import { sendFile, fileReceiver, saveName, CHUNK, SAVE_LIMIT } from '../public/link-transfer.js'
import { unwrapRom } from '../public/rom-source.js'
import { librarySaveKey } from '../public/library-saves.js'
import { deflateRawSync } from 'node:zlib'

// Pure checks run everywhere.
assert.throws(() => cartridgeInfo('gb', new Uint8Array(0x8000)), /header is damaged/)
assert.throws(() => cartridgeInfo('gb', new Uint8Array(100)), /not a Game Boy/)
assert.throws(() => cartridgeInfo('gba', new Uint8Array(0x8000)), /not a Game Boy Advance/)
assert.throws(() => cartridgeInfo('psp', new Uint8Array(10)), /no link cable/)
assert.deepEqual(cartridgeInfo('gb', withGbHeader(blockCartridge(1, 1), 'TRADE')), { system: 'gb', color: true, title: 'TRADE' })
assert.equal(cartridgeInfo('gba', gbaCartridge('POKEMON RUBY', 'AXVE')).code, 'AXVE')
assert.equal(gbaLinkMode(['AXVE', 'BPRE']), 1, 'Ruby/Sapphire force the Pokémon cable protocol on both consoles')
assert.equal(gbaLinkMode(['BPRE', 'BPGE']), 0, 'FireRed/LeafGreen keep gpSP’s per-game choice')
assert(validSaveSize('gba', 131072) && !validSaveSize('gba', 1000))
assert(validSaveSize('gb', 32768 + 48) && !validSaveSize('gb', 0))
await assert.rejects(createLinkSession({ system: 'gb', carts: [new Uint8Array(1)] }), /two cartridges/)
await assert.rejects(createLinkSession({ system: 'gba', carts: [gbaCartridge(), gbaCartridge()], saves: [new Uint8Array(1000), null] }), /not a GBA save/)
// Cartridge/save transfer framing over the 'cart' data channel.
const sent = []
const channel = { readyState: 'open', bufferedAmount: 0, send: data => sent.push(data), addEventListener() {}, removeEventListener() {} }
const rom = new Uint8Array(CHUNK * 2 + 5).map((_, index) => index & 255)
await sendFile(channel, 'rom', 'Red.gb', rom)
assert.equal(sent.length, 4, 'Header plus three chunks')
const received = [], errors = [], messages = []
const receive = fileReceiver({ limits: { rom: rom.length, save: SAVE_LIMIT }, onFile: file => received.push(file), onError: error => errors.push(error.message), onMessage: data => messages.push(data.type) })
sent.forEach(data => receive(data))
assert.deepEqual(received[0].bytes, rom); assert.equal(received[0].name, 'Red.gb')
receive(JSON.stringify({ type: 'request-save' })); assert.deepEqual(messages, ['request-save'])
receive(JSON.stringify({ type: 'file', kind: 'rom', name: 'big', size: rom.length + 1 })); assert.match(errors.at(-1), /too large/)
receive(JSON.stringify({ type: 'file', kind: 'bios', name: 'x', size: 1 })); assert.match(errors.at(-1), /not allowed/)
receive(new Uint8Array(4).buffer); assert.match(errors.at(-1), /Unexpected file data/)
receive(JSON.stringify({ type: 'file', kind: 'save', name: 's.sav', size: 2 })); receive(new Uint8Array(3).buffer); assert.match(errors.at(-1), /larger than announced/)
receive(JSON.stringify({ type: 'file', kind: 'save', name: 's.sav', size: 2 })); receive(JSON.stringify({ type: 'file', kind: 'save', name: 's.sav', size: 2 })); assert.match(errors.at(-1), /interrupted/)
receive('x'.repeat(3000)); assert.match(errors.at(-1), /Unexpected link message/)
assert.equal(saveName('Pokemon - Red (USA).gb'), 'Pokemon - Red (USA).sav'); assert.equal(saveName('a/b:c.gba'), 'a_b_c.sav')
await assert.rejects(sendFile({ ...channel, readyState: 'closed' }, 'rom', 'x', rom), /closed/)
assert.equal(librarySaveKey('Pokemon - Crystal (USA).gbc'), '/data/saves/Pokemon - Crystal (USA).srm', 'Library saves use RetroArch’s ROM-stem .srm name')
assert.equal(librarySaveKey('dir/Game.v1.gba'), '/data/saves/Game.v1.srm'); assert.equal(librarySaveKey(''), null)
console.log('PASS link cartridge validation, save sizes and GBA protocol selection')
console.log('PASS cartridge / save transfer framing, limits and interruption handling')

// Zipped ROMs (stored and deflated) unwrap to the single ROM inside.
function zip(entries) {
  const locals = [], centrals = []
  let offset = 0
  for (const { name, bytes, deflate } of entries) {
    const data = deflate ? deflateRawSync(bytes) : bytes, nameBytes = Buffer.from(name)
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(deflate ? 8 : 0, 8)
    local.writeUInt32LE(data.length, 18); local.writeUInt32LE(bytes.length, 22); local.writeUInt16LE(nameBytes.length, 26)
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(deflate ? 8 : 0, 10)
    central.writeUInt32LE(data.length, 20); central.writeUInt32LE(bytes.length, 24); central.writeUInt16LE(nameBytes.length, 28); central.writeUInt32LE(offset, 42)
    locals.push(local, nameBytes, data); centrals.push(central, nameBytes)
    offset += 30 + nameBytes.length + data.length
  }
  const directory = Buffer.concat(centrals), end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16)
  return new Uint8Array(Buffer.concat([...locals, directory, end]))
}
const gbaRom = gbaCartridge('ZIPPED')
for (const deflate of [false, true]) {
  const unwrapped = await unwrapRom({ name: 'Game.zip', bytes: zip([{ name: 'readme.txt', bytes: Buffer.from('hi') }, { name: 'dir/Game.gba', bytes: gbaRom, deflate }]) })
  assert.equal(unwrapped.name, 'Game.gba'); assert.deepEqual(unwrapped.bytes, gbaRom)
}
await assert.rejects(unwrapRom({ name: 'Two.zip', bytes: zip([{ name: 'a.gb', bytes: gbaRom }, { name: 'b.gb', bytes: gbaRom }]) }), /several ROMs/)
await assert.rejects(unwrapRom({ name: 'None.zip', bytes: zip([{ name: 'a.txt', bytes: gbaRom }]) }), /no Game Boy/)
assert.equal((await unwrapRom({ name: 'Plain.gba', bytes: gbaRom })).bytes, gbaRom, 'Plain ROMs pass through')
console.log('PASS zipped ROM unwrapping (stored / deflated, nested names, ambiguous archives)')

if (!(await inspectLink()).ready) {
  console.log('SKIP linked-core sessions: build them once with npm run oasis:lan:link')
  process.exit(0)
}
const loadFile = async name => new Uint8Array(await fs.readFile(path.join(linkRoot, name)))
const loadCore = async (name, options = {}) => {
  const { default: create } = await import(pathToFileURL(path.join(linkRoot, name)).href)
  return create({ ...options, wasmBinary: await loadFile(name.replace('.mjs', '.wasm')) })
}

await assert.rejects(createLinkSession({ system: 'gb', carts: [withGbHeader(blockCartridge(0, 0)), withGbHeader(blockCartridge(1, 0))], saves: [new Uint8Array(100), null], loadCore, loadFile }), /doesn’t match its cartridge/, 'A save smaller than the cartridge RAM is refused')
// GB ↔ GBC on one cable through SameBoy's real boot ROMs; saves stay per console.
const carts = [withGbHeader(blockCartridge(0, 0, { wait: 6 }), 'HOST GB'), withGbHeader(blockCartridge(1, 1), 'GUEST GBC')]
const guestSave = new Uint8Array(8192).fill(0x5c)
const gb = await createLinkSession({ system: 'gb', carts, saves: [null, guestSave], loadCore, loadFile })
try {
  assert.deepEqual(gb.info.map(cart => cart.color), [false, true], 'Each console uses its cartridge’s hardware')
  const frame = new Uint8ClampedArray(160 * 144 * 4)
  let samples = 0
  for (let ms = 0; ms < 16000; ms += 16) {
    gb.advance(16)
    samples += gb.audio(0).length + gb.audio(1).length
  }
  gb.pixels(1, frame)
  assert(frame.some((value, index) => index % 4 === 3 && value === 255), 'Console 2 renders RGBA video')
  assert(samples > 0, 'Both consoles produce audio samples')
  const saves = [gb.exportSave(0), gb.exportSave(1)]
  for (let slot = 0; slot < 2; slot++) {
    for (let index = 0; index < 64; index++) assert.equal(saves[slot][index], transferByte(1 - slot, index), `Console ${slot + 1} saved byte ${index} received over the cable`)
  }
  assert.equal(saves[1][4096], 0x5c, 'The guest’s imported save survives the session')
  assert.equal(saves[0][4096], 0xff, 'The host console never sees the guest’s save')
  gb.setPaused(true); gb.advance(1000); gb.setPaused(false)
} finally { gb.close() }
console.log('PASS GB ↔ GBC link session: real boot ROMs, 64-byte cable exchange, per-console saves, video and audio')

// GBA: two isolated gpSP consoles, per-console input and SRAM save round trip.
const hostSave = new Uint8Array(32768).fill(0); hostSave[0] = 41
const gba = await createLinkSession({ system: 'gba', carts: [gbaCartridge('HOST'), gbaCartridge('GUEST')], saves: [hostSave, null], loadCore, loadFile })
try {
  gba.key(0, 8, true) // libretro A on the host console only
  for (let ms = 0; ms < 1000; ms += 16) gba.advance(16)
  const frame = new Uint8ClampedArray(240 * 160 * 4)
  gba.pixels(1, frame)
  assert.deepEqual([...frame.subarray(0, 4)], [255, 0, 0, 255], 'Console 2 draws its own red pixel')
  assert(gba.audio(0).length > 0, 'GBA audio is captured')
  const saves = [gba.exportSave(0), gba.exportSave(1)]
  assert.deepEqual(saves.map(save => save.length), [32768, 32768], 'SRAM saves export at their real size')
  assert.equal(saves[0][0], 42, 'The host’s imported save booted and was updated')
  assert.equal(saves[1][0], 0, 'The guest console started from a blank save')
  assert.equal(saves[0][1] & 1, 0, 'Host A press reached Console 1')
  assert.equal(saves[1][1] & 1, 1, 'Host input never reaches Console 2')
  gba.key(0, 8, false)
  gba.key(1, 8, true)
  for (let ms = 0; ms < 200; ms += 16) gba.advance(16)
  assert.equal(gba.exportSave(1)[1] & 1, 0, 'Guest A press reached Console 2')
  assert.equal(gba.exportSave(0)[1] & 1, 1, 'Host release was applied')
  gba.setPaused(true)
  gba.key(1, 8, true)
  gba.setPaused(false)
} finally { gba.close() }
console.log('PASS GBA link session: isolated consoles, per-console input, SRAM import/export, video and audio')
