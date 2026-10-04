/** Shared standard-layout controller reading for menus and LAN guests. */
export function readControllers(source = globalThis.navigator) {
  if (typeof source?.getGamepads !== 'function') return { pads: [], access: 'unsupported' }
  try { return { pads: Array.from(source.getGamepads() || []).filter(pad => pad?.connected), access: 'available' } }
  catch { return { pads: [], access: 'blocked' } }
}
export function controllerButton(pad, index) {
  const button = pad?.buttons[index]
  return typeof button === 'number' ? button > 0.5 : !!button && (button.pressed || button.value > 0.5)
}
export function controllerAxis(pad, index) {
  const value = pad?.axes[index]
  return Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0
}
const identity = pad => `${pad.index}:${pad.id}`
export function controllerNeutral(pad, threshold = 0.18) {
  return !Array.from(pad.buttons).some((_, index) => controllerButton(pad, index)) &&
    !Array.from(pad.axes).slice(0, 4).some((_, index) => Math.abs(controllerAxis(pad, index)) > threshold)
}
/** A fresh input on another controller takes over; a held input cannot steal it back. */
export class ControllerSelector {
  constructor() { this.selected = ''; this.activity = new Map() }
  read(pads) {
    const standard = pads.filter(pad => pad.mapping === 'standard')
    let selected = standard.find(pad => identity(pad) === this.selected) || standard[0] || null
    const activity = new Map()
    for (const pad of standard) {
      const id = identity(pad)
      const active = !controllerNeutral(pad, 0.55)
      if (active && !this.activity.get(id)) selected = pad
      activity.set(id, active)
    }
    this.activity = activity
    this.selected = selected ? identity(selected) : ''
    return selected
  }
}
/** Ignore held input on connect/reconnect and after backgrounding a guest tab. */
export class ControllerGate {
  constructor() { this.identity = ''; this.armed = false }
  reset() { this.identity = ''; this.armed = false }
  read(pad, enabled = true) {
    if (!pad || !enabled) { this.reset(); return null }
    const id = identity(pad)
    if (id !== this.identity) { this.reset(); this.identity = id }
    if (!this.armed) { if (controllerNeutral(pad)) this.armed = true; return null }
    return pad
  }
}
