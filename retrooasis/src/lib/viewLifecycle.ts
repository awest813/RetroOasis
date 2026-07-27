/** Active leaf-view cleanup (pad focus polls, etc.). */

type Cleanup = () => void

let active: Cleanup | null = null

/** Replace the current view's cleanup. Pass null to only dispose. */
export function registerViewCleanup(fn: Cleanup | null): void {
  active?.()
  active = fn
}

export function disposeActiveView(): void {
  active?.()
  active = null
}
