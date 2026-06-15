import { describe, expect, it } from "vitest";
import {
  companionGameToMetadata,
  isCompanionLibraryResponse,
  type CompanionGame,
} from "./companionProtocol.js";

const game: CompanionGame = {
  id: "h1",
  name: "Chrono Trigger",
  fileName: "Chrono Trigger.sfc",
  systemId: "snes",
  size: 4194304,
};

describe("isCompanionLibraryResponse", () => {
  it("accepts a well-formed response", () => {
    expect(isCompanionLibraryResponse({ version: 1, games: [game] })).toBe(true);
    expect(isCompanionLibraryResponse({ version: 1, games: [] })).toBe(true);
  });

  it("rejects wrong version, missing games, or malformed entries", () => {
    expect(isCompanionLibraryResponse({ version: 2, games: [] })).toBe(false);
    expect(isCompanionLibraryResponse({ version: 1 })).toBe(false);
    expect(isCompanionLibraryResponse({ version: 1, games: [{ id: "x" }] })).toBe(false);
    expect(isCompanionLibraryResponse(null)).toBe(false);
    expect(isCompanionLibraryResponse("nope")).toBe(false);
  });
});

describe("companionGameToMetadata", () => {
  it("maps server fields and defaults", () => {
    const meta = companionGameToMetadata(game);
    expect(meta).toMatchObject({
      id: "h1",
      name: "Chrono Trigger",
      systemId: "snes",
      size: 4194304,
      lastPlayedAt: null,
      hasLocalBlob: false,
      hasCoverArt: false,
      contentHash: "h1", // defaults to id
      addedAt: 0,
    });
  });

  it("preserves an explicit content hash and addedAt", () => {
    const meta = companionGameToMetadata({ ...game, contentHash: "deadbeef", addedAt: 42 });
    expect(meta.contentHash).toBe("deadbeef");
    expect(meta.addedAt).toBe(42);
  });
});
