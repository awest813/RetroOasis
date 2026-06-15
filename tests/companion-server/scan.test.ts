import { describe, expect, it } from "vitest";
// Reference companion server (plain ESM, typed via server/scan.d.mts).
import { inferSystem, scanRoms, defaultHash } from "../../server/scan.mjs";

function dirent(name: string, dir: boolean) {
  return { name, isDirectory: () => dir, isFile: () => !dir };
}

function fakeFs(
  dirs: Record<string, ReturnType<typeof dirent>[]>,
  sizes: Record<string, number>,
) {
  return {
    readdir: async (dir: string) => dirs[dir] ?? [],
    stat: async (p: string) => ({ size: sizes[p] ?? 0, mtimeMs: 1000 }),
  };
}

describe("inferSystem", () => {
  it("prefers the platform folder, falls back to extension", () => {
    expect(inferSystem("snes/Chrono.sfc")).toBe("snes");
    expect(inferSystem("PlayStation/FF7.bin")).toBe("psx");
    expect(inferSystem("loose/game.nes")).toBe("nes"); // unknown folder → extension
    expect(inferSystem("loose/notes.txt")).toBeNull();
  });
});

describe("scanRoms", () => {
  it("indexes games, infers systems, and skips junk", async () => {
    const fs = fakeFs(
      {
        "/roms": [dirent("snes", true), dirent("readme.txt", false)],
        "/roms/snes": [dirent("Chrono.sfc", false), dirent("art.png", false)],
      },
      { "/roms/snes/Chrono.sfc": 100 },
    );

    const result = await scanRoms("/roms", { fs });

    expect(result.games).toHaveLength(1);
    const game = result.games[0]!;
    expect(game.systemId).toBe("snes");
    expect(game.fileName).toBe("Chrono.sfc");
    expect(game.id).toBe(defaultHash("snes/Chrono.sfc", 100));
    expect(result.byId.get(game.id)?.absPath).toBe("/roms/snes/Chrono.sfc");
  });

  it("uses an injected hash function", async () => {
    const fs = fakeFs(
      { "/roms": [dirent("nes", true)], "/roms/nes": [dirent("Mario.nes", false)] },
      { "/roms/nes/Mario.nes": 8 },
    );
    const result = await scanRoms("/roms", { fs, hash: () => "fixed" });
    expect(result.games[0]!.id).toBe("fixed");
  });
});
