import { describe, it, expect } from "vitest";
import type { GameMetadata } from "../library.js";
import {
  dateSeedForGameOfTheDay,
  pickWikiGameOfTheDay,
  findWikiGameInLibrary,
} from "./gameOfTheDay.js";
import { WIKI_GAME_CATALOG } from "../wikiGameCatalog.js";

function meta(id: string, overrides: Partial<GameMetadata> = {}): GameMetadata {
  return {
    id,
    name: overrides.name ?? `Game ${id}`,
    fileName: `${id}.gba`,
    systemId: overrides.systemId ?? "gba",
    size: 1024,
    addedAt: 1,
    lastPlayedAt: null,
    hasLocalBlob: true,
    hasCoverArt: false,
    isFavorite: false,
    ...overrides,
  };
}

describe("pickWikiGameOfTheDay", () => {
  it("picks from the catalog deterministically per UTC day", () => {
    const day = new Date("2026-06-11T12:00:00Z");
    const first = pickWikiGameOfTheDay(day);
    const second = pickWikiGameOfTheDay(day);
    expect(first.wikiTitle).toBe(second.wikiTitle);
    expect(WIKI_GAME_CATALOG).toContainEqual(first);
  });

  it("uses different seeds on different days", () => {
    expect(dateSeedForGameOfTheDay(new Date("2026-06-11T00:00:00Z"))).not.toBe(
      dateSeedForGameOfTheDay(new Date("2026-06-12T00:00:00Z")),
    );
  });

  it("catalog spans Atari through 3DS eras", () => {
    const systems = new Set(WIKI_GAME_CATALOG.map((e) => e.systemId));
    expect(systems.has("atari2600")).toBe(true);
    expect(systems.has("nes")).toBe(true);
    expect(systems.has("snes")).toBe(true);
    expect(systems.has("gba")).toBe(true);
    expect(systems.has("n64")).toBe(true);
    expect(systems.has("psx")).toBe(true);
    expect(systems.has("nds")).toBe(true);
    expect(systems.has("3ds")).toBe(true);
  });
});

describe("findWikiGameInLibrary", () => {
  it("matches by normalized title on the same system", () => {
    const entry = { name: "Super Mario World", wikiTitle: "Super Mario World", systemId: "snes" };
    const games = [
      meta("a", { name: "Super Mario World", systemId: "snes" }),
      meta("b", { name: "Chrono Trigger", systemId: "snes" }),
    ];
    expect(findWikiGameInLibrary(entry, games)?.id).toBe("a");
  });

  it("returns null when no plausible match exists", () => {
    const entry = { name: "EarthBound", wikiTitle: "EarthBound", systemId: "snes" };
    expect(findWikiGameInLibrary(entry, [])).toBeNull();
  });
});
