/** Keyboard + gamepad focus for grids. */

import { setModalityFromPad } from './inputModality'
import { sfxBack, sfxConfirm, sfxMove } from './sfx'

type Cleanup = () => void

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[data-ro-focusable="true"]')).filter(
    (el) => !el.hasAttribute('disabled'),
  )
}

function estimateColumns(list: HTMLElement[]): number {
  if (list.length < 2) return 1
  const top = list[0].offsetTop
  let cols = 1
  for (let i = 1; i < list.length; i++) {
    if (list[i].offsetTop !== top) break
    cols++
  }
  return Math.max(1, cols)
}

function moveFocus(root: HTMLElement, key: 'left' | 'right' | 'up' | 'down' | 'confirm'): void {
  const list = focusables(root)
  if (!list.length) return

  const active = document.activeElement as HTMLElement | null
  let index = active ? list.indexOf(active) : -1
  if (index < 0) index = 0

  if (key === 'confirm') {
    sfxConfirm()
    ;(active && list.includes(active) ? active : list[0]).click()
    return
  }

  const columns = estimateColumns(list)
  let next = index
  if (key === 'right') next = Math.min(list.length - 1, index + 1)
  if (key === 'left') next = Math.max(0, index - 1)
  if (key === 'down') next = Math.min(list.length - 1, index + columns)
  if (key === 'up') next = Math.max(0, index - columns)

  if (next !== index) sfxMove()
  list[next]?.focus()
}

export function bindGridFocus(root: HTMLElement): Cleanup {
  const onKeyDown = (event: KeyboardEvent) => {
    const map: Record<string, 'left' | 'right' | 'up' | 'down' | 'confirm'> = {
      ArrowRight: 'right',
      ArrowLeft: 'left',
      ArrowDown: 'down',
      ArrowUp: 'up',
      Enter: 'confirm',
    }
    const dir = map[event.key]
    if (!dir) return
    if (dir !== 'confirm') event.preventDefault()
    moveFocus(root, dir)
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
        moveFocus(root, 'right')
        cool = now + 180
      } else if (x === -1 && prev.x !== -1) {
        moveFocus(root, 'left')
        cool = now + 180
      } else if (y === 1 && prev.y !== 1) {
        moveFocus(root, 'down')
        cool = now + 180
      } else if (y === -1 && prev.y !== -1) {
        moveFocus(root, 'up')
        cool = now + 180
      } else if (a && !prev.a) {
        moveFocus(root, 'confirm')
        cool = now + 220
      } else if (b && !prev.b) {
        sfxBack()
        history.back()
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
