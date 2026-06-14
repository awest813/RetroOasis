import { describe, expect, it, vi } from "vitest";
import { importScannedFiles } from "./gameImport.js";
import type { GameLibrary } from "../../library.js";

function imp(name: string, systemId: string) {
  return { file: new File([new Uint8Array(4)], name), systemId, relativePath: name };
}

/** Minimal GameLibrary stub exposing only count(), which is all the glue uses. */
function libraryWithCounts(counts: number[]): GameLibrary {
  const queue = [...counts];
  return { count: vi.fn(async () => queue.shift() ?? 0) } as unknown as GameLibrary;
}

describe("importScannedFiles", () => {
  it("counts new games via library size deltas and reports progress", async () => {
    // before/after pairs: 0->1 (added), 1->1 (skipped/dup)
    const library = libraryWithCounts([0, 1, 1, 1]);
    const addOne = vi.fn(async () => {});
    const progress: number[] = [];

    const result = await importScannedFiles(
      [imp("a.sfc", "snes"), imp("b.sfc", "snes")],
      addOne,
      library,
      (p) => progress.push(p.done),
    );

    expect(addOne).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ added: 1, skipped: 1, failed: 0 });
    expect(progress[progress.length - 1]).toBe(2); // final done === total
  });

  it("records failures without aborting the batch", async () => {
    // bad item still reads a "before" count before throwing; good item: 0 -> 1.
    const library = libraryWithCounts([0, 0, 1]);
    const addOne = vi.fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(undefined);

    const result = await importScannedFiles(
      [imp("bad.sfc", "snes"), imp("good.sfc", "snes")],
      addOne,
      library,
    );

    expect(addOne).toHaveBeenCalledTimes(2);
    expect(result.failed).toBe(1);
    expect(result.added).toBe(1);
  });

  it("passes the chosen system id through to the importer", async () => {
    const library = libraryWithCounts([0, 1]);
    const addOne = vi.fn(async () => {});
    await importScannedFiles([imp("g.iso", "psx")], addOne, library);
    expect(addOne).toHaveBeenCalledWith(expect.any(File), "psx");
  });
});
