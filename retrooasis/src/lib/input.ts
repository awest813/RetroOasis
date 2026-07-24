import { sfxBack } from './sfx'
import { setModality } from './inputModality'

/** Focus rings only for keyboard/gamepad; Escape goes back. */
export function installInputChrome(): () => void {
  document.documentElement.dataset.input = 'mouse'

  const onPointer = () => setModality('mouse')
  const onKey = (event: KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return
    setModality('key')

    if (event.key === 'Escape') {
      const tag = (event.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      event.preventDefault()
      sfxBack()
      if (window.location.hash && window.location.hash !== '#/' && window.location.hash !== '#') {
        history.back()
      } else {
        window.location.hash = '#/'
      }
    }
  }

  window.addEventListener('pointerdown', onPointer, true)
  window.addEventListener('keydown', onKey, true)

  return () => {
    window.removeEventListener('pointerdown', onPointer, true)
    window.removeEventListener('keydown', onKey, true)
  }
}
