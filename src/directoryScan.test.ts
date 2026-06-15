import { describe, expect, it } from "vitest";
import {
  buildScanPlan,
  entriesFromFileList,
  type DirectoryEntry,
  type ScannedFile,
} from "./directoryScan.js";

function file(name: string, size = 8): File {
  return new File([new Uint8Array(size)], name);
}

function entry(relativePath: string, size = 8): DirectoryEntry {
  const base = relativePath.slice(relativePath.lastIndexOf("/") + 1);
  return { file: file(base, size), relativePath };
}

function byPath(files: ScannedFile[], path: string): ScannedFile | undefined {
  return files.find((f) => f.relativePath === path);
}

describe("buildScanPlan — system inference", () => {
  it("infers the system from the containing folder", async () => {
    const plan = await buildScanPlan([entry("snes/Chrono Trigger (USA).sfc")]);
    const f = byPath(plan.files, "snes/Chrono Trigger (USA).sfc")!;
    expect(f.inferredSystemId).toBe("snes");
    expect(f.inferenceSource).toBe("folder");
  });

  it("lets the folder override a conflicting extension", async () => {
    // .sfc reads as SNES, but the folder says N64 — folder wins.
    const plan = await buildScanPlan([entry("n64/weird.sfc")]);
    const f = byPath(plan.files, "n64/weird.sfc")!;
    expect(f.inferredSystemId).toBe("n64");
    expect(f.inferenceSource).toBe("folder");
  });

  it("falls back to the extension when the folder is unknown", async () => {
    const plan = await buildScanPlan([entry("misc/Mario.nes")]);
    const f = byPath(plan.files, "misc/Mario.nes")!;
    expect(f.inferredSystemId).toBe("nes");
    expect(f.inferenceSource).toBe("extension");
  });

  it("marks ambiguous extensions for user choice", async () => {
    // .iso maps to several disc systems and no folder hint disambiguates.
    const plan = await buildScanPlan([entry("stuff/Game.iso")]);
    const f = byPath(plan.files, "stuff/Game.iso")!;
    expect(f.inferredSystemId).toBeNull();
    expect(f.inferenceSource).toBe("ambiguous");
  });

  it("uses a header fingerprint for extensionless files", async () => {
    const nes = new File([new Uint8Array([0x4e, 0x45, 0x53, 0x1a, 0, 0, 0, 0])], "rom");
    const plan = await buildScanPlan([{ file: nes, relativePath: "dump/rom" }]);
    const f = byPath(plan.files, "dump/rom")!;
    expect(f.inferredSystemId).toBe("nes");
    expect(f.inferenceSource).toBe("header");
  });

  it("leaves truly unknown files without a system", async () => {
    const plan = await buildScanPlan([entry("dump/mystery.qqq")]);
    const f = byPath(plan.files, "dump/mystery.qqq")!;
    expect(f.inferredSystemId).toBeNull();
    expect(f.inferenceSource).toBe("unknown");
  });

  it("treats archives as game candidates, not folders to descend", async () => {
    const plan = await buildScanPlan([entry("snes/Pack.zip")]);
    const f = byPath(plan.files, "snes/Pack.zip")!;
    expect(f.inferredSystemId).toBe("snes");
    expect(plan.skipped).toHaveLength(0);
  });
});

describe("buildScanPlan — classification of non-game files", () => {
  it("routes known BIOS filenames to the skipped/bios bucket", async () => {
    const plan = await buildScanPlan([entry("psx/scph1001.bin")]);
    expect(plan.files).toHaveLength(0);
    expect(plan.skipped).toContainEqual({ relativePath: "psx/scph1001.bin", reason: "bios" });
  });

  it("skips ROM patches", async () => {
    const plan = await buildScanPlan([entry("snes/Hack.ips")]);
    expect(plan.skipped).toContainEqual({ relativePath: "snes/Hack.ips", reason: "patch" });
  });

  it("skips unsupported archive formats", async () => {
    const plan = await buildScanPlan([entry("x/Game.zst")]);
    expect(plan.skipped).toContainEqual({ relativePath: "x/Game.zst", reason: "unsupported-archive" });
  });

  it("skips junk and hidden files", async () => {
    const plan = await buildScanPlan([
      entry("snes/readme.txt"),
      entry("snes/.DS_Store"),
      { file: file(".hidden"), relativePath: "snes/.hidden" },
    ]);
    expect(plan.files).toHaveLength(0);
    expect(plan.skipped.every((s) => s.reason === "junk")).toBe(true);
    expect(plan.skipped).toHaveLength(3);
  });
});

describe("buildScanPlan — disc sets", () => {
  it("keeps the sheet and skips sibling raw tracks", async () => {
    const plan = await buildScanPlan([
      entry("psx/FF7.cue"),
      entry("psx/FF7.bin", 64),
    ]);
    expect(byPath(plan.files, "psx/FF7.cue")).toBeDefined();
    expect(plan.skipped).toContainEqual({ relativePath: "psx/FF7.bin", reason: "disc-part" });
    // Skipped parts must not inflate the import byte total.
    expect(plan.totalBytes).toBe(8);
  });

  it("does not skip a .bin that has no sheet in its directory", async () => {
    const plan = await buildScanPlan([entry("loose/Game.bin")]);
    expect(plan.skipped.find((s) => s.reason === "disc-part")).toBeUndefined();
    expect(plan.files).toHaveLength(1);
  });
});

describe("buildScanPlan — totals and limits", () => {
  it("sums only the bytes of imported candidates", async () => {
    const plan = await buildScanPlan([
      entry("snes/A.sfc", 10),
      entry("snes/B.sfc", 20),
      entry("snes/notes.txt", 1000),
    ]);
    expect(plan.totalBytes).toBe(30);
  });

  it("truncates at maxFiles", async () => {
    const entries = Array.from({ length: 5 }, (_, i) => entry(`snes/g${i}.sfc`));
    const plan = await buildScanPlan(entries, { maxFiles: 3 });
    expect(plan.truncated).toBe(true);
    expect(plan.files.length + plan.skipped.length).toBe(3);
  });

  it("accepts async iterables", async () => {
    async function* gen(): AsyncGenerator<DirectoryEntry> {
      yield entry("snes/A.sfc");
      yield entry("nes/B.nes");
    }
    const plan = await buildScanPlan(gen());
    expect(plan.files).toHaveLength(2);
  });
});

describe("entriesFromFileList", () => {
  it("strips the root folder segment from webkitRelativePath", () => {
    const f = file("Game.sfc");
    Object.defineProperty(f, "webkitRelativePath", { value: "MyRoms/snes/Game.sfc" });
    const entries = entriesFromFileList([f]);
    expect(entries[0]!.relativePath).toBe("snes/Game.sfc");
  });

  it("falls back to the file name when no relative path is present", () => {
    const entries = entriesFromFileList([file("Game.sfc")]);
    expect(entries[0]!.relativePath).toBe("Game.sfc");
  });
});
