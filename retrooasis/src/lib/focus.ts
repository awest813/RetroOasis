/** Keyboard + gamepad focus for grids and settings-style rows. */

import { bindMenuPad } from './gamepad'
import { sfxConfirm, sfxMove } from './sfx'

type Cleanup = () => void
type Dir = 'left' | 'right' | 'up' | 'down' | 'pageleft' | 'pageright' | 'confirm'

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[data-ro-focusable="true"], a[href], button, input:not([type=hidden]), select, textarea')).filter(
    (el) =>
      el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden' &&
      !el.closest('[inert], [hidden], [aria-hidden="true"]') && !el.matches(':disabled') &&
      el.getAttribute('aria-disabled') !== 'true' &&
      el.getAttribute('aria-hidden') !== 'true',
  )
}

function focusTarget(el: HTMLElement | null | undefined): void {
  if (!el) return
  el.focus({ preventScroll: true })
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}

function moveFocus(root: HTMLElement, key: Dir): void {
  const dir: Dir = key === 'pageleft' ? 'left' : key === 'pageright' ? 'right' : key
  const list = focusables(root)
  if (!list.length) return

  const active = document.activeElement as HTMLElement | null
  if (dir === 'confirm') {
    const target = active && list.includes(active) ? active : list[0]
    if (!active || !list.includes(active)) { focusTarget(target); return }
    if (target.getAttribute('aria-disabled') === 'true') return
    if (target.matches('input:not([type=checkbox]):not([type=radio]), textarea, select')) { target.focus(); return }
    sfxConfirm()
    target.click()
    return
  }

  if (!active || !list.includes(active)) { focusTarget(list[0]); return }
  const box = active.getBoundingClientRect()
  const horizontal = dir === 'left' || dir === 'right'
  const sign = dir === 'right' || dir === 'down' ? 1 : -1
  const cx = box.left + box.width / 2
  const cy = box.top + box.height / 2
  let best: HTMLElement | null = null
  let score = Infinity
  for (const el of list) {
    if (el === active) continue
    const rect = el.getBoundingClientRect()
    const dx = rect.left + rect.width / 2 - cx
    const dy = rect.top + rect.height / 2 - cy
    const forward = (horizontal ? dx : dy) * sign
    if (forward < 1) continue
    const sideways = Math.abs(horizontal ? dy : dx)
    const distance = forward + sideways * 3
    if (distance < score) { score = distance; best = el }
  }
  if (best) { sfxMove(); focusTarget(best) }
}

function moveRowFocus(root: HTMLElement, key: Dir): void {
  const dir: Dir = key === 'pageleft' ? 'left' : key === 'pageright' ? 'right' : key
  const list = focusables(root)
  if (!list.length) return

  const active = document.activeElement as HTMLElement | null
  if (dir === 'confirm') {
    const target = active && list.includes(active) ? active : list[0]
    if (!active || !list.includes(active)) { focusTarget(target); return }
    if (target.getAttribute('aria-disabled') === 'true') return
    if (target.matches('input:not([type=checkbox]):not([type=radio]), textarea, select')) { target.focus(); return }
    sfxConfirm()
    target.click()
    return
  }

  const rows = Array.from(root.querySelectorAll<HTMLElement>('[data-ro-focus-row]')).filter(
    (row) => focusables(row).length > 0,
  )
  if (!rows.length || !active?.closest('[data-ro-focus-row]')) {
    moveFocus(root, dir)
    return
  }

  const current = (active && list.includes(active) ? active : list[0]).closest(
    '[data-ro-focus-row]',
  ) as HTMLElement | null
  const rowIndex = current ? rows.indexOf(current) : 0
  const row = rows[Math.max(0, rowIndex)] ?? rows[0]
  const inRow = focusables(row)
  const idxInRow = Math.max(0, inRow.indexOf(active && list.includes(active) ? active : inRow[0]))

  if (dir === 'left' || dir === 'right') {
    const next =
      dir === 'right' ? Math.min(inRow.length - 1, idxInRow + 1) : Math.max(0, idxInRow - 1)
    if (next === idxInRow) return
    sfxMove()
    focusTarget(inRow[next])
    return
  }

  const nextRowIndex =
    dir === 'down' ? Math.min(rows.length - 1, rowIndex + 1) : Math.max(0, rowIndex - 1)
  if (nextRowIndex === rowIndex) { moveFocus(root, dir); return }
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
    if (!root.isConnected || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
    if (event.isComposing || (event.target as HTMLElement | null)?.isContentEditable) return
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
    event.preventDefault()
    if (event.repeat) return
    move(root, dir)
  }

  root.addEventListener('keydown', onKeyDown)

  const cleanupPad = bindMenuPad(root, dir => { if (dir !== 'back') move(root, dir) })

  return () => {
    root.removeEventListener('keydown', onKeyDown)
    cleanupPad()
  }
}

export function bindGridFocus(root: HTMLElement): Cleanup {
  return bindPadAndKeys(root, moveFocus)
}

/** Up/down between `[data-ro-focus-row]` groups; left/right within the row. */
export function bindRowFocus(root: HTMLElement): Cleanup {
  return bindPadAndKeys(root, moveRowFocus)
}
