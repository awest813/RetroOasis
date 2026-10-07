/** Shared by the browser, server and core preparation script. */
import { controllerButton, controllerAxis } from './controller-input.js'
export const LAN_PROTOCOL = 2
export const LAN_CAPABILITIES = Object.freeze({
  nes: { label: 'NES', mode: 'shared-console', maxPlayers: 2, cores: ['fceumm', 'nestopia'], buttons: [0, 2, 3, 4, 5, 6, 7, 8] },
  snes: { label: 'SNES', mode: 'shared-console', maxPlayers: 2, cores: ['snes9x', 'bsnes'], buttons: Array.from({ length: 12 }, (_, i) => i) },
  segaMD: { label: 'Mega Drive / Genesis', mode: 'shared-console', maxPlayers: 2, cores: ['genesis_plus_gx', 'genesis_plus_gx_wide', 'picodrive'], buttons: [0, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
  // PlayStation: the digital pad and all eight face/shoulder buttons, which is what
  // fighting games use (✕ □ ○ △, L1 R1, L2 R2), plus both analog sticks (dualAnalog) for
  // games that support a DualShock; the host's ports are set to DualShock in rooms.
  psx: { label: 'PlayStation', mode: 'shared-console', maxPlayers: 2, cores: ['pcsx_rearmed'], buttons: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13], dualAnalog: true },
  n64: { label: 'Nintendo 64 (experimental)', mode: 'shared-console', maxPlayers: 4, cores: ['mupen64plus_next', 'parallel_n64'], buttons: [0, 1, 3, 4, 5, 6, 7, 10, 11, 12, 20, 21, 22, 23], analog: true },
})
export const LAN_CORES = new Set(Object.keys(LAN_CAPABILITIES))
/** Handheld link rooms: the host browser runs both consoles on one emulated cable
 * and streams Console 2 to the guest. Each player brings a cartridge and save. */
export const LINK_CAPABILITIES = Object.freeze({
  gb: { label: 'Game Boy / Color link cable', mode: 'linked-consoles', maxPlayers: 2, cores: ['sameboy-link'], buttons: [0, 2, 3, 4, 5, 6, 7, 8], maxRom: 8 * 1024 * 1024 },
  gba: { label: 'Game Boy Advance link', mode: 'linked-consoles', maxPlayers: 2, cores: ['gpsp-link'], buttons: [0, 2, 3, 4, 5, 6, 7, 8, 10, 11], maxRom: 32 * 1024 * 1024 },
})
export const LINK_CORES = new Set(Object.keys(LINK_CAPABILITIES))
/** Every room input profile, streamed or linked. */
export const ROOM_PROFILES = Object.freeze({ ...LAN_CAPABILITIES, ...LINK_CAPABILITIES })
export const CORE_LABELS = Object.fromEntries(Object.entries(ROOM_PROFILES).map(([core, info]) => [core, info.label]))
export function inputIndices(core) {
  const profile = ROOM_PROFILES[core]
  return profile ? [...profile.buttons, ...(profile.analog || profile.dualAnalog ? [16, 17, 18, 19] : []), ...(profile.dualAnalog ? [20, 21, 22, 23] : [])] : []
}
export function normalizeStick(x = 0, y = 0, deadZone = 0.18) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return [0, 0]
  const magnitude = Math.hypot(x, y)
  if (magnitude <= deadZone) return [0, 0]
  const scale = Math.min(1, (magnitude - deadZone) / (1 - deadZone)) / magnitude
  return [Math.round(x * scale * 1000) / 1000, Math.round(y * scale * 1000) / 1000]
}

/** Standard browser layout → libretro inputs, restricted to the room's system. */
export function gamepadControls(pad, core) {
  const profile = ROOM_PROFILES[core]
  if (!pad || !profile) return { buttons: [], stick: [0, 0], stick2: [0, 0] }
  const map = profile.analog ? { 0: 0, 1: 1, 4: 10, 5: 11, 6: 12, 7: 12, 9: 3, 12: 4, 13: 5, 14: 6, 15: 7 }
    : { 0: 0, 1: 8, 2: 1, 3: 9, 4: 10, 5: 11, 6: 12, 7: 13, 8: 2, 9: 3, 12: 4, 13: 5, 14: 6, 15: 7 }
  const buttons = new Set()
  for (const [button, input] of Object.entries(map)) if (controllerButton(pad, button)) buttons.add(input)
  // PlayStation: both sticks stay analog (the D-pad buttons are the D-pad).
  if (profile.dualAnalog) return {
    buttons: [...buttons].filter(button => profile.buttons.includes(button)).sort((a, b) => a - b),
    stick: normalizeStick(controllerAxis(pad, 0), controllerAxis(pad, 1)),
    stick2: normalizeStick(controllerAxis(pad, 2), controllerAxis(pad, 3)),
  }
  const x = controllerAxis(pad, profile.analog ? 2 : 0), y = controllerAxis(pad, profile.analog ? 3 : 1)
  if (x < -0.5) buttons.add(profile.analog ? 21 : 6)
  if (x > 0.5) buttons.add(profile.analog ? 20 : 7)
  if (y < -0.5) buttons.add(profile.analog ? 23 : 4)
  if (y > 0.5) buttons.add(profile.analog ? 22 : 5)
  return {
    buttons: [...buttons].filter(button => profile.buttons.includes(button)).sort((a, b) => a - b),
    stick: profile.analog ? normalizeStick(controllerAxis(pad, 0), controllerAxis(pad, 1)) : [0, 0],
    stick2: [0, 0],
  }
}

/** On-screen button names per system, by libretro joypad index. */
export const BUTTON_LABELS = Object.freeze({
  nes: { 0: 'B', 8: 'A' },
  snes: { 0: 'B', 8: 'A', 1: 'Y', 9: 'X', 10: 'L', 11: 'R' },
  segaMD: { 1: 'A', 0: 'B', 8: 'C', 10: 'X', 9: 'Y', 11: 'Z' },
  n64: { 0: 'A', 1: 'B', 10: 'L', 11: 'R', 12: 'Z', 23: 'C ↑', 21: 'C ←', 22: 'C ↓', 20: 'C →' },
  gb: { 0: 'B', 8: 'A' },
  gba: { 0: 'B', 8: 'A', 10: 'L', 11: 'R' },
  psx: { 0: '✕', 1: '□', 8: '○', 9: '△', 10: 'L1', 11: 'R1', 12: 'L2', 13: 'R2' },
})

// The RetroOasis player's (EmulatorJS) default keyboard, by libretro index, so
// LAN rooms and Trade & link use the same keys as playing alone.
const PLAYER_KEYS = { KeyZ: 8, KeyX: 0, KeyA: 9, KeyS: 1, KeyQ: 10, KeyE: 11, KeyV: 2, Enter: 3, ArrowUp: 4, ArrowDown: 5, ArrowLeft: 6, ArrowRight: 7, KeyW: 12, KeyR: 13 }
// R is the player's R2. The player's L2 is Tab, which would move browser focus in a
// room page, so rooms use W for L2. Only systems with L2/R2 (PlayStation) get either key.
export const ROOM_KEY_EXCEPTIONS = Object.freeze({ KeyW: 12 })
// N64 differs on purpose: the stick sits on the arrows (and on the player's
// T/F/G/H), the Z key is the Z trigger (the player's Tab would steal browser
// focus), and the rarely used D-pad moves to the numpad.
const N64_KEYS = {
  ArrowUp: 19, ArrowDown: 18, ArrowLeft: 17, ArrowRight: 16, KeyT: 19, KeyG: 18, KeyF: 17, KeyH: 16,
  KeyX: 0, KeyS: 1, KeyZ: 12, KeyQ: 10, KeyE: 11, Enter: 3,
  KeyI: 23, KeyK: 22, KeyJ: 21, KeyL: 20, Numpad8: 4, Numpad2: 5, Numpad4: 6, Numpad6: 7,
}
const STICK_KEYS = { KeyH: 16, KeyF: 17, KeyG: 18, KeyT: 19, KeyL: 20, KeyJ: 21, KeyK: 22, KeyI: 23 }
const LABEL_ORDER = ['A', 'B', 'C', 'X', 'Y', 'Z', 'L', 'R', '✕', '○', '□', '△', 'L1', 'R1', 'L2', 'R2']
const keyName = code => code.replace(/^Key/, '')

/** Keyboard map and its on-screen description for a room system. */
export function keyboardLayout(core) {
  const profile = ROOM_PROFILES[core]
  if (!profile) return { keys: {}, hint: '' }
  if (profile.analog) {
    return {
      keys: { ...N64_KEYS },
      hint: 'Keyboard: arrows or T/F/G/H = stick (hold Shift to walk) · X = A · S = B · Z = Z · Q / E = L / R · I/J/K/L = C-buttons · Enter = Start · numpad 8/4/2/6 = D-pad.',
    }
  }
  const allowed = new Set(profile.buttons)
  const keys = Object.fromEntries(Object.entries(PLAYER_KEYS).filter(([, index]) => allowed.has(index)))
  if (allowed.has(2)) Object.assign(keys, { ShiftLeft: 2, ShiftRight: 2 }) // Earlier Select key, kept as an alias.
  // Analog sticks on the player's own keys: T/F/G/H left, I/J/K/L right.
  if (profile.dualAnalog) Object.assign(keys, STICK_KEYS)
  const labels = BUTTON_LABELS[core] ?? {}
  const buttons = Object.entries(labels)
    .sort(([, a], [, b]) => LABEL_ORDER.indexOf(a) - LABEL_ORDER.indexOf(b))
    .map(([index, label]) => `${keyName(Object.keys(PLAYER_KEYS).find(code => PLAYER_KEYS[code] === Number(index)))} = ${label}`)
  return { keys, hint: ['Keyboard: arrows = D-pad', ...buttons, 'Enter = Start', ...(allowed.has(2) ? ['V = Select'] : []), ...(profile.dualAnalog ? ['T/F/G/H = left stick', 'I/J/K/L = right stick'] : [])].join(' · ') + '. Same keys as the RetroOasis player' + (allowed.has(12) ? ', except W for L2 (the player’s Tab would move page focus).' : '.') }
}
