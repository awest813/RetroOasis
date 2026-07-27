/** Keyboard + gamepad focus for grids and settings-style rows. */

import { setModalityFromPad } from './inputModality'
import { buttonPressed, readConnectedPad } from './gamepad'
import { sfxConfirm, sfxMove } from './sfx'

type Cleanup = () => void
type Dir = 'left' | 'right' | 'up' | 'down' | 'confirm'

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[data-ro-focusable="true"]')).filter(
    (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-disabled') !== 'true',
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

function focusTarget(el: HTMLElement | null | undefined): void {
  if (!el) return
  el.focus({ preventScroll: true })
  el.closest('[data-ro-focus-row]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}

function moveFocus(root: HTMLElement, key: Dir): void {
  const list = focusables(root)
  if (!list.length) return

  const active = document.activeElement as HTMLElement | null
  let index = active ? list.indexOf(active) : -1
  if (index < 0) index = 0

  if (key === 'confirm') {
    const target = active && list.includes(active) ? active : list[0]
    if (target.getAttribute('aria-disabled') === 'true') return
    sfxConfirm()
    target.click()
    return
  }

  const columns = estimateColumns(list)
  let next = index
  if (key === 'right') next = Math.min(list.length - 1, index + 1)
  if (key === 'left') next = Math.max(0, index - 1)
  if (key === 'down') next = Math.min(list.length - 1, index + columns)
  if (key === 'up') next = Math.max(0, index - columns)

  if (next !== index) sfxMove()
  focusTarget(list[next])
}

function moveRowFocus(root: HTMLElement, key: Dir): void {
  const list = focusables(root)
  if (!list.length) return

  const active = document.activeElement as HTMLElement | null
  let index = active ? list.indexOf(active) : -1
  if (index < 0) index = 0

  if (key === 'confirm') {
    const target = active && list.includes(active) ? active : list[0]
    if (target.getAttribute('aria-disabled') === 'true') return
    sfxConfirm()
    target.click()
    return
  }

  const rows = Array.from(root.querySelectorAll<HTMLElement>('[data-ro-focus-row]')).filter(
    (row) => focusables(row).length > 0,
  )
  if (!rows.length) {
    moveFocus(root, key)
    return
  }

  const current = (active && list.includes(active) ? active : list[0]).closest(
    '[data-ro-focus-row]',
  ) as HTMLElement | null
  const rowIndex = current ? rows.indexOf(current) : 0
  const row = rows[Math.max(0, rowIndex)] ?? rows[0]
  const inRow = focusables(row)
  const idxInRow = Math.max(0, inRow.indexOf(active && list.includes(active) ? active : inRow[0]))

  if (key === 'left' || key === 'right') {
    const next =
      key === 'right' ? Math.min(inRow.length - 1, idxInRow + 1) : Math.max(0, idxInRow - 1)
    if (next === idxInRow) return
    sfxMove()
    focusTarget(inRow[next])
    return
  }

  const nextRowIndex =
    key === 'down' ? Math.min(rows.length - 1, rowIndex + 1) : Math.max(0, rowIndex - 1)
  if (nextRowIndex === rowIndex) return
  const nextRow = rows[nextRowIndex]
  const nextControls = focusables(nextRow)
  const preferred =
    nextControls.find((el) => el.getAttribute('aria-pressed') === 'true') ??
    nextControls[Math.min(idxInRow, nextControls.length - 1)] ??
    nextControls[0]
  sfxMove()
  focusTarget(preferred)
}

function bindPadAndKeys(
  root: HTMLElement,
  move: (root: HTMLElement, key: Dir) => void,
): Cleanup {
  const onKeyDown = (event: KeyboardEvent) => {
    if (!root.isConnected) return
    const tag = (event.target as HTMLElement | null)?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

    const map: Record<string, Dir> = {
      ArrowRight: 'right',
      ArrowLeft: 'left',
      ArrowDown: 'down',
      ArrowUp: 'up',
      Enter: 'confirm',
      ' ': 'confirm',
    }
    const dir = map[event.key]
    if (!dir) return
    // Favorite stars are real buttons — let Enter/Space activate them natively.
    const target = event.target as HTMLElement | null
    if (dir === 'confirm' && target?.closest('[data-fav-id]')) return
    event.preventDefault()
    if (event.repeat) return
    move(root, dir)
  }

  root.addEventListener('keydown', onKeyDown)

  let raf = 0
  const prev = { x: 0, y: 0, a: false, start: false }
  let cool = 0
  let holdStart = 0
  let heldAxis: 'x' | 'y' | null = null

  const poll = () => {
    if (!root.isConnected) {
      raf = 0
      return
    }
    raf = requestAnimationFrame(poll)
    const pad = readConnectedPad()
    if (!pad) return

    const tag = (document.activeElement as HTMLElement | null)?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

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

    const stepAxis = (axis: 'x' | 'y', value: number, dirPos: Dir, dirNeg: Dir) => {
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
        move(root, dir)
        cool = now + 220
        holdStart = now
        heldAxis = axis
        return
      }
      if (heldAxis === axis && now > cool) {
        move(root, dir)
        const heldFor = now - holdStart
        cool = now + (heldFor > 700 ? 68 : heldFor > 350 ? 110 : 160)
      }
    }

    if (now > cool || x !== prev.x || y !== prev.y) {
      if (x) stepAxis('x', x, 'right', 'left')
      else if (y) stepAxis('y', y, 'down', 'up')
    }

    if ((a && !prev.a) || (start && !prev.start)) {
      move(root, 'confirm')
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

export function bindGridFocus(root: HTMLElement): Cleanup {
  return bindPadAndKeys(root, moveFocus)
}

/** Up/down between `[data-ro-focus-row]` groups; left/right within the row. */
export function bindRowFocus(root: HTMLElement): Cleanup {
  return bindPadAndKeys(root, moveRowFocus)
}
