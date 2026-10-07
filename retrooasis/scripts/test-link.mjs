// Linked handheld sessions on the real built cores, with original fixture cartridges.
// Requires `npm run oasis:lan:link` once; skips (exit 0) when the cores are not built.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { inspectLink, linkRoot } from './lan-link.mjs'
import { createLinkSession, cartridgeInfo, gbaLinkMode, validSaveSize, describeGbaLink, saveSettler } from '../public/link-session.js'
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
assert.deepEqual(describeGbaLink([3, 3]), { label: 'Pokémon link cable', warning: null })
assert.match(describeGbaLink([6, 3], ['Puzzle', 'Ruby']).warning, /^Puzzle has no link support/, 'Games without a gpSP link mode are named')
assert.match(describeGbaLink([2, 4]).warning, /different link modes/, 'Mismatched link modes are reported')
{
  // Automatic save sync reports each in-game save once, after it stops changing.
  const settle = saveSettler(Uint8Array.of(1, 1))
  assert.equal(settle(Uint8Array.of(1, 1)), false, 'The starting save is not reported')
  assert.equal(settle(Uint8Array.of(2, 1)), false, 'A save still being written is not reported')
  assert.equal(settle(Uint8Array.of(2, 2)), false, 'A changing save is not reported')
  assert.equal(settle(Uint8Array.of(2, 2)), true, 'A settled new save is reported')
  assert.equal(settle(Uint8Array.of(2, 2)), false, 'The same save is reported only once')
  assert.equal(settle(null), false, 'A cartridge without a save is never reported')
  assert.equal(settle(Uint8Array.of(1, 1)), false)
  assert.equal(settle(Uint8Array.of(1, 1)), true, 'Saving back to the original bytes is still a new save')
  const fresh = saveSettler(null)
  assert.equal(fresh(Uint8Array.of(9)), false)
  assert.equal(fresh(Uint8Array.of(9)), true, 'A session without a starting save reports its first save')
  // Clock carts (Pokémon Gold/Silver/Crystal): the RTC footer after cartridge RAM ticks every second.
  const clock = saveSettler(Uint8Array.of(1, 1, 0), 2)
  assert.equal(clock(Uint8Array.of(2, 2, 1)), false)
  assert.equal(clock(Uint8Array.of(2, 2, 2)), true, 'A ticking clock footer does not stop a RAM save from settling')
  assert.equal(clock(Uint8Array.of(2, 2, 3)), false, 'A clock tick alone is not a new save')
}
console.log('PASS link cartridge validation, save sizes, GBA protocol selection and save-sync settling')
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
  const settlers = [0, 1].map(slot => saveSettler(gb.exportSave(slot)))
  const synced = [[], []]
  for (let ms = 0; ms < 16000; ms += 16) {
    gb.advance(16)
    samples += gb.audio(0).length + gb.audio(1).length
    // The host page samples both saves every 3 seconds.
    if (ms % 3008 === 0) for (const slot of [0, 1]) { const bytes = gb.exportSave(slot); if (settlers[slot](bytes)) synced[slot].push(bytes) }
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
  for (const slot of [0, 1]) assert.deepEqual(synced[slot], [saves[slot]], `Console ${slot + 1}’s in-game save is synced once, with its final bytes`)
  gb.setPaused(true); gb.advance(1000); gb.setPaused(false)
} finally { gb.close() }
console.log('PASS GB ↔ GBC link session: real boot ROMs, 64-byte cable exchange, per-console saves and save sync, video and audio')

// Clock cart (MBC3 + timer + RAM + battery, like Pokémon Gold/Silver/Crystal): the battery
// export ends with an RTC footer that ticks, so save sync compares cartridge RAM only.
{
  const clockCart = cart => { const rom = new Uint8Array(cart); rom[0x147] = 0x10; rom[0x149] = 0x03; return withGbHeader(rom, 'CLOCK CART') }
  const rtc = await createLinkSession({ system: 'gb', carts: [clockCart(carts[0]), clockCart(carts[1])], saves: [null, null], loadCore, loadFile })
  try {
    const ram = rtc.saveRamSize(0)
    const first = rtc.exportSave(0)
    assert.equal(ram, 32768, 'saveRamSize reports the cartridge RAM')
    assert(first.length > ram, 'A clock cart’s battery export carries an RTC footer after its RAM')
    rtc.advance(1100)
    await new Promise(resolve => setTimeout(resolve, 1100))
    const later = rtc.exportSave(0)
    assert(!first.every((byte, index) => byte === later[index]), 'The RTC footer changes between exports')
    const settle = saveSettler(first, ram)
    assert.equal(settle(later), false, 'Clock ticks alone are not reported as a save')
  } finally { rtc.close() }
}
console.log('PASS clock carts: save sync compares cartridge RAM, not the ticking RTC footer')

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
// gpSP resolves the link from each game's code; the host is told which, or warned.
for (const [codes, expected] of [[['AXVE', 'AXPE'], 'Pokémon link cable'], [['BPRE', 'BPEE'], 'Pokémon link cable'], [['AWRE', 'AWRE'], 'Advance Wars link cable'], [['RTST', 'RTST'], null]]) {
  const session = await createLinkSession({ system: 'gba', carts: codes.map((code, i) => gbaCartridge(`G${i}`, code)), loadCore, loadFile })
  try {
    assert.equal(session.link.label, expected, `${codes.join(' + ')} link: ${expected ?? 'unsupported'}`)
    if (!expected) assert.match(session.link.warning, /no link support/)
  } finally { session.close() }
}
console.log('PASS GBA link mode detection: Pokémon and Advance Wars cables, unsupported-game warning')
