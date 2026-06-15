import { describe, expect, it, vi } from "vitest";
import { CompanionSource } from "./companionSource.js";

function res(init: { ok?: boolean; status?: number; json?: unknown; blob?: Blob }): Response {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => init.json,
    blob: async () => init.blob ?? new Blob(),
  } as unknown as Response;
}

const library = {
  version: 1,
  games: [{ id: "h1", name: "Game", fileName: "game.sfc", systemId: "snes", size: 10 }],
};

describe("CompanionSource", () => {
  it("derives a source id from the base url and strips a trailing slash", () => {
    expect(new CompanionSource("http://server/").id).toBe("companion:http://server");
    expect(new CompanionSource("http://server").kind).toBe("companion");
  });

  it("lists games mapped to metadata", async () => {
    const fetchImpl = vi.fn(async () => res({ json: library }));
    const src = new CompanionSource("http://server", { fetchImpl });
    const games = await src.listGames();
    expect(fetchImpl).toHaveBeenCalledWith("http://server/library", { headers: {} });
    expect(games[0]).toMatchObject({ id: "h1", systemId: "snes", contentHash: "h1", hasLocalBlob: false });
  });

  it("sends a bearer token when configured", async () => {
    const fetchImpl = vi.fn(async () => res({ json: library }));
    await new CompanionSource("http://server", { fetchImpl, token: "secret" }).listGames();
    expect(fetchImpl).toHaveBeenCalledWith("http://server/library", {
      headers: { Authorization: "Bearer secret" },
    });
  });

  it("throws on a non-ok library or an unexpected shape", async () => {
    const bad = new CompanionSource("http://s", { fetchImpl: async () => res({ ok: false, status: 500 }) });
    await expect(bad.listGames()).rejects.toThrow(/500/);
    const shape = new CompanionSource("http://s", { fetchImpl: async () => res({ json: { nope: true } }) });
    await expect(shape.listGames()).rejects.toThrow(/unexpected shape/);
  });

  it("returns a blob and null on 404", async () => {
    const blob = new Blob(["rom"]);
    const ok = new CompanionSource("http://s", { fetchImpl: async () => res({ blob }) });
    expect(await ok.getGameBlob("h1")).toBe(blob);
    const missing = new CompanionSource("http://s", { fetchImpl: async () => res({ ok: false, status: 404 }) });
    expect(await missing.getGameBlob("h1")).toBeNull();
  });

  it("encodes the game id in blob/cover requests", async () => {
    const fetchImpl = vi.fn(async () => res({ blob: new Blob() }));
    await new CompanionSource("http://s", { fetchImpl }).getGameBlob("a/b id");
    expect(fetchImpl).toHaveBeenCalledWith("http://s/blob/a%2Fb%20id", { headers: {} });
  });

  it("getCoverArt returns null when the response is not ok", async () => {
    const missing = new CompanionSource("http://s", { fetchImpl: async () => res({ ok: false, status: 404 }) });
    expect(await missing.getCoverArt("h1")).toBeNull();
  });
});
