import { setModalityFromPad } from './inputModality'

/** Standard-layout menu input shared by Chrome, Safari and other Gamepad browsers. */
export function connectedPads(): Gamepad[] {
  try {
    return Array.from(navigator.getGamepads?.() ?? []).filter((pad): pad is Gamepad => !!pad?.connected)
  } catch { return [] } // Permissions Policy or browser access restrictions.
}

export function readConnectedPad(): Gamepad | null {
  return connectedPads().find(pad => pad.mapping === 'standard') ?? null
}

export function buttonPressed(pad: Gamepad, index: number): boolean {
  const btn = pad.buttons[index]
  return !!btn && (btn.pressed || btn.value > 0.5)
}

export type MenuDirection = 'left' | 'right' | 'up' | 'down' | 'confirm' | 'back'
export function menuDirection(pad: Gamepad): MenuDirection | null {
  if (buttonPressed(pad, 1) || buttonPressed(pad, 8)) return 'back'
  if (buttonPressed(pad, 0) || buttonPressed(pad, 9)) return 'confirm'
  const x = Number(buttonPressed(pad, 15)) - Number(buttonPressed(pad, 14))
  const y = Number(buttonPressed(pad, 13)) - Number(buttonPressed(pad, 12))
  if (x) return x > 0 ? 'right' : 'left'
  if (y) return y > 0 ? 'down' : 'up'
  const ax = pad.axes[0] ?? 0
  const ay = pad.axes[1] ?? 0
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
  if (!bindings.size && !backHandler) { cancelAnimationFrame(raf); raf = 0; repeater.reset() }
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
