import { describe, it, expect } from "vitest";
import {
  libretroDbNameToSystemId,
  mergeLibretroCoreExtensions,
  SYSTEM_ID_TO_LIBRETRO_MATCHING_CONSOLE,
} from "./libretroCoreInfo.js";

describe("libretroCoreInfo", () => {
  it("maps libretro db_name values to system ids", () => {
    expect(libretroDbNameToSystemId("Sony - PlayStation")).toBe("psx");
    expect(libretroDbNameToSystemId("Nintendo - Nintendo 3DS")).toBe("3ds");
  });

  it("merges extra core-info extensions", () => {
    expect(mergeLibretroCoreExtensions("segaDC", ["gdi", "cue"])).toEqual(
      expect.arrayContaining(["gdi", "cue", "dat", "lst"]),
    );
  });

  it("exposes matching-server console slugs for supported systems", () => {
    expect(SYSTEM_ID_TO_LIBRETRO_MATCHING_CONSOLE.nes).toBe("FC");
    expect(SYSTEM_ID_TO_LIBRETRO_MATCHING_CONSOLE.psp).toBe("PSP");
    expect(SYSTEM_ID_TO_LIBRETRO_MATCHING_CONSOLE.gba).toBe("GBA");
  });

  it("does not map unsupported libretro db_name values", () => {
    expect(libretroDbNameToSystemId("Nintendo - Virtual Boy")).toBeUndefined();
  });
});
