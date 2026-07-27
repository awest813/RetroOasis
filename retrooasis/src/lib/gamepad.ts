/** Shared Standard Gamepad helpers. */

export function readConnectedPad(): Gamepad | null {
  const pads = navigator.getGamepads?.()
  if (!pads) return null
  for (let i = 0; i < pads.length; i++) {
    const pad = pads[i]
    if (pad?.connected) return pad
  }
  return null
}

export function buttonPressed(pad: Gamepad, index: number): boolean {
  const btn = pad.buttons[index]
  return !!btn && (btn.pressed || btn.value > 0.5)
}
