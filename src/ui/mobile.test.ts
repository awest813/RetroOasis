import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isTouchDevice,
  isPortrait,
  shouldApplyTouchUi,
  shouldShowRotateHint,
} from "./mobile.js";

describe("mobile helpers", () => {
  beforeEach(() => {
    vi.stubGlobal("matchMedia", vi.fn().mockImplementation((q: string) => ({
      matches: false,
      media: q,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("detects touch via maxTouchPoints", () => {
    Object.defineProperty(navigator, "maxTouchPoints", { value: 2, configurable: true });
    expect(isTouchDevice()).toBe(true);
  });

  it("detects portrait orientation", () => {
    vi.stubGlobal("matchMedia", vi.fn().mockImplementation((q: string) => ({
      matches: q.includes("portrait"),
      media: q,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })));
    expect(isPortrait()).toBe(true);
  });

  it("shows rotate hint only for in-game portrait touch sessions", () => {
    Object.defineProperty(navigator, "maxTouchPoints", { value: 1, configurable: true });
    vi.stubGlobal("matchMedia", vi.fn().mockImplementation((q: string) => ({
      matches: q.includes("portrait"),
      media: q,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })));

    expect(shouldShowRotateHint(true)).toBe(true);
    expect(shouldShowRotateHint(false)).toBe(false);
  });

  it("hides rotate hint on desktop even in portrait", () => {
    Object.defineProperty(navigator, "maxTouchPoints", { value: 0, configurable: true });
    vi.stubGlobal("matchMedia", vi.fn().mockImplementation((q: string) => ({
      matches: q.includes("portrait"),
      media: q,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })));

    expect(shouldShowRotateHint(true)).toBe(false);
  });

  it("applies touch UI in PWA standalone mode", () => {
    Object.defineProperty(navigator, "maxTouchPoints", { value: 0, configurable: true });
    vi.stubGlobal("matchMedia", vi.fn().mockImplementation((q: string) => ({
      matches: q.includes("standalone"),
      media: q,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })));

    expect(shouldApplyTouchUi()).toBe(true);
  });
});
