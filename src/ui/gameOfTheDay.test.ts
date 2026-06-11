import { describe, it, expect } from "vitest";
import type { GameMetadata } from "../library.js";
import {
  dateSeedForGameOfTheDay,
  pickGameOfTheDay,
} from "./gameOfTheDay.js";

function meta(id: string, overrides: Partial<GameMetadata> = {}): GameMetadata {
  return {
    id,
    name: `Game ${id}`,
    fileName: `${id}.gba`,
    systemId: "gba",
    size: 1024,
    addedAt: 1,
    lastPlayedAt: null,
    hasLocalBlob: true,
    hasCoverArt: false,
    isFavorite: false,
    ...overrides,
  };
}

describe("pickGameOfTheDay", () => {
  it("returns null for an empty library", () => {
    expect(pickGameOfTheDay([])).toBeNull();
  });

  it("is stable for the same UTC date and library", () => {
    const games = [meta("a"), meta("b"), meta("c"), meta("d")];
    const day = new Date("2026-06-11T12:00:00Z");
    const first = pickGameOfTheDay(games, day);
    const second = pickGameOfTheDay(games, day);
    expect(first?.id).toBe(second?.id);
  });

  it("can change pick on a different UTC day", () => {
    const games = [meta("a"), meta("b"), meta("c"), meta("d"), meta("e")];
    const d1 = pickGameOfTheDay(games, new Date("2026-06-11T00:00:00Z"));
    const d2 = pickGameOfTheDay(games, new Date("2026-06-12T00:00:00Z"));
    expect(d1).not.toBeNull();
    expect(d2).not.toBeNull();
    // Not guaranteed different for tiny pools, but seed should differ
    expect(dateSeedForGameOfTheDay(new Date("2026-06-11T00:00:00Z"))).not.toBe(
      dateSeedForGameOfTheDay(new Date("2026-06-12T00:00:00Z")),
    );
  });

  it("prefers playable games when available", () => {
    const games = [
      meta("local", { hasLocalBlob: true }),
      meta("remote", { hasLocalBlob: false, cloudId: "cloud-1", remotePath: "/rom.gba" }),
      meta("stub", { hasLocalBlob: false }),
    ];
    const pick = pickGameOfTheDay(games, new Date("2026-06-11T00:00:00Z"));
    expect(pick?.hasLocalBlob || pick?.cloudId).toBeTruthy();
  });
});
