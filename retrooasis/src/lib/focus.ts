/** Keyboard + gamepad focus for grids. */

import { setModalityFromPad } from './inputModality'
import { buttonPressed, readConnectedPad } from './gamepad'
import { sfxConfirm, sfxMove } from './sfx'

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
    if (!root.isConnected) return
    const tag = (event.target as HTMLElement | null)?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

    const map: Record<string, 'left' | 'right' | 'up' | 'down' | 'confirm'> = {
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
    moveFocus(root, dir)
  }

  root.addEventListener('keydown', onKeyDown)

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

    const stepAxis = (
      axis: 'x' | 'y',
      value: number,
      dirPos: 'left' | 'right' | 'up' | 'down',
      dirNeg: 'left' | 'right' | 'up' | 'down',
    ) => {
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
        moveFocus(root, dir)
        cool = now + 220
        holdStart = now
        heldAxis = axis
        return
      }
      if (heldAxis === axis && now > cool) {
        moveFocus(root, dir)
        const heldFor = now - holdStart
        cool = now + (heldFor > 700 ? 68 : heldFor > 350 ? 110 : 160)
      }
    }

    if (now > cool || x !== prev.x || y !== prev.y) {
      if (x) stepAxis('x', x, 'right', 'left')
      else if (y) stepAxis('y', y, 'down', 'up')
    }

    // Back is global in input.ts
    if ((a && !prev.a) || (start && !prev.start)) {
      moveFocus(root, 'confirm')
      cool = now + 220
    }

    prev.x = x
    prev.y = y
    prev.a = a
    prev.start = start
  }

  raf = requestAnimationFrame(poll)

  return () => {
    root.removeEventListener('keydown', onKeyDown)
    cancelAnimationFrame(raf)
  }
}
