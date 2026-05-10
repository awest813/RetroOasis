import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  isBrowserOnline,
  setNetworkDocumentState,
  subscribeToNetworkChanges,
} from "./connectivity.js";

describe("connectivity", () => {
  let onLineSpy: ReturnType<typeof vi.spyOn> | null = null;

  beforeEach(() => {
    document.documentElement.removeAttribute("data-network");
    document.documentElement.classList.remove("app-offline");
  });

  afterEach(() => {
    onLineSpy?.mockRestore();
    onLineSpy = null;
    document.documentElement.removeAttribute("data-network");
    document.documentElement.classList.remove("app-offline");
  });

  it("isBrowserOnline reads navigator.onLine", () => {
    onLineSpy = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    expect(isBrowserOnline()).toBe(true);
    onLineSpy.mockReturnValue(false);
    expect(isBrowserOnline()).toBe(false);
  });

  it("setNetworkDocumentState toggles dataset and app-offline class", () => {
    setNetworkDocumentState(true);
    expect(document.documentElement.dataset.network).toBe("online");
    expect(document.documentElement.classList.contains("app-offline")).toBe(false);

    setNetworkDocumentState(false);
    expect(document.documentElement.dataset.network).toBe("offline");
    expect(document.documentElement.classList.contains("app-offline")).toBe(true);
  });

  it("subscribeToNetworkChanges invokes immediately and on window events", () => {
    onLineSpy = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const seen: boolean[] = [];
    const unsub = subscribeToNetworkChanges((o) => seen.push(o));
    expect(seen).toEqual([true]);

    onLineSpy.mockReturnValue(false);
    window.dispatchEvent(new Event("offline"));
    expect(seen).toEqual([true, false]);

    onLineSpy.mockReturnValue(true);
    window.dispatchEvent(new Event("online"));
    expect(seen).toEqual([true, false, true]);

    unsub();
    onLineSpy.mockReturnValue(false);
    window.dispatchEvent(new Event("offline"));
    expect(seen).toEqual([true, false, true]);
  });

  it("unsubscribe stops handling further online/offline events", () => {
    onLineSpy = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const fn = vi.fn();
    const unsub = subscribeToNetworkChanges(fn);
    const callsAfterSubscribe = fn.mock.calls.length;
    expect(callsAfterSubscribe).toBeGreaterThanOrEqual(1);

    unsub();
    fn.mockClear();
    window.dispatchEvent(new Event("offline"));
    window.dispatchEvent(new Event("online"));
    expect(fn).not.toHaveBeenCalled();
  });
});
