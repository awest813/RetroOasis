import { getSoundPack, getSoundsEnabled, type SoundPack } from './store'

let ctx: AudioContext | null = null

function audio(): AudioContext | null {
  if (!getSoundsEnabled()) return null
  if (typeof AudioContext === 'undefined') return null
  if (!ctx) ctx = new AudioContext()
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

function tone(
  freq: number,
  duration: number,
  type: OscillatorType,
  gain: number,
  when = 0,
): void {
  const ac = audio()
  if (!ac) return
  const t0 = ac.currentTime + when
  const osc = ac.createOscillator()
  const g = ac.createGain()
  osc.type = type
  osc.frequency.value = freq
  g.gain.setValueAtTime(gain, t0)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration)
  osc.connect(g)
  g.connect(ac.destination)
  osc.start(t0)
  osc.stop(t0 + duration)
}

const packs: Record<
  SoundPack,
  {
    move: () => void
    confirm: () => void
    back: () => void
    toggle: () => void
  }
> = {
  soft: {
    move: () => tone(520, 0.04, 'triangle', 0.018),
    confirm: () => {
      tone(660, 0.05, 'sine', 0.022)
      tone(880, 0.06, 'sine', 0.016, 0.04)
    },
    back: () => tone(300, 0.07, 'sine', 0.02),
    toggle: () => tone(700, 0.045, 'triangle', 0.018),
  },
  arcade: {
    move: () => tone(880, 0.035, 'square', 0.016),
    confirm: () => {
      tone(523, 0.04, 'square', 0.024)
      tone(659, 0.04, 'square', 0.022, 0.035)
      tone(784, 0.07, 'square', 0.02, 0.07)
    },
    back: () => {
      tone(392, 0.05, 'square', 0.02)
      tone(294, 0.07, 'square', 0.016, 0.04)
    },
    toggle: () => {
      tone(988, 0.03, 'square', 0.018)
      tone(1318, 0.04, 'square', 0.014, 0.03)
    },
  },
}

function active() {
  return packs[getSoundPack()] ?? packs.soft
}

export function sfxMove(): void {
  active().move()
}

export function sfxConfirm(): void {
  active().confirm()
}

export function sfxBack(): void {
  active().back()
}

export function sfxToggle(): void {
  active().toggle()
}
