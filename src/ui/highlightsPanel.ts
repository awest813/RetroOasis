/**
 * highlightsPanel.ts — Unified Favorites feed
 *
 * Renders the favorites section above the main library grid:
 *
 *  ★ Favorites  — Horizontal scroll of up to MAX_FAVORITES games the user
 *                 has starred.  Clicking a card calls `onPlayFavorite`.
 *
 * The panel is omitted when there are no favorites to display.
 * The panel itself returns `null` when the favorites section is empty.
 *
 * Dependencies are injected via `HighlightsPanelOpts` so this module stays
 * free of any singleton imports and is straightforward to unit-test.
 */

import type { GameMetadata } from "../library.js";
import { createElement as make } from "./dom.js";
import { ICON_PLAY_SVG, ICON_STAR_FILLED_SVG } from "../chromeIcons.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HighlightsPanelOpts {
  /** Games currently marked as favorites (already filtered by caller). */
  favorites: GameMetadata[];
  /** Returns the system icon string (emoji or `/assets/…` URL) for a systemId. */
  getSystemIcon: (systemId: string) => string;
  /** Returns the short display name for a systemId (e.g. "SNES", "PSP"). */
  getSystemName: (systemId: string) => string;
  /**
   * Called when the user clicks a favorite game card.
   * The caller is responsible for fetching the blob and launching the emulator.
   */
  onPlayFavorite: (game: GameMetadata) => void;
  /**
   * Resolve a display URL for a game's locally stored cover art blob.
   * When omitted, only {@link GameMetadata.thumbnailUrl} is shown on favorite cards.
   */
  loadCoverArtUrl?: (gameId: string) => Promise<string | null>;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Maximum number of favorites shown in the panel. */
export const MAX_FAVORITES = 8;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Build the highlights panel element.
 *
 * Returns `null` when the favorites list is empty — the caller should hide the container in that case.
 */
export function buildHighlightsPanel(opts: HighlightsPanelOpts): HTMLElement | null {
  const { favorites } = opts;
  if (favorites.length === 0) return null;

  const panel = make("section", {
    class: "highlights-panel",
    "aria-label": "Library highlights",
  });

  panel.appendChild(_buildFavoritesSection(favorites.slice(0, MAX_FAVORITES), opts));

  return panel;
}

// ── Private builders ──────────────────────────────────────────────────────────

function _buildFavoritesSection(
  favorites: GameMetadata[],
  opts: HighlightsPanelOpts,
): HTMLElement {
  const section = make("div", { class: "highlights-section highlights-section--favorites" });

  const header = make("div", { class: "highlights-section__header" });
  const favTitle = make("h3", { class: "highlights-section__title" });
  const favIcon = make("span", { class: "highlights-section__title-icon", "aria-hidden": "true" });
  favIcon.innerHTML = ICON_STAR_FILLED_SVG;
  favTitle.append(favIcon, document.createTextNode(" Favorites"));
  header.appendChild(favTitle);
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

  // Cover art: remote thumbnail URL, or local blob via optional loader.
  const applyCover = (src: string): void => {
    const cover = make("img", {
      src,
      alt: "",
      class: "highlights-fav-card__cover",
      draggable: "false",
    });
    iconWrap.appendChild(cover);
  };
  if (game.thumbnailUrl) {
    applyCover(game.thumbnailUrl);
  } else if (game.hasCoverArt && opts.loadCoverArtUrl) {
    void opts.loadCoverArtUrl(game.id).then((src) => {
      if (src) applyCover(src);
    });
  }

  const nameEl = make("div", { class: "highlights-fav-card__name" }, game.name);

  const badge = make("span", {
    class: "highlights-fav-card__badge",
    "aria-hidden": "true",
  }, opts.getSystemName(game.systemId));

  const playOverlay = make("div", {
    class: "highlights-fav-card__play",
    "aria-hidden": "true",
  });
  playOverlay.innerHTML = ICON_PLAY_SVG;

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

