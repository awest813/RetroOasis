import { setModalityFromPad } from './inputModality'

/** Standard-layout menu input shared by Chrome, Safari and other Gamepad browsers. */
export function connectedPads(): Gamepad[] {
  try {
    return Array.from(navigator.getGamepads?.() ?? []).filter((pad): pad is Gamepad => !!pad?.connected)
  } catch { return [] } // Permissions Policy or browser access restrictions.
}

let lastActiveIndex: number | null = null

function rememberActivePad(pad: Gamepad): void {
  lastActiveIndex = pad.index
}

export function readConnectedPad(): Gamepad | null {
  const pads = connectedPads()
  const standard = pads.filter(pad => pad.mapping === 'standard')
  if (lastActiveIndex != null) {
    const preferred = standard.find(pad => pad.index === lastActiveIndex)
    if (preferred) return preferred
  }
  return standard[0] ?? null
}

export function buttonPressed(pad: Gamepad, index: number): boolean {
  const btn = pad.buttons[index]
  return !!btn && (btn.pressed || btn.value > 0.5)
}

export type MenuDirection = 'left' | 'right' | 'up' | 'down' | 'pageleft' | 'pageright' | 'confirm' | 'back'
export function menuDirection(pad: Gamepad): MenuDirection | null {
  if (buttonPressed(pad, 1) || buttonPressed(pad, 8)) return 'back'
  if (buttonPressed(pad, 0) || buttonPressed(pad, 9)) return 'confirm'
  const x = Number(buttonPressed(pad, 15)) - Number(buttonPressed(pad, 14))
  const y = Number(buttonPressed(pad, 13)) - Number(buttonPressed(pad, 12))
  if (x) return x > 0 ? 'right' : 'left'
  if (y) return y > 0 ? 'down' : 'up'
  if (buttonPressed(pad, 4) || buttonPressed(pad, 6)) return 'pageleft'
  if (buttonPressed(pad, 5) || buttonPressed(pad, 7)) return 'pageright'
  const ax = pad.axes[0] ?? 0
  const ay = pad.axes[1] ?? 0
  if (Math.max(Math.abs(ax), Math.abs(ay)) < 0.55) return null
  if (Math.abs(ax) > Math.abs(ay)) return ax > 0 ? 'right' : 'left'
  return ay > 0 ? 'down' : 'up'
}

function padHasInput(pad: Gamepad): boolean {
  if (pad.buttons.some((btn) => btn.pressed || btn.value > 0.5)) return true
  return pad.axes.some((axis) => Math.abs(axis) >= 0.55)
}

/** Require release after connecting, switching pages or returning to the tab. */
export class MenuRepeater {
  private identity = ''
  private armed = false
  private previous: MenuDirection | null = null
  private next = 0
  private actionHeld = false
  reset(): void { this.identity = ''; this.armed = false; this.previous = null; this.next = 0; this.actionHeld = false }
  read(pad: Gamepad | null, now: number): MenuDirection | null {
    if (!pad) { this.reset(); return null }
    const identity = `${pad.index}:${pad.id}`
    if (identity !== this.identity) { this.reset(); this.identity = identity }
    if (padHasInput(pad)) rememberActivePad(pad)
    const dir = menuDirection(pad)
    if (!this.armed) { if (!dir) this.armed = true; return null }
    const action = dir === 'confirm' || dir === 'back'
    if (!action) this.actionHeld = false
    if (action && this.actionHeld) return null
    if (!dir) { this.previous = null; return null }
    if (dir !== this.previous) {
      if (action) this.actionHeld = true
      this.previous = dir
      this.next = now + 360
      return dir
    }
    if (dir !== 'confirm' && dir !== 'back' && now >= this.next) {
      this.next = now + 110
      return dir
    }
    return null
  }
}

type MenuBinding = { root: HTMLElement; move: (dir: MenuDirection) => void }
const bindings = new Set<MenuBinding>()
let raf = 0
const repeater = new MenuRepeater()
let backHandler: (() => void) | null = null
const presenceListeners = new Set<() => void>()

function emitPresence(): void {
  for (const listener of presenceListeners) listener()
}

export function onPadPresenceChange(listener: () => void): () => void {
  presenceListeners.add(listener)
  return () => presenceListeners.delete(listener)
}

export function describeConnectedPads(): {
  secure: boolean
  available: boolean
  pads: Gamepad[]
  standard: Gamepad | null
  message: string
} {
  const pads = connectedPads()
  const standard = readConnectedPad()
  const secure = window.isSecureContext
  const available = typeof navigator.getGamepads === 'function'
  let message: string
  if (!secure) {
    message = 'Open this site over HTTPS or localhost to use controllers.'
  } else if (!available) {
    message = 'Controller access is unavailable in this browser. Keyboard and touch still work.'
  } else if (standard) {
    const extra = pads.length > 1 ? ` ${pads.length} controllers connected.` : ''
    message = `Ready for menus: ${standard.id}.${extra} Shoulders (L/R) also move. Release buttons before navigating.`
  } else if (pads.length) {
    message = 'Controller detected, but its button layout is not recognized for menus. Use keyboard or touch here and configure controls in the player.'
  } else {
    message = 'No controller visible yet. Press and release a controller button while this page is active, then check again. Browser or embedded-page permissions may also block access.'
  }
  return { secure, available, pads, standard, message }
}

export function resetMenuPad(): void { repeater.reset() }
function poll(): void {
  raf = requestAnimationFrame(poll)
  if (document.hidden || !document.hasFocus()) { repeater.reset(); return }
  const dir = repeater.read(readConnectedPad(), performance.now())
  if (!dir) return
  setModalityFromPad()
  if (dir === 'back') { backHandler?.(); return }
  const available = [...bindings].filter(b => b.root.isConnected && b.root.getClientRects().length)
  const target = available.find(b => b.root.contains(document.activeElement)) ?? available[0]
  target?.move(dir)
}
function start(): void { if (!raf) raf = requestAnimationFrame(poll) }
function stopIfUnused(): void {
  if (!bindings.size && !backHandler && !presenceListeners.size) { cancelAnimationFrame(raf); raf = 0; repeater.reset() }
}

function showPadToast(text: string): void {
  const existing = document.getElementById('ro-pad-toast')
  existing?.remove()
  const toast = document.createElement('div')
  toast.id = 'ro-pad-toast'
  toast.className = 'ro-toast'
  toast.setAttribute('role', 'status')
  toast.textContent = text
  document.body.appendChild(toast)
  window.setTimeout(() => toast.remove(), 3200)
}

export function installGamepadPresence(): () => void {
  const onConnect = (event: GamepadEvent) => {
    if (event.gamepad.mapping === 'standard') lastActiveIndex = event.gamepad.index
    emitPresence()
    showPadToast(`Controller connected: ${event.gamepad.id}`)
    start()
  }
  const onDisconnect = (event: GamepadEvent) => {
    if (lastActiveIndex === event.gamepad.index) lastActiveIndex = null
    repeater.reset()
    emitPresence()
    showPadToast('Controller disconnected')
  }
  window.addEventListener('gamepadconnected', onConnect)
  window.addEventListener('gamepaddisconnected', onDisconnect)
  start()
  return () => {
    window.removeEventListener('gamepadconnected', onConnect)
    window.removeEventListener('gamepaddisconnected', onDisconnect)
    stopIfUnused()
  }
}

export function bindMenuPad(root: HTMLElement, move: MenuBinding['move']): () => void {
  const binding = { root, move }
  bindings.add(binding)
  repeater.reset()
  start()
  return () => { bindings.delete(binding); stopIfUnused() }
}
export function bindMenuBack(handler: () => void): () => void {
  backHandler = handler
  start()
  return () => { if (backHandler === handler) backHandler = null; stopIfUnused() }
}
