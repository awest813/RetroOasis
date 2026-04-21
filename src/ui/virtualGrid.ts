/**
 * virtualGrid.ts — Windowed virtual grid for the game library
 *
 * Renders only the cards that are near the viewport, replacing the rest with
 * invisible spacer elements that preserve the total scroll height.  This keeps
 * DOM node count low even when a library contains hundreds of games.
 *
 * Architecture
 * ─────────────
 * The host element (`container`) must already be a CSS Grid.  Two spacer
 * `<div>` nodes that span all grid columns are injected as the first and last
 * children:
 *
 *   container
 *     ├─ .vg-spacer (top)    ← height = rows-above × rowHeight
 *     ├─ <card> …            ← only visible rows rendered here
 *     └─ .vg-spacer (bottom) ← height = rows-below × rowHeight
 *
 * Row height and column count are either supplied by the caller (useful in
 * tests) or measured from the DOM after the first batch renders.
 *
 * Usage
 * ─────
 *   const grid = new VirtualGrid({
 *     container:   gridEl,
 *     scrollEl:    landingEl,
 *     items:       displayedGames,
 *     buildItem:   (game, i) => buildGameCard(game, …),
 *   });
 *
 *   // When the filtered/sorted list changes:
 *   grid.setItems(newDisplayedGames);
 *
 *   // When no longer needed (route change, rebuild):
 *   grid.destroy();
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface VirtualGridOpts<T> {
  /** The CSS-Grid container element (i.e. `#library-grid`). */
  container: HTMLElement;
  /** The scrollable ancestor element (i.e. `#landing`). */
  scrollEl: HTMLElement;
  /** The initial set of items to render. */
  items: T[];
  /**
   * Factory that produces an HTMLElement for a single item.
   * Called only for items in the current visible window.
   */
  buildItem: (item: T, index: number) => HTMLElement;
  /**
   * Optional override for column-count detection.
   * When omitted the grid measures `gridTemplateColumns` from computed style.
   * Provide a fixed value in tests where jsdom cannot compute CSS layout.
   */
  getColumns?: () => number;
  /**
   * Optional override for row-height measurement.
   * When omitted the grid measures the first rendered card's `offsetHeight`.
   * Provide a fixed value in tests where jsdom always reports 0.
   */
  getRowHeight?: () => number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Extra rows to render above and below the visible viewport. */
export const OVERSCAN_ROWS = 2;

/**
 * Minimum item count before virtual scrolling activates.
 * Below this threshold the grid renders all items at once (no overhead).
 */
export const VIRTUAL_THRESHOLD = 100;

/** CSS class applied to the top and bottom spacer elements. */
const SPACER_CLASS = "vg-spacer";

// ── VirtualGrid ───────────────────────────────────────────────────────────────

export class VirtualGrid<T> {
  private readonly _container: HTMLElement;
  private readonly _scrollEl: HTMLElement;
  private readonly _getColumns: () => number;
  private readonly _getRowHeight: () => number;

  private _items: T[];
  private _buildItem: (item: T, index: number) => HTMLElement;

  /** Column count derived from the container's computed style. */
  private _columns = 1;
  /** Row height in px (including gap). 0 = not yet measured. */
  private _rowHeight = 0;

  /** Map from item index → currently-rendered HTMLElement. */
  private readonly _live = new Map<number, HTMLElement>();
  /** Index of the first item currently in the DOM. */
  private _domStart = 0;
  /** Index one past the last item currently in the DOM. */
  private _domEnd = 0;

  private readonly _topSpacer: HTMLDivElement;
  private readonly _bottomSpacer: HTMLDivElement;

  private _rafId: number | null = null;
  /** Guards _scheduleUpdate against duplicate queuing (distinct from _rafId so
   *  synchronous rAF stubs used in tests don't leave a stale non-null _rafId). */
  private _rafPending = false;
  /** Set to true by destroy() to prevent callbacks from running after teardown. */
  private _destroyed = false;

  // Cleanup callbacks registered in the constructor
  private readonly _teardowns: Array<() => void> = [];

  constructor(opts: VirtualGridOpts<T>) {
    this._container = opts.container;
    this._scrollEl  = opts.scrollEl;
    this._items     = opts.items;
    this._buildItem = opts.buildItem;

    // Column / row-height getters (injectable for testing)
    this._getColumns   = opts.getColumns   ?? (() => this._measureColumns());
    this._getRowHeight = opts.getRowHeight ?? (() => this._measureRowHeight());

    // Create spacers
    this._topSpacer    = document.createElement("div");
    this._bottomSpacer = document.createElement("div");
    this._topSpacer.className    = SPACER_CLASS;
    this._bottomSpacer.className = SPACER_CLASS;
    // Each spacer spans all grid columns so it collapses to zero width and
    // does not occupy a grid cell, only a full "row" of height.
    this._topSpacer.style.gridColumn    = "1 / -1";
    this._bottomSpacer.style.gridColumn = "1 / -1";
    this._container.appendChild(this._topSpacer);
    this._container.appendChild(this._bottomSpacer);

    // Scroll listener
    const onScroll = () => this._scheduleUpdate();
    this._scrollEl.addEventListener("scroll", onScroll, { passive: true });
    this._teardowns.push(() => this._scrollEl.removeEventListener("scroll", onScroll));

    // ResizeObserver to respond to viewport / container size changes
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => {
        this._columns   = this._getColumns();
        this._rowHeight = 0; // force re-measure after resize
        this._scheduleUpdate();
      });
      ro.observe(this._container);
      this._teardowns.push(() => ro.disconnect());
    }

    // Initial render
    this._columns = this._getColumns();
    this._scheduleUpdate();
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Replace the item set with a new list (e.g. after search / sort change).
   * Clears all rendered cards and triggers a fresh render pass.
   */
  setItems(items: T[]): void {
    this._items     = items;
    this._rowHeight = 0; // re-measure for new items
    this._clearLive();
    this._scheduleUpdate();
  }

  /**
   * Remove all DOM side-effects (spacers, event listeners, RAF).
   * Must be called before discarding the instance.
   */
  destroy(): void {
    this._destroyed = true;
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    this._rafPending = false;
    for (const fn of this._teardowns) fn();
    this._clearLive();
    this._topSpacer.remove();
    this._bottomSpacer.remove();
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private _scheduleUpdate(): void {
    if (this._rafPending || this._destroyed) return;
    this._rafPending = true;
    this._rafId = requestAnimationFrame(() => {
      this._rafPending = false;
      this._rafId = null;
      if (!this._destroyed) this._update();
    });
  }

  /**
   * Read the number of grid columns from the container's computed style.
   * Returns 1 as a safe fallback when the value cannot be determined.
   */
  private _measureColumns(): number {
    const tpl = getComputedStyle(this._container).gridTemplateColumns;
    if (!tpl || tpl === "none" || tpl === "") return 1;
    // Each column token is a length (e.g. "170px") separated by spaces.
    const count = tpl.split(" ").filter(s => s.trim().length > 0).length;
    return Math.max(1, count);
  }

  /**
   * Measure row height from the first rendered card.
   * Returns 0 when no card is in the DOM yet (caller must retry).
   */
  private _measureRowHeight(): number {
    const card = this._container.querySelector<HTMLElement>(
      `.game-card:not(.${SPACER_CLASS})`,
    );
    if (!card || card.offsetHeight === 0) return 0;
    const gap = parseInt(getComputedStyle(this._container).gap ?? "0", 10) || 0;
    return card.offsetHeight + gap;
  }

  /**
   * Compute the vertical offset of the grid container from the top of the
   * scroll container, walking up the offsetParent chain.
   */
  private _containerOffsetTop(): number {
    let el: HTMLElement | null = this._container;
    let top = 0;
    while (el && el !== this._scrollEl) {
      top += el.offsetTop;
      el = el.offsetParent as HTMLElement | null;
    }
    return top;
  }

  private _clearLive(): void {
    for (const el of this._live.values()) el.remove();
    this._live.clear();
    this._domStart = 0;
    this._domEnd   = 0;
  }

  private _update(): void {
    if (this._items.length === 0) {
      this._topSpacer.style.height    = "0";
      this._bottomSpacer.style.height = "0";
      this._clearLive();
      return;
    }

    // ── Row-height bootstrap ───────────────────────────────────────────────
    if (this._rowHeight === 0) {
      // Render the first few rows so we can measure a real card height.
      const seed = Math.min(this._items.length, this._columns * 3);
      this._renderRange(0, seed);
      // Schedule a measurement on the next animation frame (after layout).
      requestAnimationFrame(() => {
        this._rowHeight = this._getRowHeight();
        if (this._rowHeight > 0) this._update();
      });
      return;
    }

    // ── Compute visible window ─────────────────────────────────────────────
    const scrollTop     = this._scrollEl.scrollTop;
    const viewH         = this._scrollEl.clientHeight;
    const containerTop  = this._containerOffsetTop();
    const localScroll   = Math.max(0, scrollTop - containerTop);

    const totalRows    = Math.ceil(this._items.length / this._columns);
    const firstVisRow  = Math.max(0, Math.floor(localScroll / this._rowHeight) - OVERSCAN_ROWS);
    const lastVisRow   = Math.min(
      totalRows,
      Math.ceil((localScroll + viewH) / this._rowHeight) + OVERSCAN_ROWS,
    );

    const start = firstVisRow * this._columns;
    const end   = Math.min(this._items.length, lastVisRow * this._columns);

    this._renderRange(start, end);
  }

  private _renderRange(start: number, end: number): void {
    if (start === this._domStart && end === this._domEnd) return;

    const totalRows  = Math.ceil(this._items.length / this._columns);
    const topRows    = Math.floor(start / this._columns);
    const bottomRows = Math.max(0, totalRows - Math.ceil(end / this._columns));

    this._topSpacer.style.height    = `${topRows    * this._rowHeight}px`;
    this._bottomSpacer.style.height = `${bottomRows * this._rowHeight}px`;

    // Determine which indices to add and which to remove
    const toRemove = new Set<number>();
    for (const i of this._live.keys()) {
      if (i < start || i >= end) toRemove.add(i);
    }
    for (const i of toRemove) {
      this._live.get(i)!.remove();
      this._live.delete(i);
    }

    // Insert new items in ascending index order so CSS Grid places them correctly
    for (let i = start; i < end; i++) {
      if (this._live.has(i)) continue;
      const el  = this._buildItem(this._items[i]!, i);
      const ref = this._findNextLiveAfter(i) ?? this._bottomSpacer;
      this._container.insertBefore(el, ref);
      this._live.set(i, el);
    }

    this._domStart = start;
    this._domEnd   = end;
  }

  /**
   * Return the DOM element of the smallest live index > `idx`, or `null`
   * when no such element exists.  Used to find the correct insertion point.
   */
  private _findNextLiveAfter(idx: number): HTMLElement | null {
    let next = idx + 1;
    while (next < this._items.length) {
      const el = this._live.get(next);
      if (el) return el;
      next++;
    }
    return null;
  }
}
