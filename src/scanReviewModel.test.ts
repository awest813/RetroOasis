import { describe, expect, it } from "vitest";
import type { ScanPlan, ScannedFile } from "./directoryScan.js";
import {
  buildScanReviewModel,
  resolveScannedImports,
} from "./scanReviewModel.js";

function scanned(
  relativePath: string,
  inferredSystemId: string | null,
  size = 10,
  inferenceSource: ScannedFile["inferenceSource"] = "folder",
): ScannedFile {
  return {
    file: new File([new Uint8Array(size)], relativePath.split("/").pop()!),
    relativePath,
    size,
    inferredSystemId,
    inferenceSource,
  };
}

function plan(files: ScannedFile[], skipped: ScanPlan["skipped"] = []): ScanPlan {
  return { files, skipped, totalBytes: 0, truncated: false };
}

describe("buildScanReviewModel", () => {
  it("groups files by inferred system and sorts known systems before the null bucket", () => {
    const model = buildScanReviewModel(plan([
      scanned("snes/A.sfc", "snes", 10),
      scanned("nes/B.nes", "nes", 20),
      scanned("snes/C.sfc", "snes", 30),
      scanned("misc/D.iso", null, 40, "ambiguous"),
    ]));

    expect(model.groups.map((g) => g.systemId)).toEqual(["nes", "snes", null]);
    const snes = model.groups.find((g) => g.systemId === "snes")!;
    expect(snes.files).toHaveLength(2);
    expect(snes.totalBytes).toBe(40);
    expect(snes.label).toBe("Super Nintendo");
  });

  it("counts files needing a choice and excludes them from the import byte total", () => {
    const model = buildScanReviewModel(plan([
      scanned("snes/A.sfc", "snes", 10),
      scanned("misc/B.iso", null, 999, "ambiguous"),
    ]));
    expect(model.needsChoiceCount).toBe(1);
    expect(model.totalFiles).toBe(2);
    expect(model.totalBytes).toBe(10); // null-bucket bytes excluded
  });

  it("summarises skipped files by reason", () => {
    const model = buildScanReviewModel(plan([], [
      { relativePath: "a.ips", reason: "patch" },
      { relativePath: "b.ips", reason: "patch" },
      { relativePath: "bios.bin", reason: "bios" },
    ]));
    const patch = model.skipped.find((s) => s.reason === "patch")!;
    expect(patch.count).toBe(2);
    expect(model.skipped.find((s) => s.reason === "bios")!.count).toBe(1);
  });
});

describe("resolveScannedImports", () => {
  const p = plan([
    scanned("snes/A.sfc", "snes"),
    scanned("misc/B.iso", null, 10, "ambiguous"),
  ]);

  it("uses the inferred system when no override is given", () => {
    const out = resolveScannedImports(p, new Map());
    expect(out).toEqual([
      expect.objectContaining({ relativePath: "snes/A.sfc", systemId: "snes" }),
    ]);
  });

  it("applies a user override, including resolving a previously-ambiguous file", () => {
    const out = resolveScannedImports(p, new Map([["misc/B.iso", "psx"]]));
    expect(out.map((i) => i.relativePath).sort()).toEqual(["misc/B.iso", "snes/A.sfc"]);
    expect(out.find((i) => i.relativePath === "misc/B.iso")!.systemId).toBe("psx");
  });

  it("drops files explicitly skipped (null) or resolving to an unknown system", () => {
    const out = resolveScannedImports(p, new Map([
      ["snes/A.sfc", null],
      ["misc/B.iso", "not-a-real-system"],
    ]));
    expect(out).toHaveLength(0);
  });
});
