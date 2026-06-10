import { describe, it, expect } from "vitest";
import type { GameMetadata } from "../library.js";
import {
  resolveLibraryHeadline,
  getContinuePlayingGame,
  getRecentlyAddedGames,
  computeLibraryGridSignature,
  buildEmptyDetailsGuide,
  buildPlatformsStrip,
} from "./homepage.js";

function makeGame(overrides: Partial<GameMetadata> = {}): GameMetadata {
  return {
    id: "g1",
    name: "Test",
    fileName: "test.nes",
    systemId: "nes",
    addedAt: Date.now(),
    size: 1024,
    lastPlayedAt: null,
    ...overrides,
  };
}

describe("homepage helpers", () => {
  it("returns Welcome back when a game was played recently", () => {
    const games = [makeGame({ lastPlayedAt: Date.now() - 60_000 })];
    expect(resolveLibraryHeadline(games)).toBe("Welcome back");
  });

  it("returns My Library for an untouched collection", () => {
    expect(resolveLibraryHeadline([makeGame()])).toBe("My Library");
  });

  it("picks the most recently played game for continue hero", () => {
    const games = [
      makeGame({ id: "old", lastPlayedAt: Date.now() - 86_400_000 }),
      makeGame({ id: "new", lastPlayedAt: Date.now() - 1_000 }),
    ];
    expect(getContinuePlayingGame(games)?.id).toBe("new");
  });

  it("returns recently added games within the window", () => {
    const games = [
      makeGame({ id: "old", addedAt: Date.now() - 30 * 24 * 60 * 60 * 1000 }),
      makeGame({ id: "new", addedAt: Date.now() - 60_000 }),
    ];
    const recent = getRecentlyAddedGames(games);
    expect(recent.map((g) => g.id)).toEqual(["new"]);
  });

  it("builds a stable grid signature for unchanged filters", () => {
    const games = [makeGame({ id: "a" }), makeGame({ id: "b", systemId: "snes" })];
    const sigA = computeLibraryGridSignature({
      allGames: games,
      displayed: games,
      settings: { libraryLayout: "grid", libraryGrouped: false } as never,
      searchQuery: "",
      systemFilter: "",
      showFavorites: false,
      sortMode: "lastPlayed",
    });
    const sigB = computeLibraryGridSignature({
      allGames: games,
      displayed: games,
      settings: { libraryLayout: "grid", libraryGrouped: false } as never,
      searchQuery: "",
      systemFilter: "",
      showFavorites: false,
      sortMode: "lastPlayed",
    });
    expect(sigA).toBe(sigB);
  });

  it("builds an empty-state details guide", () => {
    const guide = buildEmptyDetailsGuide({
      onChooseRoms: () => {},
      onOpenHelp: () => {},
      onCloudSaves: () => {},
    });
    expect(guide.querySelector(".landing-details__guide-title")?.textContent).toContain("Getting started");
  });

  it("builds a featured platforms strip", () => {
    const strip = buildPlatformsStrip(() => "🎮");
    expect(strip.classList.contains("homepage-platforms")).toBe(true);
    expect(strip.querySelectorAll(".homepage-platforms__chip").length).toBeGreaterThan(5);
  });
});
