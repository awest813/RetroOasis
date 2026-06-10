import { describe, it, expect } from "vitest";
import type { GameMetadata } from "../library.js";
import {
  resolveLibraryHeadline,
  getContinuePlayingGame,
  buildPlatformsStrip,
} from "./homepage.js";

function makeGame(overrides: Partial<GameMetadata> = {}): GameMetadata {
  return {
    id: "g1",
    name: "Test",
    fileName: "test.nes",
    systemId: "nes",
    addedAt: Date.now(),
    sizeBytes: 1024,
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

  it("builds a featured platforms strip", () => {
    const strip = buildPlatformsStrip(() => "🎮");
    expect(strip.classList.contains("homepage-platforms")).toBe(true);
    expect(strip.querySelectorAll(".homepage-platforms__chip").length).toBeGreaterThan(5);
  });
});
