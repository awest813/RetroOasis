import { describe, expect, it } from "vitest";
import type { ScanPlan, ScannedFile } from "./directoryScan.js";
import {
  fileSignature,
  filterToNewOrChanged,
  planSignatures,
  signaturesForPaths,
} from "./scanRescan.js";

function scanned(relativePath: string, size: number, lastModified: number): ScannedFile {
  const file = new File([new Uint8Array(size)], relativePath.split("/").pop()!, { lastModified });
  return {
    file,
    relativePath,
    size,
    inferredSystemId: "snes",
    inferenceSource: "folder",
  };
}

function plan(files: ScannedFile[]): ScanPlan {
  return { files, skipped: [{ relativePath: "x.ips", reason: "patch" }], totalBytes: 0, truncated: false };
}

describe("fileSignature", () => {
  it("changes when path, size, or mtime change", () => {
    const base = fileSignature(new File([new Uint8Array(4)], "a.sfc", { lastModified: 100 }), "snes/a.sfc");
    const diffSize = fileSignature(new File([new Uint8Array(8)], "a.sfc", { lastModified: 100 }), "snes/a.sfc");
    const diffTime = fileSignature(new File([new Uint8Array(4)], "a.sfc", { lastModified: 200 }), "snes/a.sfc");
    const diffPath = fileSignature(new File([new Uint8Array(4)], "a.sfc", { lastModified: 100 }), "nes/a.sfc");
    expect(new Set([base, diffSize, diffTime, diffPath]).size).toBe(4);
  });
});

describe("signaturesForPaths", () => {
  it("returns signatures only for the requested paths", () => {
    const p = plan([scanned("snes/a.sfc", 4, 1), scanned("snes/b.sfc", 4, 1)]);
    const sigs = signaturesForPaths(p, ["snes/a.sfc"]);
    expect(sigs).toEqual([fileSignature(p.files[0]!.file, "snes/a.sfc")]);
  });
});

describe("filterToNewOrChanged", () => {
  it("keeps only files whose signature is unknown and counts the rest", () => {
    const p = plan([
      scanned("snes/a.sfc", 4, 1),
      scanned("snes/b.sfc", 4, 1),
      scanned("snes/c.sfc", 4, 1),
    ]);
    const known = new Set(planSignatures(plan([scanned("snes/a.sfc", 4, 1)])));

    const diff = filterToNewOrChanged(p, known);
    expect(diff.unchanged).toBe(1);
    expect(diff.plan.files.map((f) => f.relativePath)).toEqual(["snes/b.sfc", "snes/c.sfc"]);
    expect(diff.plan.totalBytes).toBe(8);
    expect(diff.plan.skipped).toEqual([]); // re-scan drops skipped entries
  });

  it("treats a changed mtime as a new file", () => {
    const p = plan([scanned("snes/a.sfc", 4, 999)]);
    const known = new Set(planSignatures(plan([scanned("snes/a.sfc", 4, 1)])));
    const diff = filterToNewOrChanged(p, known);
    expect(diff.unchanged).toBe(0);
    expect(diff.plan.files).toHaveLength(1);
  });

  it("returns an empty plan when everything is known", () => {
    const p = plan([scanned("snes/a.sfc", 4, 1)]);
    const diff = filterToNewOrChanged(p, new Set(planSignatures(p)));
    expect(diff.plan.files).toHaveLength(0);
    expect(diff.unchanged).toBe(1);
  });
});
