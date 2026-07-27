/** Dual-axis XMB focus: Left/Right categories, Up/Down items. */

import { setModalityFromPad } from './inputModality'
import { sfxBack, sfxConfirm, sfxMove } from './sfx'

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

export function bindXmbFocus(root: HTMLElement, api: XmbFocusApi): Cleanup {
  const move = (dir: XmbDir): void => {
    if (dir === 'back') {
      sfxBack()
      if (window.location.hash && window.location.hash !== '#/' && window.location.hash !== '#') {
        history.back()
      }
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
      return
    }

    if (!itemCount) return
    if (dir === 'down') {
      const next = Math.min(itemCount - 1, item + 1)
      if (next === item) return
      sfxMove()
      api.setItemIndex(next)
      return
    }
    if (dir === 'up') {
      const next = Math.max(0, item - 1)
      if (next === item) return
      sfxMove()
      api.setItemIndex(next)
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
    const tag = (event.target as HTMLElement | null)?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

    const map: Record<string, XmbDir> = {
      ArrowRight: 'right',
      ArrowLeft: 'left',
      ArrowDown: 'down',
      ArrowUp: 'up',
      Enter: 'confirm',
      ' ': 'confirm',
    }
    const dir = map[event.key]
    if (!dir) return
    event.preventDefault()
    if (event.repeat) return
    move(dir)
    startHold(dir)
  }

  const onKeyUp = (event: KeyboardEvent) => {
    if (
      event.key === 'ArrowRight' ||
      event.key === 'ArrowLeft' ||
      event.key === 'ArrowDown' ||
      event.key === 'ArrowUp'
    ) {
      clearHold()
    }
  }

  root.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)

  let raf = 0
  const prev = { x: 0, y: 0, a: false, b: false }
  let cool = 0
  let holdStart = 0
  let heldAxis: 'x' | 'y' | null = null

  const poll = () => {
    raf = requestAnimationFrame(poll)
    const pad = navigator.getGamepads?.()[0]
    if (!pad) return

    const now = performance.now()
    const axisX = Math.abs(pad.axes[0] ?? 0) > 0.45 ? Math.sign(pad.axes[0]) : 0
    const axisY = Math.abs(pad.axes[1] ?? 0) > 0.45 ? Math.sign(pad.axes[1]) : 0
    const dpadLeft = pad.buttons[14]?.pressed ? -1 : 0
    const dpadRight = pad.buttons[15]?.pressed ? 1 : 0
    const dpadUp = pad.buttons[12]?.pressed ? -1 : 0
    const dpadDown = pad.buttons[13]?.pressed ? 1 : 0
    const x = dpadLeft || dpadRight || axisX
    const y = dpadUp || dpadDown || axisY
    const a = !!pad.buttons[0]?.pressed
    const b = !!pad.buttons[1]?.pressed

    if (x || y || a || b) setModalityFromPad()

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

    if (a && !prev.a) {
      move('confirm')
      cool = now + 220
    } else if (b && !prev.b) {
      move('back')
      cool = now + 220
    }

    prev.x = x
    prev.y = y
    prev.a = a
    prev.b = b
  }

  raf = requestAnimationFrame(poll)

  return () => {
    clearHold()
    root.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    cancelAnimationFrame(raf)
  }
}
