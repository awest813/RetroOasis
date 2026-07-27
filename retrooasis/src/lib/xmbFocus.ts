/** Dual-axis XMB focus: Left/Right categories, Up/Down items. */

import { setModality, setModalityFromPad } from './inputModality'
import { sfxBack, sfxConfirm, sfxMove } from './sfx'
import { buttonPressed, readConnectedPad } from './gamepad'

export type XmbDir = 'left' | 'right' | 'up' | 'down' | 'confirm' | 'back'

export interface XmbFocusApi {
  getCategoryCount: () => number
  getItemCount: () => number
  getCategoryIndex: () => number
  getItemIndex: () => number
  setCategoryIndex: (index: number) => void
  setItemIndex: (index: number) => void
  confirm: () => void
}

type Cleanup = () => void

const MOVE_DIRS = new Set<XmbDir>(['left', 'right', 'up', 'down'])

function atHomeHash(): boolean {
  const hash = window.location.hash
  return !hash || hash === '#/' || hash === '#'
}

/** @deprecated Prefer importing from `./gamepad` */
export { readConnectedPad } from './gamepad'

export function bindXmbFocus(root: HTMLElement, api: XmbFocusApi): Cleanup {
  const ensureShellFocus = () => {
    if (document.activeElement !== root) {
      root.focus({ preventScroll: true })
    }
  }

  const move = (dir: XmbDir): void => {
    if (dir === 'back') {
      if (atHomeHash()) return
      sfxBack()
      history.back()
      return
    }

    if (dir === 'confirm') {
      if (api.getItemCount() <= 0) return
      sfxConfirm()
      api.confirm()
      return
    }

    const catCount = api.getCategoryCount()
    const itemCount = api.getItemCount()
    if (!catCount) return

    const cat = api.getCategoryIndex()
    const item = api.getItemIndex()

    if (dir === 'left' || dir === 'right') {
      const next = dir === 'right' ? Math.min(catCount - 1, cat + 1) : Math.max(0, cat - 1)
      if (next === cat) return
      sfxMove()
      api.setCategoryIndex(next)
      ensureShellFocus()
      return
    }

    if (!itemCount) return
    if (dir === 'down') {
      const next = Math.min(itemCount - 1, item + 1)
      if (next === item) return
      sfxMove()
      api.setItemIndex(next)
      ensureShellFocus()
      return
    }
    if (dir === 'up') {
      const next = Math.max(0, item - 1)
      if (next === item) return
      sfxMove()
      api.setItemIndex(next)
      ensureShellFocus()
    }
  }

  let holdTimer = 0
  let holdInterval = 0
  let heldDir: XmbDir | null = null

  const clearHold = () => {
    if (holdTimer) window.clearTimeout(holdTimer)
    if (holdInterval) window.clearInterval(holdInterval)
    holdTimer = 0
    holdInterval = 0
    heldDir = null
  }

  const startHold = (dir: XmbDir) => {
    clearHold()
    if (!MOVE_DIRS.has(dir)) return
    heldDir = dir
    holdTimer = window.setTimeout(() => {
      holdInterval = window.setInterval(() => {
        if (heldDir) move(heldDir)
      }, 72)
    }, 360)
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (!root.isConnected) return
    const tag = (event.target as HTMLElement | null)?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

    // Keep console-like focus inside the shell
    if (event.key === 'Tab') {
      event.preventDefault()
      ensureShellFocus()
      return
    }

    const map: Record<string, XmbDir> = {
      ArrowRight: 'right',
      ArrowLeft: 'left',
      ArrowDown: 'down',
      ArrowUp: 'up',
      Enter: 'confirm',
      ' ': 'confirm',
      d: 'right',
      a: 'left',
      s: 'down',
      w: 'up',
      D: 'right',
      A: 'left',
      S: 'down',
      W: 'up',
    }

    if (event.key === 'Home') {
      event.preventDefault()
      setModality('key')
      if (api.getCategoryIndex() === 0) return
      sfxMove()
      api.setCategoryIndex(0)
      ensureShellFocus()
      return
    }
    if (event.key === 'End') {
      event.preventDefault()
      setModality('key')
      const last = Math.max(0, api.getCategoryCount() - 1)
      if (api.getCategoryIndex() === last) return
      sfxMove()
      api.setCategoryIndex(last)
      ensureShellFocus()
      return
    }

    const dir = map[event.key]
    if (!dir) return
    event.preventDefault()
    setModality('key')
    if (event.repeat) return
    move(dir)
    startHold(dir)
  }

  const onKeyUp = (event: KeyboardEvent) => {
    if (
      event.key === 'ArrowRight' ||
      event.key === 'ArrowLeft' ||
      event.key === 'ArrowDown' ||
      event.key === 'ArrowUp' ||
      event.key === 'd' ||
      event.key === 'a' ||
      event.key === 's' ||
      event.key === 'w' ||
      event.key === 'D' ||
      event.key === 'A' ||
      event.key === 'S' ||
      event.key === 'W'
    ) {
      clearHold()
    }
  }

  // Window-level so arrows still work if a child briefly stole focus
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)

  let raf = 0
  const prev = { x: 0, y: 0, a: false, start: false }
  let cool = 0
  let holdStart = 0
  let heldAxis: 'x' | 'y' | null = null

  const poll = () => {
    raf = requestAnimationFrame(poll)
    const pad = readConnectedPad()
    if (!pad) return

    const now = performance.now()
    const axisX = Math.abs(pad.axes[0] ?? 0) > 0.45 ? Math.sign(pad.axes[0]) : 0
    const axisY = Math.abs(pad.axes[1] ?? 0) > 0.45 ? Math.sign(pad.axes[1]) : 0
    const dpadLeft = buttonPressed(pad, 14) ? -1 : 0
    const dpadRight = buttonPressed(pad, 15) ? 1 : 0
    const dpadUp = buttonPressed(pad, 12) ? -1 : 0
    const dpadDown = buttonPressed(pad, 13) ? 1 : 0
    const x = dpadLeft || dpadRight || axisX
    const y = dpadUp || dpadDown || axisY
    const a = buttonPressed(pad, 0)
    const start = buttonPressed(pad, 9)

    if (x || y || a || start) setModalityFromPad()

    const stepAxis = (axis: 'x' | 'y', value: number, dirPos: XmbDir, dirNeg: XmbDir) => {
      if (!value) {
        if (heldAxis === axis) {
          heldAxis = null
          holdStart = 0
        }
        return
      }
      const dir = value > 0 ? dirPos : dirNeg
      const edge = axis === 'x' ? prev.x !== value : prev.y !== value
      if (edge) {
        move(dir)
        cool = now + 220
        holdStart = now
        heldAxis = axis
        return
      }
      if (heldAxis === axis && now > cool) {
        move(dir)
        const heldFor = now - holdStart
        cool = now + (heldFor > 700 ? 68 : heldFor > 350 ? 110 : 160)
      }
    }

    if (now > cool || x !== prev.x || y !== prev.y) {
      if (x) stepAxis('x', x, 'right', 'left')
      else if (y) stepAxis('y', y, 'down', 'up')
    }

    // Back (B / Select) is handled globally in input.ts so leaf pages work too
    if ((a && !prev.a) || (start && !prev.start)) {
      move('confirm')
      cool = now + 220
    }

    prev.x = x
    prev.y = y
    prev.a = a
    prev.start = start
  }

  raf = requestAnimationFrame(poll)

  const onPadConnect = () => setModalityFromPad()
  window.addEventListener('gamepadconnected', onPadConnect)

  return () => {
    clearHold()
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    window.removeEventListener('gamepadconnected', onPadConnect)
    cancelAnimationFrame(raf)
  }
}
