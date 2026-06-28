/**
 * Shared inline SVG glyphs for UI chrome (stroke icons follow currentColor).
 * Centralizes vectors so we avoid emoji in controls, toasts, and status surfaces.
 */

export const ICON_CLOSE_X_SVG = `<svg class="icon-close-x" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`;

export const ICON_ALERT_TRIANGLE_SVG = `<svg class="ui-inline-icon ui-inline-icon--alert" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><line x1="12" y1="9" x2="12" y2="13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M12 17h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

export const ICON_TOAST_SUCCESS_SVG = `<svg class="info-toast__glyph" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export const ICON_TOAST_INFO_SVG = `<svg class="info-toast__glyph" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/><path d="M12 16v-4M12 8h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

export const ICON_TOAST_WARN_SVG = `<svg class="info-toast__glyph" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><line x1="12" y1="9" x2="12" y2="13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

export const ICON_TOAST_ERROR_SVG = `<svg class="info-toast__glyph info-toast__glyph--error" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`;

/** Controller silhouette — library cards, multiplayer banners, system fallback when no asset URL. */
export const ICON_GAMEPAD_DECOR_SVG = `<svg class="ui-decor-gamepad" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="2" y="7" width="20" height="10" rx="4" stroke="currentColor" stroke-width="2"/><path d="M7 13h.01M9 11v4M7 12h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="17" cy="13" r="1.25" fill="currentColor"/><circle cx="15" cy="11" r="1.25" fill="currentColor"/></svg>`;

export const ICON_GRID_ALL_SVG = `<svg class="sys-filter-chip__glyph" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="3" width="7" height="7" stroke="currentColor" stroke-width="2"/><rect x="14" y="3" width="7" height="7" stroke="currentColor" stroke-width="2"/><rect x="14" y="14" width="7" height="7" stroke="currentColor" stroke-width="2"/><rect x="3" y="14" width="7" height="7" stroke="currentColor" stroke-width="2"/></svg>`;

export const ONBOARD_ICON_FAST_SVG = `<svg class="onboarding__glyph" viewBox="0 0 24 24" fill="none" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`;

export const ONBOARD_ICON_INPUTS_SVG = `<svg class="onboarding__glyph" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="2" y="7" width="20" height="10" rx="4" stroke="currentColor" stroke-width="2"/><path d="M7 13h.01M9 11v4M7 12h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="17" cy="13" r="1.25" fill="currentColor"/><circle cx="15" cy="11" r="1.25" fill="currentColor"/></svg>`;

export const ONBOARD_ICON_LOCK_SVG = `<svg class="onboarding__glyph" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" stroke-width="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

export const ICON_ROTATE_PHONE_SVG = `<svg class="rotate-hint__glyph" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="2" width="14" height="20" rx="3" stroke="currentColor" stroke-width="2"/><path d="M9 18h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

export const ICON_BATTERY_SVG = `<svg class="footer-battery__glyph" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="2" y="7" width="18" height="10" rx="2" stroke="currentColor" stroke-width="2"/><path d="M22 11v2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M6 11h7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

export const ICON_TROPHY_SVG = `<svg class="game-card__ach-glyph" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 21h8M12 17v4M7 4h10v3a5 5 0 0 1-10 0V4zM7 4H5a2 2 0 0 0-2 2v1c0 1.5 1.5 3 3.5 3M17 4h2a2 2 0 0 1 2 2v1c0 1.5-1.5 3-3.5 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export const ICON_PLAY_SVG = `<svg class="ui-inline-icon ui-inline-icon--play" viewBox="0 0 24 24" fill="none" aria-hidden="true"><polygon points="8 5 19 12 8 19 8 5" fill="currentColor"/></svg>`;

export const ICON_STAR_SVG = `<svg class="ui-inline-icon ui-inline-icon--star" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3.5l2.55 5.17 5.7.83-4.12 4.02.97 5.67L12 16.9l-5.1 2.69.97-5.67-4.12-4.02 5.7-.83L12 3.5z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`;

export const ICON_STAR_FILLED_SVG = `<svg class="ui-inline-icon ui-inline-icon--star ui-inline-icon--star-filled" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3.5l2.55 5.17 5.7.83-4.12 4.02.97 5.67L12 16.9l-5.1 2.69.97-5.67-4.12-4.02 5.7-.83L12 3.5z" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>`;

export const ICON_SEARCH_SVG = `<svg class="ui-inline-icon ui-inline-icon--search" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"/><path d="M20 20l-3.5-3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

export const ICON_USER_SVG = `<svg class="ui-inline-icon ui-inline-icon--user" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="2"/><path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

export const ICON_BOOK_SVG = `<svg class="ui-inline-icon ui-inline-icon--book" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 4h9a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M8 4h8a3 3 0 0 1 3 3v13" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`;

export const ICON_BOOKMARK_SVG = `<svg class="ui-inline-icon ui-inline-icon--bookmark" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 4h10a1 1 0 0 1 1 1v16l-6-3.5L6 21V5a1 1 0 0 1 1-1z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`;

export const ICON_BOOKMARK_FILLED_SVG = `<svg class="ui-inline-icon ui-inline-icon--bookmark ui-inline-icon--bookmark-filled" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 4h10a1 1 0 0 1 1 1v16l-6-3.5L6 21V5a1 1 0 0 1 1-1z" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>`;

export const ICON_MORE_SVG = `<svg class="ui-inline-icon ui-inline-icon--more" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="6" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="18" cy="12" r="1.5" fill="currentColor"/></svg>`;

export const ICON_SPARKLE_SVG = `<svg class="ui-inline-icon ui-inline-icon--sparkle" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3l1.4 4.3L18 9l-4.6 1.7L12 15l-1.4-4.3L6 9l4.6-1.7L12 3z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M19 14l.8 2.4L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.6L19 14z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>`;

export const ICON_EDIT_PENCIL_SVG = `<svg class="ui-inline-icon ui-inline-icon--edit" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M13.5 6.5l3 3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

export const ICON_IMAGE_UPLOAD_SVG = `<svg class="ui-inline-icon ui-inline-icon--upload" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="2" stroke="currentColor" stroke-width="2"/><circle cx="9" cy="10" r="2" stroke="currentColor" stroke-width="2"/><path d="M4 16l4.5-4.5 3 3L15 11l5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export const ICON_LINK_SVG = `<svg class="ui-inline-icon ui-inline-icon--link" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M10 13a5 5 0 0 1 0-7l1.5-1.5a5 5 0 0 1 7 7L17 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M14 11a5 5 0 0 1 0 7L12.5 19.5a5 5 0 0 1-7-7L7 11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

/** Inline SVG strings produced by this module (leading whitespace allowed). */
const SAFE_SVGS = new Set([
  ICON_CLOSE_X_SVG, ICON_ALERT_TRIANGLE_SVG, ICON_TOAST_SUCCESS_SVG, ICON_TOAST_INFO_SVG, ICON_TOAST_WARN_SVG, ICON_TOAST_ERROR_SVG, ICON_GAMEPAD_DECOR_SVG, ICON_GRID_ALL_SVG, ONBOARD_ICON_FAST_SVG, ONBOARD_ICON_INPUTS_SVG, ONBOARD_ICON_LOCK_SVG, ICON_ROTATE_PHONE_SVG, ICON_BATTERY_SVG, ICON_TROPHY_SVG, ICON_PLAY_SVG, ICON_STAR_SVG, ICON_STAR_FILLED_SVG, ICON_SEARCH_SVG, ICON_USER_SVG, ICON_BOOK_SVG, ICON_BOOKMARK_SVG, ICON_BOOKMARK_FILLED_SVG, ICON_MORE_SVG, ICON_SPARKLE_SVG, ICON_EDIT_PENCIL_SVG, ICON_IMAGE_UPLOAD_SVG, ICON_LINK_SVG
].map((svg) => svg.trim()));

export function isSvgMarkup(s: string): boolean {
  return SAFE_SVGS.has(s.trim());
}

export const INFO_TOAST_ICON_HTML: Record<"success" | "info" | "warning" | "error", string> = {
  success: ICON_TOAST_SUCCESS_SVG,
  info: ICON_TOAST_INFO_SVG,
  warning: ICON_TOAST_WARN_SVG,
  error: ICON_TOAST_ERROR_SVG,
};
