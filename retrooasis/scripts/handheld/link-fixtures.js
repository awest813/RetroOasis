// Original test cartridges and boot stub; no commercial ROM or BIOS data.
export function cartridge(master, color) {
  const rom = new Uint8Array(32768)
  rom.set([0xc3, 0x50, 0x01], 0x100)
  rom[0x143] = color ? 0x80 : 0
  rom[0x147] = 0x03; rom[0x149] = 0x02 // MBC1 + RAM + battery, 8 KB
  rom.set([0xf3, 0x3e, 0x0a, 0xea, 0x00, 0x00, 0x3e, master ? 0xa5 : 0x5a, 0xe0, 0x01, 0x3e, master ? 0x81 : 0x80, 0xe0, 0x02,
    0xf0, 0x02, 0xcb, 0x7f, 0x20, 0xfa, 0xf0, 0x01, 0xea, 0x00, 0xc0,
    0x3e, master ? 0x11 : 0x22, 0xea, 0x00, 0xa0, 0x18, 0xfe], 0x150)
  return rom
}
export const boot = new Uint8Array(256)
boot.set([0xc3, 0xfc, 0x00]); boot.set([0x3e, 0x01, 0xe0, 0x50], 0xfc)

export const transferByte = (slot, index) => (index * (slot ? 29 : 17) + (slot ? 0xc3 : 0x25)) & 255

// A repeated block transfer exercises the cable clocks rather than sharing
// memory between consoles. Clock ownership reverses halfway through the block.
// wait: busy-loop units (~1 s each) before the first transfer, so a console with a
// shorter boot ROM (DMG) cannot start clocking before a CGB partner is armed.
export function blockCartridge(slot, color, { fast = false, count = 64, reverse = true, wait = 0 } = {}) {
  if (!Number.isInteger(wait) || wait < 0 || wait > 255 || ![0, 1].includes(slot) || count < 1 || count > 128 || !Number.isInteger(count) || (fast && !color)) throw Error('Invalid fixture')
  const rom = cartridge(slot === 0, color)
  const code = [0xf3, ...(wait ? [0x16, wait, 0x01, 0, 0, 0x0b, 0x78, 0xb1, 0x20, 0xfb, 0x15, 0x20, 0xf5] : []), 0x3e, 0x0a, 0xea, 0, 0, 0x21, 0, 0xc0, 0x11, 0, 0xa0]
  for (let index = 0; index < count; index++) {
    const master = slot === (reverse && index >= count / 2 ? 1 : 0)
    code.push(0x3e, transferByte(slot, index), 0xe0, 1)
    // Give the external-clock console time to arm before each transfer.
    if (master) code.push(0x01, 0, 2, 0x0b, 0x78, 0xb1, 0x20, 0xfb)
    code.push(0x3e, 0x80 | Number(master) | (fast ? 2 : 0), 0xe0, 2,
      0xf0, 2, 0xcb, 0x7f, 0x20, 0xfa, 0xf0, 1, 0x22, 0x12, 0x13)
  }
  code.push(0x3e, 1, 0xea, 0, 0xc1, 0x18, 0xfe)
  rom.set(code, 0x150)
  return rom
}

/** Adds a title and valid header checksum so the cartridge passes library validation. */
export function withGbHeader(rom, title = 'LINKTEST') {
  for (let i = 0; i < 11; i++) rom[0x134 + i] = i < title.length ? title.charCodeAt(i) : 0
  let check = 0
  for (let at = 0x134; at <= 0x14c; at++) check = (check - rom[at] - 1) & 255
  rom[0x14d] = check
  return rom
}

// Original ARMv4 test program (assembled from the source below; no BIOS or game code):
//   mov r0,#0x04000000; mov r1,#0x403 → DISPCNT (mode 3, BG2); first VRAM pixel = red
//   SRAM[0]++ (boot counter); loop { SRAM[1] = KEYINPUT & 0xff }
const GBA_PROGRAM = [0xe3a00301, 0xe3a01b01, 0xe2811003, 0xe1c010b0, 0xe3a00406, 0xe3a0101f, 0xe1c010b0, 0xe3a0040e,
  0xe5d02000, 0xe2822001, 0xe5c02000, 0xe3a04301, 0xe2844e13, 0xe1d430b0, 0xe5c03001, 0xeafffffc]
export function gbaCartridge(title = 'LINKTEST', code = 'RTST') {
  const rom = new Uint8Array(0x10000)
  const view = new DataView(rom.buffer)
  view.setUint32(0, 0xea00002e, true) // b 0x080000c0
  for (let i = 0; i < 12; i++) rom[0xa0 + i] = i < title.length ? title.charCodeAt(i) : 0
  for (let i = 0; i < 4; i++) rom[0xac + i] = code.charCodeAt(i)
  rom[0xb2] = 0x96
  let check = 0
  for (let at = 0xa0; at <= 0xbc; at++) check = (check - rom[at]) & 255
  rom[0xbd] = (check - 0x19) & 255
  GBA_PROGRAM.forEach((word, index) => view.setUint32(0xc0 + index * 4, word, true))
  // Backup-type signature, as the official SDK embeds it.
  ;[...'SRAM_V113'].forEach((char, index) => { rom[0x200 + index] = char.charCodeAt(0) })
  return rom
}
