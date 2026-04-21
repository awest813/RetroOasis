/**
 * highlightsPanel.test.ts — Unit tests for the unified Favorites + Sessions feed.
 */

import { describe, it, expect, vi } from "vitest";
import {
  buildHighlightsPanel,
  MAX_FAVORITES,
  MAX_SESSIONS,
  type HighlightsPanelOpts,
} from "./highlightsPanel.js";
import type { GameMetadata } from "../library.js";
import type { PlaySession } from "../sessionTracker.js";

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

function makeSession(overrides: Partial<PlaySession> = {}): PlaySession {
  return {
    id:         overrides.id         ?? "sess-1",
    gameId:     overrides.gameId     ?? "game-1",
    gameName:   overrides.gameName   ?? "Test Game",
    systemId:   overrides.systemId   ?? "nes",
    startedAt:  overrides.startedAt  ?? 1_000_000,
    endedAt:    overrides.endedAt    ?? 1_010_000,
    durationMs: overrides.durationMs ?? 10_000,
  };
}

function makeOpts(overrides: Partial<HighlightsPanelOpts> = {}): HighlightsPanelOpts {
  return {
    favorites:          overrides.favorites          ?? [],
    recentSessions:     overrides.recentSessions     ?? [],
    allGames:           overrides.allGames           ?? [],
    getSystemIcon:      overrides.getSystemIcon      ?? (() => "🎮"),
    getSystemName:      overrides.getSystemName      ?? ((id) => id.toUpperCase()),
    formatRelativeTime: overrides.formatRelativeTime ?? (() => "3d ago"),
    formatPlayTime:     overrides.formatPlayTime     ?? (() => "10 min"),
    onPlayFavorite:     overrides.onPlayFavorite     ?? vi.fn(),
    onPlaySession:      overrides.onPlaySession      ?? vi.fn(),
  };
}

// ── buildHighlightsPanel ──────────────────────────────────────────────────────

describe("buildHighlightsPanel", () => {
  it("returns null when both favorites and sessions are empty", () => {
    const result = buildHighlightsPanel(makeOpts());
    expect(result).toBeNull();
  });

  it("returns an HTMLElement when there are favorites", () => {
    const opts = makeOpts({ favorites: [makeGame()] });
    const el   = buildHighlightsPanel(opts);
    expect(el).not.toBeNull();
    expect(el).toBeInstanceOf(HTMLElement);
  });

  it("returns an HTMLElement when there are sessions", () => {
    const game    = makeGame();
    const session = makeSession({ gameId: game.id });
    const opts    = makeOpts({
      recentSessions: [session],
      allGames:       [game],
    });
    const el = buildHighlightsPanel(opts);
    expect(el).not.toBeNull();
    expect(el).toBeInstanceOf(HTMLElement);
  });

  it("renders both sections when both favorites and sessions are present", () => {
    const game    = makeGame({ isFavorite: true });
    const session = makeSession({ gameId: game.id });
    const opts    = makeOpts({
      favorites:      [game],
      recentSessions: [session],
      allGames:       [game],
    });
    const el = buildHighlightsPanel(opts)!;
    expect(el.querySelector(".highlights-section--favorites")).not.toBeNull();
    expect(el.querySelector(".highlights-section--sessions")).not.toBeNull();
  });

  it("renders only the favorites section when sessions are empty", () => {
    const opts = makeOpts({ favorites: [makeGame()] });
    const el   = buildHighlightsPanel(opts)!;
    expect(el.querySelector(".highlights-section--favorites")).not.toBeNull();
    expect(el.querySelector(".highlights-section--sessions")).toBeNull();
  });

  it("renders only the sessions section when favorites are empty", () => {
    const game    = makeGame();
    const session = makeSession({ gameId: game.id });
    const opts    = makeOpts({
      recentSessions: [session],
      allGames:       [game],
    });
    const el = buildHighlightsPanel(opts)!;
    expect(el.querySelector(".highlights-section--favorites")).toBeNull();
    expect(el.querySelector(".highlights-section--sessions")).not.toBeNull();
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

  it("uses thumbnail URL when the game has one", () => {
    const game = makeGame({ thumbnailUrl: "https://example.com/art.jpg" });
    const opts = makeOpts({ favorites: [game] });
    const el   = buildHighlightsPanel(opts)!;
    const img  = el.querySelector<HTMLImageElement>(".highlights-fav-card__cover");
    expect(img).not.toBeNull();
    expect(img!.src).toContain("art.jpg");
  });
});

// ── Sessions section ──────────────────────────────────────────────────────────

describe("buildHighlightsPanel — sessions section", () => {
  it("renders an entry for each session", () => {
    const game     = makeGame();
    const sessions = [
      makeSession({ id: "s1", gameId: game.id }),
      makeSession({ id: "s2", gameId: game.id }),
    ];
    const opts = makeOpts({ recentSessions: sessions, allGames: [game] });
    const el   = buildHighlightsPanel(opts)!;
    expect(el.querySelectorAll(".highlights-session-entry").length).toBe(2);
  });

  it("caps displayed sessions at MAX_SESSIONS", () => {
    const game     = makeGame();
    const sessions = Array.from({ length: MAX_SESSIONS + 3 }, (_, i) =>
      makeSession({ id: `s${i}`, gameId: game.id }),
    );
    const opts = makeOpts({ recentSessions: sessions, allGames: [game] });
    const el   = buildHighlightsPanel(opts)!;
    expect(el.querySelectorAll(".highlights-session-entry").length).toBe(MAX_SESSIONS);
  });

  it("shows the game name in each session entry", () => {
    const game    = makeGame({ name: "Mega Man X" });
    const session = makeSession({ gameName: "Mega Man X", gameId: game.id });
    const opts    = makeOpts({ recentSessions: [session], allGames: [game] });
    const el      = buildHighlightsPanel(opts)!;
    const entry   = el.querySelector(".highlights-session-entry")!;
    expect(entry.textContent).toContain("Mega Man X");
  });

  it("marks entries as gone when game is not in allGames", () => {
    const session = makeSession({ gameId: "missing-game", gameName: "Ghost Game" });
    const opts    = makeOpts({ recentSessions: [session], allGames: [] });
    const el      = buildHighlightsPanel(opts)!;
    const entry   = el.querySelector(".highlights-session-entry")!;
    expect(entry.classList.contains("highlights-session-entry--gone")).toBe(true);
  });

  it("calls onPlaySession with the game when entry is clicked", () => {
    const game         = makeGame();
    const session      = makeSession({ gameId: game.id });
    const onPlaySession = vi.fn();
    const opts         = makeOpts({
      recentSessions: [session],
      allGames:       [game],
      onPlaySession,
    });
    const el    = buildHighlightsPanel(opts)!;
    const entry = el.querySelector<HTMLElement>(".highlights-session-entry")!;

    entry.click();

    expect(onPlaySession).toHaveBeenCalledOnce();
    expect(onPlaySession).toHaveBeenCalledWith(game, session);
  });

  it("calls onPlaySession with null when game is gone and entry is clicked", () => {
    const session      = makeSession({ gameId: "gone-game" });
    const onPlaySession = vi.fn();
    const opts         = makeOpts({
      recentSessions: [session],
      allGames:       [],
      onPlaySession,
    });
    const el    = buildHighlightsPanel(opts)!;
    // Gone entries have tabindex="-1" and no click handler registered
    const entry = el.querySelector<HTMLElement>(".highlights-session-entry--gone")!;
    expect(entry).not.toBeNull();
    // Clicking a gone entry should NOT invoke the callback
    entry.click();
    expect(onPlaySession).not.toHaveBeenCalled();
  });

  it("calls formatPlayTime with session durationMs", () => {
    const game            = makeGame();
    const session         = makeSession({ gameId: game.id, durationMs: 12_000 });
    const formatPlayTime  = vi.fn(() => "custom-time");
    const opts            = makeOpts({
      recentSessions: [session],
      allGames:       [game],
      formatPlayTime,
    });
    buildHighlightsPanel(opts);
    expect(formatPlayTime).toHaveBeenCalledWith(12_000);
  });

  it("calls formatRelativeTime with session endedAt", () => {
    const game               = makeGame();
    const session            = makeSession({ gameId: game.id, endedAt: 9_999_999 });
    const formatRelativeTime = vi.fn(() => "just now");
    const opts               = makeOpts({
      recentSessions: [session],
      allGames:       [game],
      formatRelativeTime,
    });
    buildHighlightsPanel(opts);
    expect(formatRelativeTime).toHaveBeenCalledWith(9_999_999);
  });
});
