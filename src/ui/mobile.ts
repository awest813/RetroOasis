/**
 * mobile.ts — Touch / phone / tablet detection and mobile-only UI helpers.
 */

/** True when the primary input is a touchscreen (not a mouse-only desktop). */
export function isTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  if (navigator.maxTouchPoints > 0) return true;
  // Chromebooks in tablet mode expose a coarse pointer even with stylus support.
  try {
    return window.matchMedia("(pointer: coarse)").matches;
  } catch {
    return false;
  }
}

/** True when the app is running in installed PWA mode (standalone or WCO). */
export function isPwaDisplayMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.matchMedia("(display-mode: standalone), (display-mode: window-controls-overlay)").matches;
  } catch {
    return false;
  }
}

/** True when touch-oriented UI affordances (FAB, larger targets) should apply. */
export function shouldApplyTouchUi(): boolean {
  return isTouchDevice() || isPwaDisplayMode();
}

/** Sync the document `touch-ui` class with current device capabilities. */
export function syncTouchUiClass(): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("touch-ui", shouldApplyTouchUi());
}

/** True when the viewport is currently in portrait orientation. */
export function isPortrait(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.matchMedia("(orientation: portrait)").matches;
  } catch {
    return window.innerHeight > window.innerWidth;
  }
}

/** Portrait rotate hint — touch devices only; desktop portrait sessions stay quiet. */
export function shouldShowRotateHint(inGame: boolean): boolean {
  return inGame && isPortrait() && isTouchDevice();
}
