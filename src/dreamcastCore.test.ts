import { describe, it, expect } from "vitest";
import {
  withDreamcastCoreAliases,
  syncDreamcastCoreAliases,
  isDreamcastGdiSelection,
  isDreamcastGdiPackageMember,
  isDreamcastVmuFileName,
  applyDreamcastVmuCoreOptions,
} from "./dreamcastCore.js";

describe("withDreamcastCoreAliases", () => {
  it("mirrors flycast keys to reicast aliases", () => {
    const out = withDreamcastCoreAliases({
      flycast_internal_resolution: "1280x960",
      flycast_dsp: "enabled",
    });
    expect(out.reicast_internal_resolution).toBe("1280x960");
    expect(out.reicast_enable_dsp).toBe("enabled");
  });
});

describe("syncDreamcastCoreAliases", () => {
  it("updates reicast keys in place when flycast settings change", () => {
    const settings: Record<string, string> = {
      flycast_mipmapping: "disabled",
      flycast_dsp: "disabled",
    };
    syncDreamcastCoreAliases(settings);
    expect(settings.reicast_mipmapping).toBe("disabled");
    expect(settings.reicast_enable_dsp).toBe("disabled");
  });
});

describe("VMU helpers", () => {
  it("detects Flycast VMU filenames", () => {
    expect(isDreamcastVmuFileName("MK-51000.A1.bin")).toBe(true);
    expect(isDreamcastVmuFileName("vmu_save_default.bin")).toBe(true);
    expect(isDreamcastVmuFileName("dc_boot.bin")).toBe(false);
  });

  it("applies per-game VMU core options with reicast aliases", () => {
    const settings: Record<string, string> = {};
    applyDreamcastVmuCoreOptions(settings);
    expect(settings.flycast_per_content_vmus).toBe("VMU A1");
    expect(settings.reicast_per_content_vmus).toBe("VMU A1");
  });
});

describe("GDI import helpers", () => {
  it("detects a GDI plus track file selection", () => {
    expect(isDreamcastGdiSelection([
      { name: "game.gdi" },
      { name: "track1.bin" },
    ])).toBe(true);
    expect(isDreamcastGdiSelection([{ name: "game.gdi" }])).toBe(false);
  });

  it("filters package members but excludes unrelated cue files", () => {
    expect(isDreamcastGdiPackageMember({ name: "game.gdi" })).toBe(true);
    expect(isDreamcastGdiPackageMember({ name: "track1.bin" })).toBe(true);
    expect(isDreamcastGdiPackageMember({ name: "disc.cue" })).toBe(false);
  });
});
