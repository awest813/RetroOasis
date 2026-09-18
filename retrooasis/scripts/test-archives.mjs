#!/usr/bin/env node
/**
 * Fixture tests for src/lib/archives.ts — run from retrooasis/:
 *   node scripts/test-archives.mjs
 *
 * Uses Node's native TypeScript type-stripping (Node >= 22.18); import
 * specifiers are rewritten to explicit .ts paths in a cache dir first.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const srcDir = path.resolve(here, '..', 'src', 'lib')
const cacheDir = path.join(here, '.archives-test-cache')

fs.rmSync(cacheDir, { recursive: true, force: true })
fs.mkdirSync(cacheDir, { recursive: true })

for (const name of ['archives.ts', 'cores.ts', 'store.ts', 'iso.ts']) {
  let source = fs.readFileSync(path.join(srcDir, name), 'utf8')
  source = source.replace(/from '\.\/cores'/g, "from './cores.ts'")
  source = source.replace(/from '\.\/store'/g, "from './store.ts'")
  source = source.replace(/from '\.\/iso'/g, "from './iso.ts'")
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

const { peekArchive, platformFromArchiveEntries, detectRomPlatform, archiveFormatFromBytes } =
  await import(`file://${path.join(cacheDir, 'archives.ts').replace(/\\/g, '/')}`)

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

// ---------------------------------------------------------------- fixtures

function u8(...bytes) {
  return Uint8Array.from(bytes)
}
function utf16le(str) {
  const out = new Uint8Array(str.length * 2)
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i)
    out[i * 2] = code & 0xff
    out[i * 2 + 1] = code >> 8
  }
  return out
}
function concat(...parts) {
  const total = parts.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(total)
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}
/** Little-endian writers. */
function u16(v) {
  return u8(v & 0xff, (v >> 8) & 0xff)
}
function u32(v) {
  return u8(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff)
}
function u64(v) {
  const lo = u32(v % 0x100000000)
  const hi = u32(Math.floor(v / 0x100000000))
  return concat(lo, hi)
}
function vint(v) {
  const bytes = []
  let value = v
  for (;;) {
    let byte = value % 128
    value = Math.floor(value / 128)
    if (value > 0) byte += 128
    bytes.push(byte)
    if (value === 0) break
  }
  return u8(...bytes)
}
function ascii(str) {
  return Uint8Array.from(str, (c) => c.charCodeAt(0))
}

/** Real-layout ZIP with local headers + central directory + EOCD. */
function makeZip(names) {
  const enc = new TextEncoder()
  const locals = []
  const centrals = []
  let offset = 0
  for (const name of names) {
    const nameBytes = enc.encode(name)
    const local = concat(
      ascii('PK\x03\x04'),
      u16(20), u16(0), u16(0), u16(0), u16(0), u32(0),
      u32(nameBytes.length), u32(nameBytes.length), u16(nameBytes.length), u16(0),
      nameBytes,
    )
    locals.push(local)
    const central = concat(
      ascii('PK\x01\x02'),
      u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(0),
      u32(nameBytes.length), u32(nameBytes.length), u16(nameBytes.length),
      u16(0), // extra len
      u16(0), // comment len
      u16(0), // disk start
      u16(0), // internal attrs
      u32(0), // external attrs
      u32(offset), // local header offset
      nameBytes,
    )
    centrals.push({ central, offset })
    offset += local.length
  }
  const cdStart = offset
  const cdBytes = centrals.map((c) => c.central)
  const cdSize = cdBytes.reduce((n, c) => n + c.length, 0)
  const eocd = concat(
    ascii('PK\x05\x06'),
    u16(0), u16(0), u16(names.length), u16(names.length),
    u32(cdSize), u32(cdStart), u16(0),
  )
  return concat(...locals, ...cdBytes, eocd)
}

/** RAR5 with N file headers (layout per the RAR 5.0 spec). */
function makeRar5(names) {
  const enc = new TextEncoder()
  const blocks = []
  for (const name of names) {
    const nameBytes = enc.encode(name)
    const body = concat(
      vint(0), // file flags
      vint(1000), // unpacked size
      vint(0x20), // attributes
      vint(0x14), // compression info
      vint(3), // host os
      vint(nameBytes.length),
      nameBytes,
    )
    // headerSize counts from the HeaderSize field: itself + type + flags + body.
    let headerSize = body.length + 2 // type + flags vints (1 byte each)
    while (vint(headerSize).length + body.length + 2 !== headerSize) {
      headerSize = vint(headerSize).length + body.length + 2
    }
    const block = concat(u32(0xdeadbeef), vint(headerSize), vint(2), vint(0), body)
    blocks.push(block)
  }
  const main = concat(u32(1), vint(3), vint(1), vint(0)) // main archive header
  return concat(ascii('Rar!\x1a\x07\x01\x00'), main, ...blocks)
}

/** RAR4 with N file headers (LHD layout). */
function makeRar4(names) {
  const enc = new TextEncoder()
  const blocks = []
  for (const name of names) {
    const nameBytes = enc.encode(name)
    const size = 32 + nameBytes.length
    const head = concat(
      u16(0), // crc
      u8(0x74),
      u16(0x9020), // long block, no LHD_LARGE
      u16(size),
      u32(500), // pack size
      u32(1000), // unpack size
      u8(3), // host os
      u32(0), // file crc
      u32(0), // ftime
      u8(29), // unp ver
      u8(0x30), // method
      u16(nameBytes.length),
      u32(0x20), // attr
    )
    blocks.push(concat(head, nameBytes))
  }
  // Main archive header: crc(2) type(0x73) flags(2) size(2) + HighPosAv(2) + PosAv(4).
  const main = concat(u16(0), u8(0x73), u16(0), u16(13), u16(0), u32(0))
  return concat(ascii('Rar!\x1a\x07\x00'), main, ...blocks)
}

/** 7z with a plain (uncompressed) header holding N file names. */
function make7zPlain(names) {
  const namesBlob = concat(...names.map((n) => concat(utf16le(n), u8(0, 0))))
  const filesInfo = concat(
    vint(0x05), // kFilesInfo property
    vint(names.length),
    vint(0x11), // kName
    vint(1 + namesBlob.length), // external byte + names
    u8(0),
    namesBlob,
    u8(0), // kEnd of properties
  )
  const header = concat(u8(0x01), filesInfo) // kHeader
  const sig = concat(
    ascii('7z\xbc\xaf\x27\x1c'),
    u8(0, 4), // version
    u32(0), // start header crc (unchecked here)
    u64(0), // next header offset
    u64(header.length),
    u32(0), // next header crc
  )
  return concat(sig, header)
}

/** 7z with a plain header plus PackInfo/UnpackInfo CRC digests (exercises skipDigests). */
function make7zWithPackCrc(names, allDefined = true) {
  const namesBlob = concat(...names.map((n) => concat(utf16le(n), u8(0, 0))))
  const crcBlock = allDefined
    ? concat(u8(1), u32(0))
    : concat(u8(0), u8(0x80), u32(0)) // bit0 defined (MSB-first), then CRC
  const packInfo = concat(
    vint(0x06),
    vint(0),
    vint(1),
    vint(0x09),
    vint(10),
    vint(0x0a),
    crcBlock,
    vint(0),
  )
  const folder = concat(vint(1), u8(0x01), u8(0x00))
  const unpackInfo = concat(
    vint(0x07),
    vint(0x0b),
    vint(1),
    u8(0),
    folder,
    vint(0x0c),
    vint(10),
    vint(0x0a),
    crcBlock,
    vint(0),
  )
  const streams = concat(vint(0x04), packInfo, unpackInfo, vint(0))
  const filesInfo = concat(
    vint(0x05),
    vint(names.length),
    vint(0x11),
    vint(1 + namesBlob.length),
    u8(0),
    namesBlob,
    u8(0),
  )
  const header = concat(u8(0x01), streams, filesInfo)
  const sig = concat(
    ascii('7z\xbc\xaf\x27\x1c'),
    u8(0, 4),
    u32(0),
    u64(0),
    u64(header.length),
    u32(0),
  )
  return concat(sig, header)
}
function make7zEncoded() {
  const encoded = u8(0x17, 0x06, 0x00, 0x01, 0x02, 0x03, 0x04)
  const sig = concat(
    ascii('7z\xbc\xaf\x27\x1c'),
    u8(0, 4),
    u32(0),
    u64(0),
    u64(encoded.length),
    u32(0),
  )
  return concat(sig, encoded)
}

const toFile = (bytes, name) => new File([bytes], name)

// ------------------------------------------------------------------ tests

console.log('format sniffing')
check('zip magic', archiveFormatFromBytes(makeZip(['a.txt'])), 'zip')
check('rar4 magic', archiveFormatFromBytes(makeRar4(['x.bin'])), 'rar')
check('rar5 magic', archiveFormatFromBytes(makeRar5(['x.bin'])), 'rar')
check('7z magic', archiveFormatFromBytes(make7zPlain(['x.bin'])), '7z')
check('not archive', archiveFormatFromBytes(ascii('NES\x1a')), null)

console.log('zip listing')
{
  const blob = makeZip(['Metal Gear Solid (USA)/SLUS-00001.cue', 'Metal Gear Solid (USA)/SLUS-00001.bin', '__MACOSX/.hidden'])
  const peek = await peekArchive(toFile(blob, 'game.zip'))
  check('zip entry names', peek?.names, ['Metal Gear Solid (USA)/SLUS-00001.cue', 'Metal Gear Solid (USA)/SLUS-00001.bin', '__MACOSX/.hidden'])
  check('zip complete', peek?.complete, true)
}
check('psx from zip entries', platformFromArchiveEntries(['game/game.cue', 'game/game.bin', 'game/readme.nfo']), 'psx')
check('ecm rip detected as psx', platformFromArchiveEntries(['rip/game.bin.ecm', 'rip/notes.txt']), 'psx')
check('ccd dump detected as psx', platformFromArchiveEntries(['dump/game.ccd', 'dump/game.img']), 'psx')
check('psp vote for lone iso', platformFromArchiveEntries(['disc.iso', 'readme.txt']), 'psp')
check('system.cnf votes psx', platformFromArchiveEntries(['SYSTEM.CNF', 'SLUS_000.01']), 'psx')
check('umd data votes psp', platformFromArchiveEntries(['UMD_DATA.BIN', 'PSP_GAME/SYSDIR/EBOOT.BIN']), 'psp')
check('nested archive ignored', platformFromArchiveEntries(['pack.zip', 'pack.7z']), null)
check('empty votes', platformFromArchiveEntries(['notes.txt']), null)

console.log('rar listing')
{
  const peek5 = await peekArchive(toFile(makeRar5(['Gex (Europe).cue', 'Gex (Europe).bin', 'gex.nfo']), 'gex.rar'))
  check('rar5 names', peek5?.names, ['Gex (Europe).cue', 'Gex (Europe).bin', 'gex.nfo'])
  check('rar5 detects psx', peek5 ? platformFromArchiveEntries(peek5.names) : null, 'psx')

  const peek4 = await peekArchive(toFile(makeRar4(['Rayman (USA).img', 'Rayman.txt']), 'rayman.rar'))
  check('rar4 names', peek4?.names, ['Rayman (USA).img', 'Rayman.txt'])
  check('rar4 detects psx', peek4 ? platformFromArchiveEntries(peek4.names) : null, 'psx')
}

console.log('7z listing')
{
  const peekPlain = await peekArchive(
    toFile(make7zPlain(['Legend of Mana (USA)/SLUS-00870.bin', 'Legend of Mana (USA)/SLUS-00870.cue']), 'mana.7z'),
  )
  check('7z plain names', peekPlain?.names, ['Legend of Mana (USA)/SLUS-00870.bin', 'Legend of Mana (USA)/SLUS-00870.cue'])
  check('7z plain complete', peekPlain?.complete, true)

  const peekEncoded = await peekArchive(toFile(make7zEncoded(), 'big.7z'))
  // Worker fetch will fail offline / in node — must report incomplete, not throw.
  check('7z encoded reported', { c: peekEncoded?.complete, f: peekEncoded?.format }, { c: false, f: '7z' })

  const peekCrc = await peekArchive(toFile(make7zWithPackCrc(['disc/game.cue', 'disc/game.bin']), 'crc.7z'))
  check('7z pack crc names', peekCrc?.names, ['disc/game.cue', 'disc/game.bin'])
  check('7z pack crc complete', peekCrc?.complete, true)
  check('7z pack crc detects psx', peekCrc ? platformFromArchiveEntries(peekCrc.names) : null, 'psx')

  const peekCrcBits = await peekArchive(
    toFile(make7zWithPackCrc(['only/game.nes'], false), 'crc-bits.7z'),
  )
  check('7z digest bit-vector names', peekCrcBits?.names, ['only/game.nes'])
  check('7z digest bit-vector complete', peekCrcBits?.complete, true)
}

console.log('detectRomPlatform')
check('plain extension', await detectRomPlatform(toFile(u8(0x4e, 0x45, 0x53, 0x1a), 'Zelda.nes')), 'nes')
check('zip peeks to psx', await detectRomPlatform(toFile(makeZip(['mgs/mgs.cue', 'mgs/mgs.bin']), 'MGS.zip')), 'psx')
check('rar peeks to psx', await detectRomPlatform(toFile(makeRar5(['gb/Gex (Europe).cue']), 'gex.rar')), 'psx')
check('7z plain peeks to psx', await detectRomPlatform(toFile(make7zPlain(['d/d.cue', 'd/d.bin']), 'd.7z')), 'psx')
check('arcade zip stays arcade', await detectRomPlatform(toFile(makeZip(['mslug/fbneo.rom']), 'mslug.zip')), 'arcade')
check('unknown falls back', await detectRomPlatform(toFile(makeZip(['stuff.txt'], ), 'thing.zip')), 'arcade')
check('bare iso stays unknown', await detectRomPlatform(toFile(u8(0, 1, 2, 3), 'mystery.iso')), null)

function writeU32(buf, offset, value) {
  buf[offset] = value & 0xff
  buf[offset + 1] = (value >>> 8) & 0xff
  buf[offset + 2] = (value >>> 16) & 0xff
  buf[offset + 3] = (value >>> 24) & 0xff
}

function writeDirRecord(buf, offset, name, flags, lba, size) {
  const nameBytes = typeof name === 'number' ? Uint8Array.of(name) : new TextEncoder().encode(name)
  let recLen = 33 + nameBytes.length
  if (recLen % 2) recLen += 1
  buf[offset] = recLen
  writeU32(buf, offset + 2, lba)
  writeU32(buf, offset + 10, size)
  buf[offset + 25] = flags
  buf[offset + 32] = nameBytes.length
  buf.set(nameBytes, offset + 33)
  return recLen
}

function makeIso(names, volumeId = 'CDROM') {
  const SECTOR = 2048
  const buf = new Uint8Array(24 * SECTOR)
  const pvd = 16 * SECTOR
  buf[pvd] = 1
  buf.set([0x43, 0x44, 0x30, 0x30, 0x31], pvd + 1)
  buf[pvd + 6] = 1
  const vol = volumeId.toUpperCase().padEnd(32, ' ')
  for (let i = 0; i < 32; i++) buf[pvd + 40 + i] = vol.charCodeAt(i)
  const rootLba = 20
  buf[pvd + 156] = 34
  writeU32(buf, pvd + 158, rootLba)
  writeU32(buf, pvd + 166, SECTOR)
  buf[pvd + 181] = 2
  buf[pvd + 188] = 1
  buf[pvd + 189] = 0
  let p = rootLba * SECTOR
  p += writeDirRecord(buf, p, 0, 2, rootLba, SECTOR)
  p += writeDirRecord(buf, p, 1, 2, rootLba, SECTOR)
  for (const name of names) {
    const dir = name.endsWith('/')
    const leaf = dir ? name.slice(0, -1) : name
    p += writeDirRecord(buf, p, leaf, dir ? 2 : 0, 21, SECTOR)
  }
  return buf
}

check('iso system.cnf is psx', await detectRomPlatform(toFile(makeIso(['SYSTEM.CNF']), 'final.iso')), 'psx')
check('iso psp_game is psp', await detectRomPlatform(toFile(makeIso(['PSP_GAME/'], 'PSP GAME'), 'god.iso')), 'psp')
check('iso ip.bin is sega cd', await detectRomPlatform(toFile(makeIso(['IP.BIN']), 'sonic.iso')), 'segaCD')
check('iso volume playstation', await detectRomPlatform(toFile(makeIso(['README.TXT'], 'PLAYSTATION'), 'ps.iso')), 'psx')

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
