import { describe, it, expect, beforeEach, vi } from "vitest";
import type { GameMetadata } from "../library.js";
import type { Settings } from "../types/settings.js";
import { ApiKeyStore } from "../apiKeyStore.js";
import { getProfileManager, resetProfileManagerForTests } from "../profileManager.js";
import { setGameBacklogStatus } from "../profileBacklog.js";
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

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    clear: () => { map.clear(); },
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
  };
}

function makeSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    volume: 0.7,
    lastGameName: null,
    performanceMode: "auto",
    showFPS: false,
    showAudioVis: false,
    useWebGPU: false,
    postProcessEffect: "none",
    autoSaveEnabled: true,
    coreOptions: {},
    orientationLock: true,
    netplayEnabled: false,
    netplayServerUrl: "",
    netplayUsername: "",
    netplayIceServers: [],
    verboseLogging: false,
    cloudLibraries: [],
    libretroMatchingServerUrl: "",
    audioFilterType: "none",
    audioFilterCutoff: 10000,
    uiMode: "auto",
    theme: "premium",
    libraryLayout: "grid",
    libraryGrouped: false,
    recordPlayHistory: true,
    dynamicResolutionScaling: true,
    uiScale: 1,
    profileLibraryFilter: false,
    profileCloudBackupEncrypted: false,
    ...overrides,
  };
}

function wireTestControls(): void {
  document.body.innerHTML = `
    <input id="library-search" />
    <select id="library-sort">
      <option value="lastPlayed">Last played</option>
      <option value="name">Name</option>
    </select>
    <button id="library-search-clear"></button>
    <button id="library-fav-filter"></button>
    <button id="library-backlog-filter"></button>
    <button id="library-controls-reset"></button>
    <div id="library-layouts" role="radiogroup">
      <button class="layout-btn" data-layout="grid" role="radio" aria-checked="true"></button>
      <button class="layout-btn" data-layout="list" role="radio" aria-checked="false"></button>
      <button class="layout-btn" data-layout="compact" role="radio" aria-checked="false"></button>
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
    resetProfileManagerForTests();
    vi.unstubAllGlobals();
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

  it("changes layout with arrow keys on the radiogroup", () => {
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
    const layoutContainer = document.getElementById("library-layouts")!;
    layoutContainer.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(onSettingsChange).toHaveBeenCalledWith({ libraryLayout: "list" });
  });

  it("builds a stable render signature for unchanged state", () => {
    const games = [makeGame({ id: "a" }), makeGame({ id: "b", systemId: "snes" })];
    const sigA = computeLibraryRenderSignature(games, games, baseSettings);
    const sigB = computeLibraryRenderSignature(games, games, baseSettings);
    expect(sigA).toBe(sigB);
  });

  it("filters to the active profile backlog", () => {
    const storage = memoryStorage();
    vi.stubGlobal("localStorage", storage);
    const settings = makeSettings();
    const apiKeyStore = new ApiKeyStore({ storage: memoryStorage(), providers: [] });
    const pm = getProfileManager(storage);
    pm.ensureInitialized({ settings, apiKeyStore, onSettingsChange: (patch) => Object.assign(settings, patch) });
    setGameBacklogStatus("b", pm.getActiveProfileId(), true);

    wireTestControls();
    document.getElementById("library-backlog-filter")?.click();

    const games = [
      makeGame({ id: "a", name: "Alpha" }),
      makeGame({ id: "b", name: "Beta" }),
    ];
    expect(applyLibraryFilters(games, settings).map((g) => g.id)).toEqual(["b"]);
  });
});
