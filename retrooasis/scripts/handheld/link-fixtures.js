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
export function blockCartridge(slot, color, { fast = false, count = 64, reverse = true } = {}) {
  if (![0, 1].includes(slot) || count < 1 || count > 128 || !Number.isInteger(count) || (fast && !color)) throw Error('Invalid fixture')
  const rom = cartridge(slot === 0, color)
  const code = [0xf3, 0x3e, 0x0a, 0xea, 0, 0, 0x21, 0, 0xc0, 0x11, 0, 0xa0]
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
