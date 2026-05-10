import { describe, it, expect, afterEach, vi } from "vitest";
import {
  getEmulatorScreenPreset,
  syncEmulatorViewportLayout,
  __resetEmulatorViewportLayoutForTests,
} from "./emulatorDisplay.js";

describe("getEmulatorScreenPreset", () => {
  it("returns null when system id is missing", () => {
    expect(getEmulatorScreenPreset(null)).toBeNull();
    expect(getEmulatorScreenPreset(undefined)).toBeNull();
    expect(getEmulatorScreenPreset("")).toBeNull();
    expect(getEmulatorScreenPreset("   ")).toBeNull();
  });

  it("uses handheld / console-specific aspects", () => {
    expect(getEmulatorScreenPreset("gba")?.aspectRatio).toBe("3 / 2");
    expect(getEmulatorScreenPreset("gba")?.crispPixels).toBe(true);
    expect(getEmulatorScreenPreset("nds")?.aspectRatio).toBe("2 / 3");
    expect(getEmulatorScreenPreset("psx")?.aspectRatio).toBe("4 / 3");
    expect(getEmulatorScreenPreset("psp")?.aspectRatio).toBe("30 / 17");
  });

  it("falls back to 4:3 for unknown systems", () => {
    expect(getEmulatorScreenPreset("futureCore")?.aspectRatio).toBe("4 / 3");
  });
});

describe("syncEmulatorViewportLayout", () => {
  afterEach(() => {
    __resetEmulatorViewportLayoutForTests();
    vi.restoreAllMocks();
  });

  it("schedules only one window resize when invoked twice synchronously before rAF fires", () => {
    let raf: FrameRequestCallback | undefined;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb: FrameRequestCallback) => {
      raf = cb;
      return 0;
    });
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    const el = document.createElement("div");
    syncEmulatorViewportLayout(el, "gba");
    syncEmulatorViewportLayout(el, "nes");

    const resizeEvents = (): number =>
      dispatchSpy.mock.calls.filter((c) => (c[0] as Event).type === "resize").length;

    expect(resizeEvents()).toBe(0);
    expect(raf).toBeTypeOf("function");
    raf!(0);
    expect(resizeEvents()).toBe(1);
    expect(el.style.getPropertyValue("--emu-screen-ar").trim()).toBe("256 / 224");
  });

  it("sets data attributes and CSS variable when a system is active", () => {
    const el = document.createElement("div");
    syncEmulatorViewportLayout(el, "gba");
    expect(el.dataset.emuViewport).toBe("on");
    expect(el.dataset.emuPixelated).toBe("on");
    expect(el.style.getPropertyValue("--emu-screen-ar").trim()).toBe("3 / 2");
  });

  it("clears layout hooks when system is null", () => {
    const el = document.createElement("div");
    syncEmulatorViewportLayout(el, "gba");
    syncEmulatorViewportLayout(el, null);
    expect(el.hasAttribute("data-emu-viewport")).toBe(false);
    expect(el.hasAttribute("data-emu-pixelated")).toBe(false);
    expect(el.style.getPropertyValue("--emu-screen-ar")).toBe("");
  });
});
