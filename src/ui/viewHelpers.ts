/**
 * viewHelpers.ts — Simple rendering and DOM helpers shared across UI modules.
 */

import { getSystemById } from "../systems.js";
import { ICON_GAMEPAD_DECOR_SVG } from "../chromeIcons.js";

export function systemIcon(systemId: string): string {
  const sys = getSystemById(systemId);
  if (sys?.iconUrl) return sys.iconUrl;
  return ICON_GAMEPAD_DECOR_SVG;
}

export function escHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      case "'": return "&#39;";
      default: return c;
    }
  });
}

export const FOCUSABLE_SELECTOR = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function trapFocus(container: HTMLElement, e: KeyboardEvent): void {
  if (e.key !== "Tab") return;
  const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((el) => !el.closest("[hidden]"));
  if (focusable.length === 0) return;
  const first = focusable[0]!;
  const last  = focusable[focusable.length - 1]!;
  if (e.shiftKey) {
    if (document.activeElement === first) { e.preventDefault(); last.focus(); }
  } else {
    if (document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return target.isContentEditable || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export function safeScrollIntoView(target: HTMLElement, options: ScrollIntoViewOptions): void {
  try {
    target.scrollIntoView(options);
  } catch {
    target.scrollIntoView();
  }
}
