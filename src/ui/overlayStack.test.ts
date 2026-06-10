import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  registerOverlay,
  isTopmostOverlay,
  closeTopmostOverlay,
  hasActiveOverlay,
  _resetOverlayStackForTests,
} from "./overlayStack.js";

describe("overlayStack", () => {
  beforeEach(() => {
    _resetOverlayStackForTests();
  });

  it("tracks topmost overlay in registration order", () => {
    const a = document.createElement("div");
    const b = document.createElement("div");
    registerOverlay({ element: a, close: vi.fn() });
    registerOverlay({ element: b, close: vi.fn() });

    expect(isTopmostOverlay(a)).toBe(false);
    expect(isTopmostOverlay(b)).toBe(true);
    expect(hasActiveOverlay()).toBe(true);
  });

  it("closes only the topmost overlay", () => {
    const closeA = vi.fn();
    const closeB = vi.fn();
    registerOverlay({ element: document.createElement("div"), close: closeA });
    registerOverlay({ element: document.createElement("div"), close: closeB });

    expect(closeTopmostOverlay()).toBe(true);
    expect(closeB).toHaveBeenCalledOnce();
    expect(closeA).not.toHaveBeenCalled();
    expect(closeTopmostOverlay()).toBe(true);
    expect(closeA).toHaveBeenCalledOnce();
    expect(hasActiveOverlay()).toBe(false);
  });

  it("unregisters overlays when dispose is called", () => {
    const el = document.createElement("div");
    const dispose = registerOverlay({ element: el, close: vi.fn() });
    dispose();
    expect(hasActiveOverlay()).toBe(false);
    expect(isTopmostOverlay(el)).toBe(false);
  });
});
