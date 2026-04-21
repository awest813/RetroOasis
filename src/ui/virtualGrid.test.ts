/**
 * virtualGrid.test.ts — Unit tests for the VirtualGrid windowed renderer.
 *
 * jsdom cannot compute CSS layout, so all tests inject fixed values for
 * column count and row height via the `getColumns` / `getRowHeight` options.
 * `requestAnimationFrame` is replaced with a synchronous stub so that
 * `_scheduleUpdate` fires immediately.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { VirtualGrid, VIRTUAL_THRESHOLD, OVERSCAN_ROWS } from "./virtualGrid.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a minimal DOM environment sufficient for VirtualGrid. */
function makeEnv(itemCount = 0) {
  const scrollEl  = document.createElement("div");
  const container = document.createElement("div");
  scrollEl.appendChild(container);
  document.body.appendChild(scrollEl);

  // Simulate a 800×600 viewport for the scroll container
  Object.defineProperty(scrollEl, "clientHeight", { value: 600, configurable: true });
  Object.defineProperty(scrollEl, "scrollTop",    { value: 0,   configurable: true, writable: true });

  const items = Array.from({ length: itemCount }, (_, i) => `item-${i}`);

  return { scrollEl, container, items };
}

function makeGrid(opts: {
  items: string[];
  scrollEl: HTMLElement;
  container: HTMLElement;
  columns?: number;
  rowHeight?: number;
}) {
  return new VirtualGrid<string>({
    container:    opts.container,
    scrollEl:     opts.scrollEl,
    items:        opts.items,
    buildItem:    (item) => {
      const el = document.createElement("div");
      el.className = "game-card";
      el.textContent = item;
      // Simulate a measured height so _measureRowHeight can return non-zero
      Object.defineProperty(el, "offsetHeight", { value: opts.rowHeight ?? 200, configurable: true });
      return el;
    },
    getColumns:   () => opts.columns ?? 4,
    getRowHeight: () => opts.rowHeight ?? 200,
  });
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  // Make requestAnimationFrame synchronous so _scheduleUpdate fires immediately
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

// ── Spacer injection ──────────────────────────────────────────────────────────

describe("VirtualGrid — spacer injection", () => {
  it("appends two .vg-spacer elements to the container on construction", () => {
    const { scrollEl, container, items } = makeEnv(10);
    const grid = makeGrid({ scrollEl, container, items });

    const spacers = container.querySelectorAll(".vg-spacer");
    expect(spacers.length).toBe(2);

    grid.destroy();
  });

  it("removes spacers on destroy", () => {
    const { scrollEl, container, items } = makeEnv(10);
    const grid = makeGrid({ scrollEl, container, items });

    grid.destroy();

    const spacers = container.querySelectorAll(".vg-spacer");
    expect(spacers.length).toBe(0);
  });
});

// ── Initial render ────────────────────────────────────────────────────────────

describe("VirtualGrid — initial render", () => {
  it("renders cards for items that fit in the initial seed window", () => {
    const { scrollEl, container, items } = makeEnv(50);
    // 4 columns × 3 seed rows = 12 items initially rendered
    const grid = makeGrid({ scrollEl, container, items, columns: 4, rowHeight: 200 });

    const cards = container.querySelectorAll(".game-card");
    expect(cards.length).toBeGreaterThan(0);

    grid.destroy();
  });

  it("renders all items when count is below threshold", () => {
    const count = 10;
    const { scrollEl, container, items } = makeEnv(count);
    const grid = makeGrid({ scrollEl, container, items, columns: 4, rowHeight: 200 });

    // After rowHeight is known (200 > 0) the visible window covers all items
    const cards = container.querySelectorAll(".game-card");
    expect(cards.length).toBe(count);

    grid.destroy();
  });

  it("does not render all items for a very large list", () => {
    const { scrollEl, container, items } = makeEnv(500);
    const grid = makeGrid({ scrollEl, container, items, columns: 4, rowHeight: 200 });

    const cards = container.querySelectorAll(".game-card");
    // 600px viewport / 200px rowHeight = 3 visible rows + 2 overscan above/below
    // = (3 + 2 * OVERSCAN_ROWS) rows max = (3 + 4) × 4 columns = 28 max items
    expect(cards.length).toBeLessThan(500);

    grid.destroy();
  });
});

// ── Spacer heights ────────────────────────────────────────────────────────────

describe("VirtualGrid — spacer heights", () => {
  it("sets bottom-spacer height when not all items are rendered", () => {
    const { scrollEl, container, items } = makeEnv(500);
    const grid = makeGrid({ scrollEl, container, items, columns: 4, rowHeight: 200 });

    const [, bottomSpacer] = container.querySelectorAll<HTMLElement>(".vg-spacer");
    const bottomH = parseInt(bottomSpacer!.style.height ?? "0", 10);
    expect(bottomH).toBeGreaterThan(0);

    grid.destroy();
  });

  it("sets top-spacer height to 0 when at the start of the list", () => {
    const { scrollEl, container, items } = makeEnv(500);
    const grid = makeGrid({ scrollEl, container, items, columns: 4, rowHeight: 200 });

    const [topSpacer] = container.querySelectorAll<HTMLElement>(".vg-spacer");
    const topH = parseInt(topSpacer!.style.height ?? "0", 10);
    expect(topH).toBe(0);

    grid.destroy();
  });
});

// ── setItems ──────────────────────────────────────────────────────────────────

describe("VirtualGrid.setItems", () => {
  it("replaces rendered cards with the new item set", () => {
    const { scrollEl, container, items } = makeEnv(10);
    const grid = makeGrid({ scrollEl, container, items });

    const newItems = ["a", "b", "c"];
    grid.setItems(newItems);

    const cards = container.querySelectorAll(".game-card");
    expect(cards.length).toBe(3);
    expect(cards[0]!.textContent).toBe("a");

    grid.destroy();
  });

  it("clears the grid when called with an empty array", () => {
    const { scrollEl, container, items } = makeEnv(10);
    const grid = makeGrid({ scrollEl, container, items });

    grid.setItems([]);

    const cards = container.querySelectorAll(".game-card");
    expect(cards.length).toBe(0);

    grid.destroy();
  });
});

// ── destroy ───────────────────────────────────────────────────────────────────

describe("VirtualGrid.destroy", () => {
  it("removes all rendered cards from the container", () => {
    const { scrollEl, container, items } = makeEnv(10);
    const grid = makeGrid({ scrollEl, container, items });

    grid.destroy();

    const cards = container.querySelectorAll(".game-card");
    expect(cards.length).toBe(0);
  });

  it("can be called multiple times without error", () => {
    const { scrollEl, container, items } = makeEnv(5);
    const grid = makeGrid({ scrollEl, container, items });

    expect(() => {
      grid.destroy();
      grid.destroy();
    }).not.toThrow();
  });
});

// ── Constants ─────────────────────────────────────────────────────────────────

describe("VirtualGrid constants", () => {
  it("VIRTUAL_THRESHOLD is a positive integer", () => {
    expect(Number.isInteger(VIRTUAL_THRESHOLD)).toBe(true);
    expect(VIRTUAL_THRESHOLD).toBeGreaterThan(0);
  });

  it("OVERSCAN_ROWS is a non-negative integer", () => {
    expect(Number.isInteger(OVERSCAN_ROWS)).toBe(true);
    expect(OVERSCAN_ROWS).toBeGreaterThanOrEqual(0);
  });
});
