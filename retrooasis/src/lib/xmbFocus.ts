/** Dual-axis XMB focus: Left/Right categories, Up/Down items. */

import { setModality } from './inputModality'
import { sfxBack, sfxConfirm, sfxMove } from './sfx'
import { bindMenuPad } from './gamepad'

export type XmbDir = 'left' | 'right' | 'up' | 'down' | 'pageleft' | 'pageright' | 'confirm' | 'back'

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
      sfxConfirm()
      api.confirm()
      return
    }

    const catCount = api.getCategoryCount()
    const itemCount = api.getItemCount()
    if (!catCount) return

    const cat = api.getCategoryIndex()
    const item = api.getItemIndex()

    if (dir === 'left' || dir === 'right' || dir === 'pageleft' || dir === 'pageright') {
      const next =
        dir === 'right' || dir === 'pageright'
          ? Math.min(catCount - 1, cat + 1)
          : Math.max(0, cat - 1)
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
    if (!root.isConnected || event.metaKey || event.ctrlKey || event.altKey) return
    if (event.defaultPrevented || event.isComposing || (event.target as HTMLElement | null)?.isContentEditable) return
    const tag = (event.target as HTMLElement | null)?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

    const active = document.activeElement as HTMLElement | null
    const focusInside = !active || active === root || root.contains(active)

    // Keep console-like focus inside the shell on desktop; allow Tab into
    // the mobile topbar when it is interactive, and allow Shift+Tab / skip link.
    if (event.key === 'Tab') {
      if (active?.classList.contains('ro-skip')) return
      if (event.shiftKey) return

      const mobileChrome = window.matchMedia('(max-width: 900px)').matches
      const topbar = document.querySelector('.ro-shell--xmb .ro-topbar')
      const topbarLive = mobileChrome && topbar && !topbar.hasAttribute('inert')
      if (!topbarLive) {
        event.preventDefault()
        ensureShellFocus()
      }
      return
    }

    // Focus is in the topbar (or elsewhere) — don't steal Enter/arrows.
    if (!focusInside) return

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

  const cleanupPad = bindMenuPad(root, move)
  window.addEventListener('blur', clearHold)
  document.addEventListener('visibilitychange', clearHold)

  return () => {
    clearHold()
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    window.removeEventListener('blur', clearHold)
    document.removeEventListener('visibilitychange', clearHold)
    cleanupPad()
  }
}
