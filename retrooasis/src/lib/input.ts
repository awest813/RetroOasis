import { sfxBack } from './sfx'
import { setModality } from './inputModality'
import { bindMenuBack, resetMenuPad } from './gamepad'

function atHomeHash(): boolean {
  const hash = window.location.hash
  return !hash || hash === '#/' || hash === '#'
}

function goBack(): void {
  if (atHomeHash()) return
  sfxBack()
  const before = window.location.hash
  history.back()
  // If there's no prior history entry, land on home
  window.setTimeout(() => {
    if (window.location.hash === before && !atHomeHash()) {
      window.location.hash = '#/'
    }
  }, 40)
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
    setModality('key')
    if (event.defaultPrevented) return

    if (event.key === 'Escape') {
      if (event.repeat || event.isComposing || (event.target as HTMLElement | null)?.isContentEditable) return
      const tag = (event.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      event.preventDefault()
      goBack()
    }
  }

  window.addEventListener('pointerdown', onPointer, true)
  window.addEventListener('keydown', onKey)

  const cleanupPad = bindMenuBack(goBack)
  window.addEventListener('blur', resetMenuPad)
  document.addEventListener('visibilitychange', resetMenuPad)

  return () => {
    window.removeEventListener('pointerdown', onPointer, true)
    window.removeEventListener('keydown', onKey)
    cleanupPad()
    window.removeEventListener('blur', resetMenuPad)
    document.removeEventListener('visibilitychange', resetMenuPad)
  }
}
