import { describe, expect, it } from "vitest";
import {
  LibrarySourceRegistry,
  getLibraryRegistry,
  mergeKey,
  _resetLibraryRegistryForTests,
  type LibrarySource,
  type LibrarySourceKind,
} from "./librarySource.js";
import type { GameMetadata } from "./library.js";

function game(id: string, extra: Partial<GameMetadata> = {}): GameMetadata {
  return {
    id,
    name: id,
    fileName: `${id}.sfc`,
    systemId: "snes",
    size: 1,
    addedAt: 1,
    lastPlayedAt: null,
    ...extra,
  } as GameMetadata;
}

function fakeSource(
  id: string,
  kind: LibrarySourceKind,
  games: GameMetadata[],
  opts: { throwOnList?: boolean; blobs?: Record<string, Blob>; covers?: Record<string, Blob> } = {},
): LibrarySource {
  return {
    id,
    kind,
    listGames: async () => {
      if (opts.throwOnList) throw new Error("boom");
      return games;
    },
    getGameBlob: async (gameId) => opts.blobs?.[gameId] ?? null,
    getCoverArt: async (gameId) => opts.covers?.[gameId] ?? null,
  };
}

describe("mergeKey", () => {
  it("keys by content hash when present, else by id", () => {
    expect(mergeKey(game("a", { contentHash: "h1" } as Partial<GameMetadata>))).toBe("hash:h1");
    expect(mergeKey(game("a"))).toBe("id:a");
  });
});

describe("LibrarySourceRegistry", () => {
  it("registers, looks up, and unregisters sources", () => {
    const reg = new LibrarySourceRegistry();
    const local = fakeSource("local", "local", []);
    reg.register(local);
    expect(reg.has("local")).toBe(true);
    expect(reg.get("local")).toBe(local);
    reg.unregister("local");
    expect(reg.has("local")).toBe(false);
  });

  it("orders sources local-first regardless of registration order", () => {
    const reg = new LibrarySourceRegistry();
    reg.register(fakeSource("srv", "companion", []));
    reg.register(fakeSource("local", "local", []));
    expect(reg.list().map((s) => s.id)).toEqual(["local", "srv"]);
  });

  it("merges games across sources and tags each with its source id", async () => {
    const reg = new LibrarySourceRegistry();
    reg.register(fakeSource("local", "local", [game("a")]));
    reg.register(fakeSource("srv", "companion", [game("b")]));
    const merged = await reg.listGames();
    expect(merged.map((g) => `${g.sourceId}:${g.id}`).sort()).toEqual(["local:a", "srv:b"]);
  });

  it("dedupes by content hash with the local source winning", async () => {
    const reg = new LibrarySourceRegistry();
    reg.register(fakeSource("srv", "companion", [game("server-id", { contentHash: "h" } as Partial<GameMetadata>)]));
    reg.register(fakeSource("local", "local", [game("local-id", { contentHash: "h" } as Partial<GameMetadata>)]));
    const merged = await reg.listGames();
    expect(merged).toHaveLength(1);
    expect(merged[0]!.sourceId).toBe("local");
    expect(merged[0]!.id).toBe("local-id");
  });

  it("keeps distinct games when no content hash is available", async () => {
    const reg = new LibrarySourceRegistry();
    reg.register(fakeSource("local", "local", [game("x")]));
    reg.register(fakeSource("srv", "companion", [game("y")]));
    expect(await reg.listGames()).toHaveLength(2);
  });

  it("skips a source that throws so the rest still list", async () => {
    const reg = new LibrarySourceRegistry();
    reg.register(fakeSource("local", "local", [game("a")]));
    reg.register(fakeSource("srv", "companion", [], { throwOnList: true }));
    const merged = await reg.listGames();
    expect(merged.map((g) => g.id)).toEqual(["a"]);
  });

  it("routes blob and cover fetches to the owning source", async () => {
    const reg = new LibrarySourceRegistry();
    const blob = new Blob(["rom"]);
    const cover = new Blob(["art"]);
    reg.register(fakeSource("srv", "companion", [game("g")], { blobs: { g: blob }, covers: { g: cover } }));
    expect(await reg.getGameBlob("srv", "g")).toBe(blob);
    expect(await reg.getCoverArt("srv", "g")).toBe(cover);
    expect(await reg.getGameBlob("missing", "g")).toBeNull();
  });
});

describe("getLibraryRegistry singleton", () => {
  it("returns a stable instance, resettable for tests", () => {
    _resetLibraryRegistryForTests();
    const a = getLibraryRegistry();
    expect(getLibraryRegistry()).toBe(a);
    _resetLibraryRegistryForTests();
    expect(getLibraryRegistry()).not.toBe(a);
  });
});
