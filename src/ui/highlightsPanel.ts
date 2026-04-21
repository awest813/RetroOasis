/**
 * highlightsPanel.ts — Unified Favorites + Recent Sessions feed
 *
 * Renders two optional sections above the main library grid:
 *
 *  1. ★ Favorites  — Horizontal scroll of up to MAX_FAVORITES games the user
 *                    has starred.  Clicking a card calls `onPlayFavorite`.
 *  2. 🕒 Recent    — Compact vertical list of the most recent play sessions,
 *                    with game name, system badge, play duration, and a
 *                    relative timestamp.
 *
 * Both sections are omitted when they have no content to display.
 * The panel itself returns `null` when both sections would be empty.
 *
 * Dependencies are injected via `HighlightsPanelOpts` so this module stays
 * free of any singleton imports and is straightforward to unit-test.
 */

import type { GameMetadata } from "../library.js";
import type { PlaySession } from "../sessionTracker.js";
import { createElement as make } from "./dom.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HighlightsPanelOpts {
  /** Games currently marked as favorites (already filtered by caller). */
  favorites: GameMetadata[];
  /** Most-recent play sessions, newest first. */
  recentSessions: PlaySession[];
  /**
   * All games currently in the library.
   * Used to look up metadata for sessions (the session only stores the name
   * and system at the time it was recorded).
   */
  allGames: GameMetadata[];
  /** Returns the system icon string (emoji or `/assets/…` URL) for a systemId. */
  getSystemIcon: (systemId: string) => string;
  /** Returns the short display name for a systemId (e.g. "SNES", "PSP"). */
  getSystemName: (systemId: string) => string;
  /** Format a Unix ms timestamp as "3d ago", "just now", etc. */
  formatRelativeTime: (ts: number) => string;
  /** Format a duration in ms as "12 min", "1 h 30 min", etc. */
  formatPlayTime: (ms: number) => string;
  /**
   * Called when the user clicks a favorite game card.
   * The caller is responsible for fetching the blob and launching the emulator.
   */
  onPlayFavorite: (game: GameMetadata) => void;
  /**
   * Called when the user clicks a recent-session entry to replay the game.
   * The caller is responsible for fetching the blob and launching the emulator.
   * Called with `null` when the game is no longer in the library.
   */
  onPlaySession: (game: GameMetadata | null, session: PlaySession) => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Maximum number of favorites shown in the panel. */
export const MAX_FAVORITES = 8;
/** Maximum number of recent sessions shown in the panel. */
export const MAX_SESSIONS  = 5;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Build the highlights panel element.
 *
 * Returns `null` when both the favorites list and the recent-sessions list
 * are empty — the caller should hide the container in that case.
 */
export function buildHighlightsPanel(opts: HighlightsPanelOpts): HTMLElement | null {
  const { favorites, recentSessions } = opts;
  if (favorites.length === 0 && recentSessions.length === 0) return null;

  const panel = make("section", {
    class: "highlights-panel",
    "aria-label": "Library highlights",
  });

  if (favorites.length > 0) {
    panel.appendChild(_buildFavoritesSection(favorites.slice(0, MAX_FAVORITES), opts));
  }

  if (recentSessions.length > 0) {
    panel.appendChild(_buildSessionsSection(recentSessions.slice(0, MAX_SESSIONS), opts));
  }

  return panel;
}

// ── Private builders ──────────────────────────────────────────────────────────

function _buildFavoritesSection(
  favorites: GameMetadata[],
  opts: HighlightsPanelOpts,
): HTMLElement {
  const section = make("div", { class: "highlights-section highlights-section--favorites" });

  const header = make("div", { class: "highlights-section__header" });
  header.appendChild(
    make("h3", { class: "highlights-section__title" }, "★ Favorites"),
  );
  section.appendChild(header);

  const scroll = make("div", {
    class: "highlights-section__scroll",
    role: "list",
    "aria-label": "Favorite games",
  });

  for (const game of favorites) {
    scroll.appendChild(_buildFavoriteCard(game, opts));
  }

  section.appendChild(scroll);
  return section;
}

function _buildFavoriteCard(
  game: GameMetadata,
  opts: HighlightsPanelOpts,
): HTMLElement {
  const card = make("div", {
    class: "highlights-fav-card",
    role: "listitem",
    tabindex: "0",
    "aria-label": `Play ${game.name}`,
  });

  // System icon / cover art
  const iconWrap = make("div", { class: "highlights-fav-card__icon", "aria-hidden": "true" });
  const sysIcon  = opts.getSystemIcon(game.systemId);
  if (sysIcon.includes("/assets/")) {
    const img = make("img", { src: sysIcon, alt: "", class: "highlights-fav-card__sys-img" });
    iconWrap.appendChild(img);
  } else {
    iconWrap.textContent = sysIcon;
  }

  // Cover art (local blob URL passed as thumbnailUrl, or remote)
  if (game.thumbnailUrl) {
    const cover = make("img", {
      src: game.thumbnailUrl,
      alt: "",
      class: "highlights-fav-card__cover",
      draggable: "false",
    });
    iconWrap.appendChild(cover);
  }

  const nameEl = make("div", { class: "highlights-fav-card__name" }, game.name);

  const badge = make("span", {
    class: "highlights-fav-card__badge",
    "aria-hidden": "true",
  }, opts.getSystemName(game.systemId));

  const playOverlay = make("div", {
    class: "highlights-fav-card__play",
    "aria-hidden": "true",
  }, "▶");

  card.append(iconWrap, nameEl, badge, playOverlay);

  // Pointer + keyboard activation
  const activate = () => opts.onPlayFavorite(game);
  card.addEventListener("click", activate);
  card.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      activate();
    }
  });

  return card;
}

function _buildSessionsSection(
  sessions: PlaySession[],
  opts: HighlightsPanelOpts,
): HTMLElement {
  const section = make("div", { class: "highlights-section highlights-section--sessions" });

  const header = make("div", { class: "highlights-section__header" });
  header.appendChild(
    make("h3", { class: "highlights-section__title" }, "🕒 Recent Sessions"),
  );
  section.appendChild(header);

  const list = make("div", {
    class: "highlights-section__session-list",
    role: "list",
    "aria-label": "Recent play sessions",
  });

  for (const session of sessions) {
    list.appendChild(_buildSessionEntry(session, opts));
  }

  section.appendChild(list);
  return section;
}

function _buildSessionEntry(
  session: PlaySession,
  opts: HighlightsPanelOpts,
): HTMLElement {
  const game = opts.allGames.find(g => g.id === session.gameId) ?? null;
  const canPlay = game !== null;

  const entry = make("div", {
    class: `highlights-session-entry${canPlay ? "" : " highlights-session-entry--gone"}`,
    role: "listitem",
    tabindex: canPlay ? "0" : "-1",
    "aria-label": canPlay
      ? `Continue ${session.gameName} — played ${opts.formatRelativeTime(session.endedAt)}`
      : `${session.gameName} — no longer in library`,
  });

  // System icon
  const sysIcon = opts.getSystemIcon(session.systemId);
  const iconEl  = make("span", { class: "highlights-session-entry__icon", "aria-hidden": "true" });
  if (sysIcon.includes("/assets/")) {
    const img = make("img", { src: sysIcon, alt: "", class: "highlights-session-entry__sys-img" });
    iconEl.appendChild(img);
  } else {
    iconEl.textContent = sysIcon;
  }

  // Text block
  const text  = make("div", { class: "highlights-session-entry__text" });
  const title = make("div", { class: "highlights-session-entry__name" }, session.gameName);
  const meta  = make("div", { class: "highlights-session-entry__meta" });

  const sysBadge = make("span", {
    class: "highlights-session-entry__sys",
    "aria-hidden": "true",
  }, opts.getSystemName(session.systemId));

  const dur  = make("span", { class: "highlights-session-entry__dur" },
    opts.formatPlayTime(session.durationMs));
  const time = make("span", { class: "highlights-session-entry__time" },
    opts.formatRelativeTime(session.endedAt));

  meta.append(sysBadge, dur, time);
  text.append(title, meta);

  // Play / gone indicator
  const actionEl = make("div", {
    class: "highlights-session-entry__action",
    "aria-hidden": "true",
  }, canPlay ? "▶" : "—");

  entry.append(iconEl, text, actionEl);

  if (canPlay) {
    const activate = () => opts.onPlaySession(game, session);
    entry.addEventListener("click", activate);
    entry.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        activate();
      }
    });
  }

  return entry;
}
