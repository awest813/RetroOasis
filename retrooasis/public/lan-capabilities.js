/** Shared by the browser, server and core preparation script. */
import { controllerButton, controllerAxis } from './controller-input.js'
export const LAN_PROTOCOL = 2
export const LAN_CAPABILITIES = Object.freeze({
  nes: { label: 'NES', mode: 'shared-console', maxPlayers: 2, cores: ['fceumm', 'nestopia'], buttons: [0, 2, 3, 4, 5, 6, 7, 8] },
  snes: { label: 'SNES', mode: 'shared-console', maxPlayers: 2, cores: ['snes9x', 'bsnes'], buttons: Array.from({ length: 12 }, (_, i) => i) },
  segaMD: { label: 'Mega Drive / Genesis', mode: 'shared-console', maxPlayers: 2, cores: ['genesis_plus_gx', 'genesis_plus_gx_wide', 'picodrive'], buttons: [0, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
  n64: { label: 'Nintendo 64 (experimental)', mode: 'shared-console', maxPlayers: 4, cores: ['mupen64plus_next', 'parallel_n64'], buttons: [0, 1, 3, 4, 5, 6, 7, 10, 11, 12, 20, 21, 22, 23], analog: true },
})
export const LAN_CORES = new Set(Object.keys(LAN_CAPABILITIES))
export const CORE_LABELS = Object.fromEntries(Object.entries(LAN_CAPABILITIES).map(([core, info]) => [core, info.label]))
export function inputIndices(core) {
  const profile = LAN_CAPABILITIES[core]
  return profile ? [...profile.buttons, ...(profile.analog ? [16, 17, 18, 19] : [])] : []
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
  const profile = LAN_CAPABILITIES[core]
  if (!pad || !profile) return { buttons: [], stick: [0, 0] }
  const map = profile.analog ? { 0: 0, 1: 1, 4: 10, 5: 11, 6: 12, 7: 12, 9: 3, 12: 4, 13: 5, 14: 6, 15: 7 }
    : { 0: 0, 1: 8, 2: 1, 3: 9, 4: 10, 5: 11, 8: 2, 9: 3, 12: 4, 13: 5, 14: 6, 15: 7 }
  const buttons = new Set()
  for (const [button, input] of Object.entries(map)) if (controllerButton(pad, button)) buttons.add(input)
  const x = controllerAxis(pad, profile.analog ? 2 : 0), y = controllerAxis(pad, profile.analog ? 3 : 1)
  if (x < -0.5) buttons.add(profile.analog ? 21 : 6)
  if (x > 0.5) buttons.add(profile.analog ? 20 : 7)
  if (y < -0.5) buttons.add(profile.analog ? 23 : 4)
  if (y > 0.5) buttons.add(profile.analog ? 22 : 5)
  return {
    buttons: [...buttons].filter(button => profile.buttons.includes(button)).sort((a, b) => a - b),
    stick: profile.analog ? normalizeStick(controllerAxis(pad, 0), controllerAxis(pad, 1)) : [0, 0],
  }
}
