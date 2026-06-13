/**
 * highlightsPanel.test.ts — Unit tests for the unified Favorites feed.
 */

import { describe, it, expect, vi } from "vitest";
import {
  buildHighlightsPanel,
  MAX_FAVORITES,
  type HighlightsPanelOpts,
} from "./highlightsPanel.js";
import type { GameMetadata } from "../library.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeGame(overrides: Partial<GameMetadata> = {}): GameMetadata {
  return {
    id:           overrides.id          ?? "game-1",
    name:         overrides.name        ?? "Test Game",
    fileName:     overrides.fileName    ?? "test.nes",
    systemId:     overrides.systemId    ?? "nes",
    size:         overrides.size        ?? 1024,
    addedAt:      overrides.addedAt     ?? 1_000_000,
    lastPlayedAt: overrides.lastPlayedAt ?? null,
    isFavorite:   overrides.isFavorite  ?? false,
    hasCoverArt:  overrides.hasCoverArt ?? false,
    thumbnailUrl: overrides.thumbnailUrl,
    cloudId:      overrides.cloudId,
    remotePath:   overrides.remotePath,
  };
}

function makeOpts(overrides: Partial<HighlightsPanelOpts> = {}): HighlightsPanelOpts {
  return {
    favorites:          overrides.favorites          ?? [],
    getSystemIcon:      overrides.getSystemIcon      ?? (() => "●"),
    getSystemName:      overrides.getSystemName      ?? ((id) => id.toUpperCase()),
    onPlayFavorite:     overrides.onPlayFavorite     ?? vi.fn(),
    loadCoverArtUrl:    overrides.loadCoverArtUrl,
  };
}

// ── buildHighlightsPanel ──────────────────────────────────────────────────────

describe("buildHighlightsPanel", () => {
  it("returns null when favorites is empty", () => {
    const result = buildHighlightsPanel(makeOpts());
    expect(result).toBeNull();
  });

  it("returns an HTMLElement when there are favorites", () => {
    const opts = makeOpts({ favorites: [makeGame()] });
    const el   = buildHighlightsPanel(opts);
    expect(el).not.toBeNull();
    expect(el).toBeInstanceOf(HTMLElement);
  });

  it("renders only the favorites section", () => {
    const opts = makeOpts({ favorites: [makeGame()] });
    const el   = buildHighlightsPanel(opts)!;
    expect(el.querySelector(".highlights-section--favorites")).not.toBeNull();
  });
});

// ── Favorites section ─────────────────────────────────────────────────────────

describe("buildHighlightsPanel — favorites section", () => {
  it("renders a card for each favorite", () => {
    const games = [makeGame({ id: "g1" }), makeGame({ id: "g2" }), makeGame({ id: "g3" })];
    const opts  = makeOpts({ favorites: games });
    const el    = buildHighlightsPanel(opts)!;
    expect(el.querySelectorAll(".highlights-fav-card").length).toBe(3);
  });

  it("caps displayed favorites at MAX_FAVORITES", () => {
    const games = Array.from({ length: MAX_FAVORITES + 5 }, (_, i) =>
      makeGame({ id: `g${i}` }),
    );
    const opts = makeOpts({ favorites: games });
    const el   = buildHighlightsPanel(opts)!;
    expect(el.querySelectorAll(".highlights-fav-card").length).toBe(MAX_FAVORITES);
  });

  it("shows the game name in each favorite card", () => {
    const game = makeGame({ name: "Zelda Adventure" });
    const opts = makeOpts({ favorites: [game] });
    const el   = buildHighlightsPanel(opts)!;
    const card = el.querySelector(".highlights-fav-card")!;
    expect(card.textContent).toContain("Zelda Adventure");
  });

  it("calls onPlayFavorite with the game when card is clicked", () => {
    const game          = makeGame();
    const onPlayFavorite = vi.fn();
    const opts          = makeOpts({ favorites: [game], onPlayFavorite });
    const el            = buildHighlightsPanel(opts)!;
    const card          = el.querySelector<HTMLElement>(".highlights-fav-card")!;

    card.click();

    expect(onPlayFavorite).toHaveBeenCalledOnce();
    expect(onPlayFavorite).toHaveBeenCalledWith(game);
  });

  it("calls onPlayFavorite when Enter key is pressed on a card", () => {
    const game          = makeGame();
    const onPlayFavorite = vi.fn();
    const opts          = makeOpts({ favorites: [game], onPlayFavorite });
    const el            = buildHighlightsPanel(opts)!;
    const card          = el.querySelector<HTMLElement>(".highlights-fav-card")!;

    card.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    expect(onPlayFavorite).toHaveBeenCalledOnce();
  });

  it("loads local cover art when hasCoverArt and loadCoverArtUrl is provided", async () => {
    const loadCoverArtUrl = vi.fn(async () => "blob:cover-art");
    const game = makeGame({ hasCoverArt: true });
    const opts = makeOpts({ favorites: [game], loadCoverArtUrl });
    const el = buildHighlightsPanel(opts)!;
    await vi.waitFor(() => {
      expect(loadCoverArtUrl).toHaveBeenCalledWith(game.id);
      expect(el.querySelector(".highlights-fav-card__cover")).not.toBeNull();
    });
  });

  it("uses thumbnail URL when the game has one", () => {
    const game = makeGame({ thumbnailUrl: "https://example.com/art.jpg" });
    const opts = makeOpts({ favorites: [game] });
    const el   = buildHighlightsPanel(opts)!;
    const img  = el.querySelector<HTMLImageElement>(".highlights-fav-card__cover");
    expect(img).not.toBeNull();
    expect(img!.src).toContain("art.jpg");
  });
});

// ── Accessibility: emoji in headings ──────────────────────────────────────────

describe("buildHighlightsPanel — accessibility", () => {
  it("wraps the Favorites heading icon with aria-hidden SVG", () => {
    const opts = makeOpts({ favorites: [makeGame()] });
    const el   = buildHighlightsPanel(opts)!;
    const h3   = el.querySelector(".highlights-section--favorites h3")!;
    const icon = h3.querySelector<HTMLElement>(".highlights-section__title-icon[aria-hidden='true']");
    expect(icon).not.toBeNull();
    expect(icon!.querySelector("svg")).not.toBeNull();
    // The visible text should still include "Favorites"
    expect(h3.textContent).toContain("Favorites");
  });
});
