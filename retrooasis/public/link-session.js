/** Two linked handheld consoles in one browser: SameBoy (GB/GBC) or two gpSP
 * instances (GBA). Console 1 belongs to the host, Console 2 to the guest.
 * Works in browsers and Node (tests pass `loadCore`/`loadFile`). */
import { LINK_CAPABILITIES } from './lan-capabilities.js'

const GB_TICKS_PER_MS = 8388608 / 1000 // SameBoy GB_run reports 8 MHz ticks.
const GBA_FRAME_MS = 280896 * 1000 / 16777216
const GBA_SAVE_SIZES = [512, 8192, 32768, 65536, 131072]
// libretro joypad index → SameBoy GB_key_t (RIGHT, LEFT, UP, DOWN, A, B, SELECT, START)
const GB_KEYS = { 7: 0, 6: 1, 4: 2, 5: 3, 8: 4, 0: 5, 2: 6, 3: 7 }

const text = (bytes, start, end) => String.fromCharCode(...bytes.subarray(start, end)).replace(/[^\x20-\x7e]/g, '').trim()

/** Validates a cartridge for a link system; returns display details or throws a user-facing error. */
export function cartridgeInfo(system, bytes) {
  const profile = LINK_CAPABILITIES[system]
  if (!profile) throw new Error('This system has no link cable support.')
  if (!(bytes instanceof Uint8Array) || bytes.length > profile.maxRom) throw new Error('That file is too large for this system.')
  if (system === 'gb') {
    if (bytes.length < 0x8000 || bytes.length % 0x4000) throw new Error('That is not a Game Boy / Game Boy Color cartridge.')
    let check = 0
    for (let at = 0x134; at <= 0x14c; at++) check = (check - bytes[at] - 1) & 255
    if (check !== bytes[0x14d]) throw new Error('That Game Boy cartridge header is damaged.')
    const cgb = bytes[0x143]
    return { system, color: (cgb & 0x80) !== 0, title: text(bytes, 0x134, cgb & 0x80 ? 0x13f : 0x144) || 'Game Boy cartridge' }
  }
  if (bytes.length < 0xc0 || bytes[0xb2] !== 0x96) throw new Error('That is not a Game Boy Advance cartridge.')
  return { system, code: text(bytes, 0xac, 0xb0), title: text(bytes, 0xa0, 0xac) || 'GBA cartridge' }
}

/** gpSP link mode shared by both consoles. 0 = gpSP per-game choice, 1 = Pokémon cable. */
export function gbaLinkMode(codes) {
  // Ruby / Sapphire only trade by cable; FireRed, LeafGreen and Emerald then use it too.
  if (codes.some(code => /^AX[VP]/.test(code))) return 1
  return 0
}

export function validSaveSize(system, size) {
  return (system === 'gb' ? size > 0 && size <= 131072 + 48 : GBA_SAVE_SIZES.includes(size))
}

function copyIn(core, bytes) {
  const pointer = core._malloc(bytes.length)
  core.HEAPU8.set(bytes, pointer)
  return pointer
}

function loadGbConsoles(core, carts, saves, info, boots) {
  for (let slot = 0; slot < 2; slot++) {
    const boot = boots[info[slot].color ? 'cgb_boot.bin' : 'dmg_boot.bin']
    const rom = copyIn(core, carts[slot]), bootPointer = copyIn(core, boot)
    try { if (core._link_load(slot, rom, carts[slot].length, bootPointer, boot.length) !== 1) throw new Error(`Console ${slot + 1} could not load its cartridge.`) }
    finally { core._free(rom); core._free(bootPointer) }
    if (saves[slot]) {
      const size = core._link_save_size(slot)
      if (size <= 0) throw new Error(`${info[slot].title} has no battery save, so its save file can’t be used.`)
      const pointer = copyIn(core, saves[slot])
      try { if (core._link_restore(slot, pointer, saves[slot].length) !== 1) throw new Error(`Console ${slot + 1}’s save file doesn’t match its cartridge.`) }
      finally { core._free(pointer) }
    }
  }
}

async function gbSession({ carts, saves, loadCore, loadFile }) {
  const core = await loadCore('sameboy-link.mjs')
  const info = carts.map(cart => cartridgeInfo('gb', cart))
  const boots = {}
  for (const name of new Set(info.map(cart => cart.color ? 'cgb_boot.bin' : 'dmg_boot.bin'))) boots[name] = await loadFile(name)
  if (core._link_init_models(Number(info[0].color), Number(info[1].color)) !== 1) throw new Error('The link cable could not start.')
  try { loadGbConsoles(core, carts, saves, info, boots) } catch (error) { core._link_close(); throw error }
  const audioBuffer = core._malloc(4096 * 4)
  let budget = 0
  return {
    info, width: 160, height: 144, sampleRate: 48000,
    advance(ms) {
      budget = Math.min(budget + ms * GB_TICKS_PER_MS, 4 * 70224 * 2)
      // Small slices keep both consoles' serial clocks interleaved.
      while (budget >= 4096) budget -= core._link_step(4096) || budget
    },
    pixels(slot, target) {
      const pointer = core._link_pixels(slot)
      if (pointer) target.set(core.HEAPU8.subarray(pointer, pointer + 160 * 144 * 4))
    },
    audio(slot) {
      const frames = core._link_audio(slot, audioBuffer, 4096)
      return core.HEAP16.slice(audioBuffer / 2, audioBuffer / 2 + frames * 2)
    },
    key(slot, index, pressed) { if (GB_KEYS[index] !== undefined) core._link_key(slot, GB_KEYS[index], pressed ? 1 : 0) },
    setPaused(paused) { core._link_set_paused(paused ? 1 : 0); budget = 0 },
    exportSave(slot) {
      const size = core._link_save_size(slot)
      if (size <= 0) return null
      const pointer = core._malloc(size)
      try { return core._link_save(slot, pointer, size) >= 0 ? core.HEAPU8.slice(pointer, pointer + size) : null }
      finally { core._free(pointer) }
    },
    close() { core._link_close(); core._free(audioBuffer) },
  }
}

async function gbaSession({ carts, saves, loadCore }) {
  const info = carts.map(cart => cartridgeInfo('gba', cart))
  const mode = gbaLinkMode(info.map(cart => cart.code))
  const inbox = [[], []], cores = []
  const keys = [0, 0]
  const drain = id => {
    for (const { bytes, sender } of inbox[id].splice(0)) {
      const pointer = copyIn(cores[id], bytes)
      try { cores[id]._gba_receive(pointer, bytes.length, sender) } finally { cores[id]._free(pointer) }
    }
  }
  try {
    for (let id = 0; id < 2; id++) {
      const core = await loadCore('gpsp-link.mjs', {
        onPoll: () => drain(id),
        onPacket: (_flags, bytes, target) => {
          // Bounded queue: a stalled peer must not grow memory without limit.
          if ((target === 65535 || target === 1 - id) && bytes.length <= 65536 && inbox[1 - id].length < 1024) inbox[1 - id].push({ bytes, sender: id })
        },
      })
      cores.push(core)
      if (core._gba_init() !== 1) throw new Error('The GBA link interface is unavailable.')
      core.FS.writeFile('/cartridge.gba', carts[id])
      if (core.cwrap('gba_load', 'number', ['string', 'number'])('/cartridge.gba', mode) !== 1) throw new Error(`Console ${id + 1} could not load its cartridge.`)
      if (saves[id]) {
        const pointer = copyIn(core, saves[id])
        try { if (core._gba_restore(pointer, saves[id].length) !== 1) throw new Error(`Console ${id + 1}’s save file doesn’t match a GBA save size.`) }
        finally { core._free(pointer) }
      }
      if (core._gba_start(id) !== 1) throw new Error('The GBA link cable could not start.')
    }
    if (cores[0]._gba_connect(1) !== 1 || cores[1]._gba_connect(0) !== 1) throw new Error('The GBA link cable could not connect.')
  } catch (error) { cores.forEach(core => core._gba_close()); throw error }
  const audioBuffers = cores.map(core => core._malloc(4096 * 4))
  let elapsed = 0
  return {
    info, mode, width: 240, height: 160, sampleRate: cores[0]._gba_sample_rate(),
    advance(ms) {
      elapsed = Math.min(elapsed + ms, GBA_FRAME_MS * 4)
      while (elapsed >= GBA_FRAME_MS) {
        elapsed -= GBA_FRAME_MS
        for (let id = 0; id < 2; id++) { drain(id); cores[id]._gba_run() }
      }
    },
    pixels(slot, target) {
      const core = cores[slot], pointer = core._gba_pixels() / 2
      const source = core.HEAPU16.subarray(pointer, pointer + 240 * 160)
      for (let i = 0; i < source.length; i++) {
        const pixel = source[i], at = i * 4
        target[at] = (pixel >> 11) * 255 / 31; target[at + 1] = ((pixel >> 5) & 63) * 255 / 63; target[at + 2] = (pixel & 31) * 255 / 31; target[at + 3] = 255
      }
    },
    audio(slot) {
      const core = cores[slot], pointer = audioBuffers[slot]
      const frames = core._gba_audio(pointer, 4096)
      return core.HEAP16.slice(pointer / 2, pointer / 2 + frames * 2)
    },
    key(slot, index, pressed) {
      if (index < 0 || index > 15) return
      keys[slot] = pressed ? keys[slot] | (1 << index) : keys[slot] & ~(1 << index)
      cores[slot]._gba_key(index, pressed ? 1 : 0)
    },
    setPaused(paused) { cores.forEach(core => core._gba_set_paused(paused ? 1 : 0)); keys.fill(0); elapsed = 0 },
    exportSave(slot) {
      const core = cores[slot], size = core._gba_save_size()
      if (size <= 0) return null
      const pointer = core._gba_save_data()
      return core.HEAPU8.slice(pointer, pointer + size)
    },
    close() { cores.forEach((core, id) => { core._free(audioBuffers[id]); core._gba_close() }) },
  }
}

/** carts / saves: [host, guest] Uint8Arrays (saves may be null). */
export async function createLinkSession({ system, carts, saves = [null, null], loadCore, loadFile }) {
  if (!LINK_CAPABILITIES[system] || carts?.length !== 2) throw new Error('Choose two cartridges for this link session.')
  saves.forEach((save, slot) => {
    if (save && !validSaveSize(system, save.length)) throw new Error(`Console ${slot + 1}’s save file is not a ${system === 'gb' ? 'Game Boy' : 'GBA'} save.`)
  })
  return system === 'gb' ? gbSession({ carts, saves, loadCore, loadFile }) : gbaSession({ carts, saves, loadCore })
}
