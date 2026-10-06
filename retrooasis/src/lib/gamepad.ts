import { setModalityFromPad } from './inputModality'
import { readControllers, controllerButton, controllerAxis, ControllerSelector } from '../../public/controller-input.js'

/** Standard-layout menu input shared by Chrome, Safari and other Gamepad browsers. */
export function connectedPads(): Gamepad[] {
  return readControllers().pads
}

const selector = new ControllerSelector()

export function readConnectedPad(): Gamepad | null {
  return selector.read(connectedPads())
}

export function buttonPressed(pad: Gamepad, index: number): boolean {
  return controllerButton(pad, index)
}

export type MenuDirection = 'left' | 'right' | 'up' | 'down' | 'pageleft' | 'pageright' | 'confirm' | 'back'
export function menuDirection(pad: Gamepad): MenuDirection | null {
  if (buttonPressed(pad, 1) || buttonPressed(pad, 8)) return 'back'
  if (buttonPressed(pad, 0) || buttonPressed(pad, 9)) return 'confirm'
  const x = Number(buttonPressed(pad, 15)) - Number(buttonPressed(pad, 14))
  const y = Number(buttonPressed(pad, 13)) - Number(buttonPressed(pad, 12))
  if (x) return x > 0 ? 'right' : 'left'
  if (y) return y > 0 ? 'down' : 'up'
  if (buttonPressed(pad, 4)) return 'pageleft'
  if (buttonPressed(pad, 5)) return 'pageright'
  const ax = controllerAxis(pad, 0)
  const ay = controllerAxis(pad, 1)
  if (Math.max(Math.abs(ax), Math.abs(ay)) < 0.55) return null
  if (Math.abs(ax) > Math.abs(ay)) return ax > 0 ? 'right' : 'left'
  return ay > 0 ? 'down' : 'up'
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
const inputListeners = new Set<(pad: Gamepad | null) => void>()
let lastProbe = 0

function emitPresence(): void {
  for (const listener of presenceListeners) listener()
}

export function onPadPresenceChange(listener: () => void): () => void {
  presenceListeners.add(listener)
  start()
  return () => { presenceListeners.delete(listener); stopIfUnused() }
}

export function onPadInputChange(listener: (pad: Gamepad | null) => void): () => void {
  inputListeners.add(listener)
  start()
  return () => { inputListeners.delete(listener); repeater.reset(); stopIfUnused() }
}

export function describeConnectedPads(): {
  secure: boolean
  available: boolean
  pads: Gamepad[]
  standard: Gamepad | null
  state: 'ready' | 'insecure' | 'unsupported' | 'blocked' | 'unmapped' | 'waiting'
  message: string
} {
  const reading = readControllers()
  const pads = reading.pads
  const standard = selector.read(pads)
  const secure = window.isSecureContext
  const available = reading.access !== 'unsupported'
  let state: ReturnType<typeof describeConnectedPads>['state']
  let message: string
  if (!secure) {
    state = 'insecure'
    message = 'Open this site over HTTPS or localhost to use controllers.'
  } else if (!available) {
    state = 'unsupported'
    message = 'Controller access is unavailable in this browser. Keyboard and touch still work.'
  } else if (reading.access === 'blocked') {
    state = 'blocked'
    message = 'Controller access is blocked by this browser or embedded-page permissions. Open RetroOasis directly in a browser tab and check again.'
  } else if (standard) {
    state = 'ready'
    const extra = pads.length > 1 ? ` ${pads.length} controllers connected.` : ''
    message = `Ready for menus.${extra} Use the D-pad or left stick to move. Release buttons before navigating.`
  } else if (pads.length) {
    state = 'unmapped'
    message = 'Controller detected, but its button layout is not recognized for menus. Use keyboard or touch here and configure controls in the player.'
  } else {
    state = 'waiting'
    message = 'No controller visible yet. If one is connected, keep this page active and check again; browser or embedded-page permissions can also block access.'
  }
  return { secure, available, pads, standard, state, message }
}

export function resetMenuPad(): void { repeater.reset(); for (const listener of inputListeners) listener(null) }
let presenceKey = ''
function poll(): void {
  raf = requestAnimationFrame(poll)
  if (document.hidden || !document.hasFocus()) { resetMenuPad(); return }
  const reading = readControllers()
  const pad = selector.read(reading.pads)
  const key = `${reading.access}/${reading.pads.map(pad => `${pad.index}:${pad.id}:${pad.mapping}`).join('|')}/${pad?.index}:${pad?.id}`
  if (key !== presenceKey) { presenceKey = key; emitPresence() }
  const now = performance.now()
  if (inputListeners.size && now - lastProbe >= 50) { lastProbe = now; for (const listener of inputListeners) listener(pad) }
  // A Settings input test must not trigger menus or Back while showing button input.
  if (inputListeners.size) { repeater.reset(); return }
  const dir = repeater.read(pad, now)
  if (!dir) return
  setModalityFromPad()
  if (dir === 'back') { backHandler?.(); return }
  const available = [...bindings].filter(b => b.root.isConnected && b.root.getClientRects().length)
  const target = available.find(b => b.root.contains(document.activeElement)) ?? available[0]
  target?.move(dir)
}
function start(): void { if (!raf) raf = requestAnimationFrame(poll) }
function stopIfUnused(): void {
  if (!bindings.size && !backHandler && !presenceListeners.size && !inputListeners.size) { cancelAnimationFrame(raf); raf = 0; repeater.reset() }
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
    emitPresence()
    showPadToast(`Controller connected: ${event.gamepad.id}`)
    start()
  }
  const onDisconnect = () => {
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
