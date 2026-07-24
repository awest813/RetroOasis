import { getSoundsEnabled } from './store'

let ctx: AudioContext | null = null

function audio(): AudioContext | null {
  if (!getSoundsEnabled()) return null
  if (typeof AudioContext === 'undefined') return null
  if (!ctx) ctx = new AudioContext()
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

function blip(freq: number, duration = 0.05, type: OscillatorType = 'square', gain = 0.03): void {
  const ac = audio()
  if (!ac) return
  const osc = ac.createOscillator()
  const g = ac.createGain()
  osc.type = type
  osc.frequency.value = freq
  g.gain.value = gain
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + duration)
  osc.connect(g)
  g.connect(ac.destination)
  osc.start()
  osc.stop(ac.currentTime + duration)
}

export function sfxMove(): void {
  blip(520, 0.04, 'square', 0.02)
}

export function sfxConfirm(): void {
  blip(660, 0.05, 'square', 0.028)
  window.setTimeout(() => blip(880, 0.06, 'square', 0.022), 40)
}

export function sfxBack(): void {
  blip(320, 0.06, 'triangle', 0.025)
}

export function sfxToggle(): void {
  blip(740, 0.045, 'square', 0.02)
}
