import { describe, it, expect } from "vitest";
import {
  parseLibretroPlaylist,
  resolveSystemIdFromPlaylist,
  resolveSystemIdFromPlaylistItem,
  isRemotePlaylistPath,
} from "./libretroPlaylist.js";

describe("parseLibretroPlaylist", () => {
  it("parses a minimal RetroArch playlist", () => {
    const playlist = parseLibretroPlaylist(JSON.stringify({
      version: "1.5",
      items: [{
        path: "/roms/Super Mario World (USA).sfc",
        label: "Super Mario World",
        core_path: "DETECT",
        core_name: "DETECT",
        db_name: "Nintendo - Super Nintendo Entertainment System",
      }],
    }));
    expect(playlist?.items).toHaveLength(1);
    expect(playlist?.items[0]?.label).toBe("Super Mario World");
  });

  it("returns null for invalid JSON", () => {
    expect(parseLibretroPlaylist("not json")).toBeNull();
  });
});

describe("resolveSystemIdFromPlaylist", () => {
  it("maps db_name to RetroOasis systemId", () => {
    const playlist = parseLibretroPlaylist(JSON.stringify({
      items: [{
        path: "game.nes",
        label: "Game",
        db_name: "Nintendo - Nintendo Entertainment System",
      }],
    }));
    expect(resolveSystemIdFromPlaylist(playlist!)).toBe("nes");
  });

  it("falls back to core_name hints", () => {
    expect(resolveSystemIdFromPlaylistItem({
      path: "game.bin",
      label: "Game",
      coreName: "ppsspp",
    })).toBe("psp");
  });
});

describe("isRemotePlaylistPath", () => {
  it("detects http(s) paths", () => {
    expect(isRemotePlaylistPath("https://example.com/game.gba")).toBe(true);
    expect(isRemotePlaylistPath("C:\\roms\\game.gba")).toBe(false);
  });
});
