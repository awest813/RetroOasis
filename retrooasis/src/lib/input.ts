import { sfxBack } from './sfx'
import { setModality, setModalityFromPad } from './inputModality'
import { buttonPressed, readConnectedPad } from './gamepad'

function atHomeHash(): boolean {
  const hash = window.location.hash
  return !hash || hash === '#/' || hash === '#'
}

/** Focus rings only for keyboard/gamepad; Escape / B go back. */
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
      if (atHomeHash()) return
      sfxBack()
      history.back()
    }
  }

  window.addEventListener('pointerdown', onPointer, true)
  window.addEventListener('keydown', onKey, true)

  // Global pad Back (B / Select) so leaf pages without a local binder still work
  let raf = 0
  let prevBack = false
  const pollPad = () => {
    raf = requestAnimationFrame(pollPad)
    const pad = readConnectedPad()
    if (!pad) {
      prevBack = false
      return
    }
    const back = buttonPressed(pad, 1) || buttonPressed(pad, 8)
    if (back || buttonPressed(pad, 0) || buttonPressed(pad, 9)) setModalityFromPad()
    if (back && !prevBack && !atHomeHash()) {
      sfxBack()
      history.back()
    }
    prevBack = back
  }
  raf = requestAnimationFrame(pollPad)

  const onPadConnect = () => setModalityFromPad()
  window.addEventListener('gamepadconnected', onPadConnect)

  return () => {
    window.removeEventListener('pointerdown', onPointer, true)
    window.removeEventListener('keydown', onKey, true)
    window.removeEventListener('gamepadconnected', onPadConnect)
    cancelAnimationFrame(raf)
  }
}
