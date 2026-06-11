import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { VmuSaveLibrary } from "./vmuSaves.js";
import { VmuSaveService, type VmuSaveRuntime } from "./vmuSaveService.js";
import type { CoreBridge } from "./emulator.js";

function makeBridge(files: Record<string, Uint8Array>): CoreBridge {
  const store = new Map(Object.entries(files));
  return {
    isReady: true,
    fs: {
      exists: (path: string) => path === "/data/saves" || store.has(path),
      read: (path: string) => store.get(path) ?? new Uint8Array(),
      write: (path: string, data: Uint8Array) => { store.set(path, data); },
      mkdir: () => {},
      unlink: (path: string) => { store.delete(path); },
      readdir: (path: string) => {
        if (path !== "/data/saves") return [];
        return [...store.keys()]
          .map((full) => full.replace("/data/saves/", ""))
          .filter((name) => name.length > 0);
      },
      stat: () => null,
    },
    readFileAsync: async (path: string) => store.get(path) ?? null,
    writeFileAsync: async (path: string, data: Uint8Array) => {
      store.set(path, data);
      return true;
    },
  } as unknown as CoreBridge;
}

describe("VmuSaveService", () => {
  let vmuLibrary: VmuSaveLibrary;
  let runtime: VmuSaveRuntime;

  beforeEach(async () => {
    vmuLibrary = new VmuSaveLibrary();
    await vmuLibrary.clearAll();
    runtime = {
      bridge: null,
      flushInGameSaves: vi.fn(),
      reloadInGameSaves: vi.fn(),
    };
  });

  it("captures VMU files from the emulator VFS into IndexedDB", async () => {
    runtime.bridge = makeBridge({
      "/data/saves/MK-51000.A1.bin": new Uint8Array([1, 2, 3]),
    });
    const service = new VmuSaveService({ vmuLibrary, emulator: runtime });
    const written = await service.captureForGame("dc-game");
    expect(written).toBe(1);
    expect(runtime.flushInGameSaves).toHaveBeenCalled();
    const stored = await vmuLibrary.getFilesForGame("dc-game");
    expect(stored.get("MK-51000.A1.bin")).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("restores stored VMU files into the emulator VFS", async () => {
    await vmuLibrary.upsertFiles("dc-game", new Map([
      ["MK-51000.A1.bin", new Uint8Array([4, 5, 6])],
    ]));
    const bridge = makeBridge({});
    runtime.bridge = bridge;
    const service = new VmuSaveService({ vmuLibrary, emulator: runtime });
    const ok = await service.restoreForGame("dc-game");
    expect(ok).toBe(true);
    const data = await bridge.readFileAsync("/data/saves/MK-51000.A1.bin");
    expect(data).toEqual(new Uint8Array([4, 5, 6]));
  });
});
