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
      sfxConfirm()
      api.confirm()
      return
    }

    const catCount = api.getCategoryCount()
    const itemCount = api.getItemCount()
    if (!catCount) return

    let cat = api.getCategoryIndex()
    let item = api.getItemIndex()

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
    move(dir)
  }

  root.addEventListener('keydown', onKeyDown)

  let raf = 0
  const prev = { x: 0, y: 0, a: false, b: false }
  let cool = 0

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

    if (now > cool) {
      if (x === 1 && prev.x !== 1) {
        move('right')
        cool = now + 180
      } else if (x === -1 && prev.x !== -1) {
        move('left')
        cool = now + 180
      } else if (y === 1 && prev.y !== 1) {
        move('down')
        cool = now + 180
      } else if (y === -1 && prev.y !== -1) {
        move('up')
        cool = now + 180
      } else if (a && !prev.a) {
        move('confirm')
        cool = now + 220
      } else if (b && !prev.b) {
        move('back')
        cool = now + 220
      }
    }

    prev.x = x
    prev.y = y
    prev.a = a
    prev.b = b
  }

  raf = requestAnimationFrame(poll)

  return () => {
    root.removeEventListener('keydown', onKeyDown)
    cancelAnimationFrame(raf)
  }
}
