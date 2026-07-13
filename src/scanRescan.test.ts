import { describe, expect, it } from "vitest";
import type { ScanPlan, ScannedFile } from "./directoryScan.js";
import {
  filterToNewOrChanged,
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

describe("signaturesForPaths", () => {
  it("returns signatures only for the requested paths", () => {
    const p = plan([scanned("snes/a.sfc", 4, 1), scanned("snes/b.sfc", 4, 1)]);
    const one = signaturesForPaths(p, ["snes/a.sfc"]);
    const both = signaturesForPaths(p, ["snes/a.sfc", "snes/b.sfc"]);
    expect(one).toHaveLength(1);
    expect(both).toHaveLength(2);
    expect(both[0]).toBe(one[0]);
    expect(both[0]).not.toBe(both[1]);
  });

  it("changes signature when path, size, or mtime change", () => {
    const base = signaturesForPaths(plan([scanned("snes/a.sfc", 4, 100)]), ["snes/a.sfc"])[0]!;
    const diffSize = signaturesForPaths(plan([scanned("snes/a.sfc", 8, 100)]), ["snes/a.sfc"])[0]!;
    const diffTime = signaturesForPaths(plan([scanned("snes/a.sfc", 4, 200)]), ["snes/a.sfc"])[0]!;
    const diffPath = signaturesForPaths(plan([scanned("nes/a.sfc", 4, 100)]), ["nes/a.sfc"])[0]!;
    expect(new Set([base, diffSize, diffTime, diffPath]).size).toBe(4);
  });
});

describe("filterToNewOrChanged", () => {
  it("keeps only files whose signature is unknown and counts the rest", () => {
    const p = plan([
      scanned("snes/a.sfc", 4, 1),
      scanned("snes/b.sfc", 4, 1),
      scanned("snes/c.sfc", 4, 1),
    ]);
    const known = new Set(signaturesForPaths(plan([scanned("snes/a.sfc", 4, 1)]), ["snes/a.sfc"]));

    const diff = filterToNewOrChanged(p, known);
    expect(diff.unchanged).toBe(1);
    expect(diff.plan.files.map((f) => f.relativePath)).toEqual(["snes/b.sfc", "snes/c.sfc"]);
    expect(diff.plan.totalBytes).toBe(8);
    expect(diff.plan.skipped).toEqual([]); // re-scan drops skipped entries
  });

  it("treats a changed mtime as a new file", () => {
    const p = plan([scanned("snes/a.sfc", 4, 999)]);
    const known = new Set(signaturesForPaths(plan([scanned("snes/a.sfc", 4, 1)]), ["snes/a.sfc"]));
    const diff = filterToNewOrChanged(p, known);
    expect(diff.unchanged).toBe(0);
    expect(diff.plan.files).toHaveLength(1);
  });

  it("returns an empty plan when everything is known", () => {
    const p = plan([scanned("snes/a.sfc", 4, 1)]);
    const known = new Set(signaturesForPaths(p, ["snes/a.sfc"]));
    const diff = filterToNewOrChanged(p, known);
    expect(diff.plan.files).toHaveLength(0);
    expect(diff.unchanged).toBe(1);
  });
});
