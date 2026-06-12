import { describe, it, expect } from "vitest";
import {
  findLargeN3dsPackageEntry,
  largeN3dsArchiveErrorMessage,
  LARGE_N3DS_ARCHIVE_ENTRY_BYTES,
} from "./n3dsImportGuards.js";

describe("n3dsImportGuards", () => {
  it("flags large 3DS package entries", () => {
    const hit = findLargeN3dsPackageEntry([
      { name: "readme.txt", size: 100 },
      { name: "game.3ds", size: LARGE_N3DS_ARCHIVE_ENTRY_BYTES },
    ]);
    expect(hit?.name).toBe("game.3ds");
  });

  it("ignores small 3DS entries", () => {
    expect(findLargeN3dsPackageEntry([
      { name: "small.3ds", size: 1024 },
    ])).toBeNull();
  });

  it("builds a user-facing error message", () => {
    const msg = largeN3dsArchiveErrorMessage("zip", "pack.zip", {
      name: "big.cci",
      size: LARGE_N3DS_ARCHIVE_ENTRY_BYTES,
    });
    expect(msg).toContain("pack.zip");
    expect(msg).toContain("Extract the archive");
  });
});
