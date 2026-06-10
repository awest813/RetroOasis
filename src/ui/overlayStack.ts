/**
 * overlayStack.ts — Central registry for modal overlays and panels.
 *
 * Ensures Escape dismisses the topmost surface in stack order (confirm dialogs
 * above settings, settings above the library, etc.).
 */

export interface OverlayRegistration {
  element: HTMLElement;
  close: () => void;
}

const _stack: OverlayRegistration[] = [];

export function registerOverlay(entry: OverlayRegistration): () => void {
  _stack.push(entry);
  return () => {
    const index = _stack.indexOf(entry);
    if (index >= 0) _stack.splice(index, 1);
  };
}

export function isTopmostOverlay(element: HTMLElement): boolean {
  const top = _stack[_stack.length - 1];
  return top?.element === element;
}

export function hasActiveOverlay(): boolean {
  return _stack.length > 0;
}

/** Close the topmost overlay. Returns true when one was closed. */
export function closeTopmostOverlay(): boolean {
  const top = _stack.pop();
  if (!top) return false;
  top.close();
  return true;
}

/** Clear all registered overlays (e.g. when rebuilding the app shell). */
export function clearOverlayStack(): void {
  _stack.length = 0;
}

/** @internal Test helper */
export function _resetOverlayStackForTests(): void {
  clearOverlayStack();
}
