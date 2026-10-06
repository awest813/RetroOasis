import { sfxBack } from './sfx'
import { setModality } from './inputModality'
import { bindMenuBack, installGamepadPresence, resetMenuPad } from './gamepad'
import { goBackInApp } from './router'

function atHomeHash(): boolean {
  const hash = window.location.hash
  return !hash || hash === '#/' || hash === '#'
}

function goBack(): void {
  if (atHomeHash()) return
  if (goBackInApp()) sfxBack()
}

// Controller B is delivered as an Escape keydown so every view's Escape handling
// (close a menu, cancel an edit, clear a search) applies to it before going back.
const padEscapes = new WeakSet<Event>()
function padBack(): void {
  const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
  padEscapes.add(event)
  const target = document.activeElement instanceof HTMLElement ? document.activeElement : document.body
  target.dispatchEvent(event)
}

/** After a native dialog, require release so its held buttons cannot navigate. */
export function suppressPadBackUntilRelease(): void {
  resetMenuPad()
}

/** Focus rings only for keyboard/gamepad; Escape / B go back. */
export function installInputChrome(): () => void {
  document.documentElement.dataset.input = 'mouse'

  const onPointer = () => setModality('mouse')
  const onKey = (event: KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return
    const fromPad = padEscapes.has(event)
    if (!fromPad) setModality('key')
    if (event.defaultPrevented) return

    if (event.key === 'Escape') {
      if (event.repeat || event.isComposing || (event.target as HTMLElement | null)?.isContentEditable) return
      const tag = (event.target as HTMLElement | null)?.tagName
      // Keyboard Escape stays with text fields; controller B always leaves them.
      if (!fromPad && (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT')) return
      event.preventDefault()
      goBack()
    }
  }

  window.addEventListener('pointerdown', onPointer, true)
  window.addEventListener('keydown', onKey)

  const cleanupPad = bindMenuBack(padBack)
  const cleanupPresence = installGamepadPresence()
  window.addEventListener('blur', resetMenuPad)
  document.addEventListener('visibilitychange', resetMenuPad)

  return () => {
    window.removeEventListener('pointerdown', onPointer, true)
    window.removeEventListener('keydown', onKey)
    cleanupPad()
    cleanupPresence()
    window.removeEventListener('blur', resetMenuPad)
    document.removeEventListener('visibilitychange', resetMenuPad)
  }
}
