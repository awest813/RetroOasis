import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { VmuSaveLibrary } from "./vmuSaves.js";
import { computeChecksum } from "./saves.js";

describe("VmuSaveLibrary", () => {
  let lib: VmuSaveLibrary;

  beforeEach(async () => {
    lib = new VmuSaveLibrary();
    await lib.clearAll();
  });

  it("stores and retrieves VMU files per game", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const written = await lib.upsertFiles("game-1", new Map([["MK-51000.A1.bin", bytes]]));
    expect(written).toBe(1);

    const restored = await lib.getFilesForGame("game-1");
    expect(restored.get("MK-51000.A1.bin")).toEqual(bytes);
  });

  it("skips writes when checksum is unchanged", async () => {
    const bytes = new Uint8Array([9, 9, 9]);
    expect(await lib.upsertFiles("game-1", new Map([["vmu_save_test.bin", bytes]]))).toBe(1);
    expect(await lib.upsertFiles("game-1", new Map([["vmu_save_test.bin", bytes]]))).toBe(0);
    expect(computeChecksum(bytes)).toBeTruthy();
  });

  it("lists metadata without loading blobs eagerly in the map API", async () => {
    await lib.upsertFiles("game-1", new Map([["MK-51000.A1.bin", new Uint8Array([0])]]));
    const meta = await lib.listMetadataForGame("game-1");
    expect(meta).toHaveLength(1);
    expect(meta[0]?.fileName).toBe("MK-51000.A1.bin");
    expect(meta[0]?.systemId).toBe("segaDC");
  });
});
