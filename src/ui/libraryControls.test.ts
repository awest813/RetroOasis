import { describe, it, expect, beforeEach, vi } from "vitest";
import type { GameMetadata } from "../library.js";
import type { Settings } from "../types/settings.js";
import {
  applyLibraryFilters,
  computeLibraryRenderSignature,
  getLibrarySearchQuery,
  getLibrarySortMode,
  getLibrarySystemFilter,
  libraryInCleanBrowse,
  resetLibraryControlsForTests,
  resetToolbarFilters,
  toggleLibrarySystemFilter,
  wireLibraryControls,
} from "./libraryControls.js";

function makeGame(overrides: Partial<GameMetadata> = {}): GameMetadata {
  return {
    id: "g1",
    name: "Alpha",
    fileName: "alpha.nes",
    systemId: "nes",
    addedAt: 1000,
    size: 1024,
    lastPlayedAt: null,
    isFavorite: false,
    ...overrides,
  };
}

const baseSettings = {
  libraryLayout: "grid",
  libraryGrouped: false,
  profileLibraryFilter: false,
} as Settings;

function wireTestControls(): void {
  document.body.innerHTML = `
    <input id="library-search" />
    <select id="library-sort">
      <option value="lastPlayed">Last played</option>
      <option value="name">Name</option>
    </select>
    <button id="library-search-clear"></button>
    <button id="library-fav-filter"></button>
    <button id="library-controls-reset"></button>
    <div id="library-layouts">
      <button class="layout-btn" data-layout="grid"></button>
    </div>
  `;
  wireLibraryControls({
    focusFirstCard: () => {},
    scheduleRender: () => {},
    resetFiltersAndRender: () => {},
    runBulkCoverFetch: () => {},
    isBulkCoverBusy: () => false,
  });
}

describe("libraryControls", () => {
  beforeEach(() => {
    resetLibraryControlsForTests();
  });

  it("filters by search query and system", () => {
    wireTestControls();
    const games = [
      makeGame({ id: "a", name: "Mario", systemId: "nes" }),
      makeGame({ id: "b", name: "Sonic", systemId: "genesis" }),
    ];

    const searchEl = document.getElementById("library-search") as HTMLInputElement;
    searchEl.value = "mario";
    searchEl.dispatchEvent(new Event("input"));

    expect(getLibrarySearchQuery()).toBe("mario");
    expect(applyLibraryFilters(games, baseSettings).map((g) => g.id)).toEqual(["a"]);

    toggleLibrarySystemFilter("genesis");
    expect(getLibrarySystemFilter()).toBe("genesis");
    expect(applyLibraryFilters(games, baseSettings)).toEqual([]);
  });

  it("sorts by name when sort mode is name", () => {
    wireTestControls();
    const sortEl = document.getElementById("library-sort") as HTMLSelectElement;
    sortEl.value = "name";
    sortEl.dispatchEvent(new Event("change"));

    const games = [
      makeGame({ id: "z", name: "Zelda" }),
      makeGame({ id: "a", name: "Alpha" }),
    ];
    expect(getLibrarySortMode()).toBe("name");
    expect(applyLibraryFilters(games, baseSettings).map((g) => g.id)).toEqual(["a", "z"]);
  });

  it("resetToolbarFilters returns to clean browse state", () => {
    wireTestControls();
    toggleLibrarySystemFilter("nes");
    resetToolbarFilters();
    expect(libraryInCleanBrowse()).toBe(true);
    expect(getLibrarySystemFilter()).toBe("");
  });

  it("calls onSettingsChange when layout button is clicked", () => {
    const onSettingsChange = vi.fn();
    wireTestControls();
    resetLibraryControlsForTests();
    wireLibraryControls({
      focusFirstCard: () => {},
      scheduleRender: () => {},
      resetFiltersAndRender: () => {},
      runBulkCoverFetch: () => {},
      onSettingsChange,
      isBulkCoverBusy: () => false,
    });
    document.querySelector<HTMLButtonElement>('.layout-btn[data-layout="grid"]')?.click();
    expect(onSettingsChange).toHaveBeenCalledWith({ libraryLayout: "grid" });
  });

  it("builds a stable render signature for unchanged state", () => {
    const games = [makeGame({ id: "a" }), makeGame({ id: "b", systemId: "snes" })];
    const sigA = computeLibraryRenderSignature(games, games, baseSettings);
    const sigB = computeLibraryRenderSignature(games, games, baseSettings);
    expect(sigA).toBe(sigB);
  });
});
