/**
 * libraryControls.ts — Library toolbar filter state, DOM sync, and event wiring.
 *
 * Extracted from src/ui.ts as part of the modularisation effort.
 */

import type { Settings } from "../types/settings.js";
import type { GameMetadata } from "../library.js";
import { getSystemById } from "../systems.js";
import { getProfileManager } from "../profileManager.js";
import { isGameVisibleForProfile } from "../profileGameTags.js";
import { createElement as make } from "./dom.js";

export type LibrarySortMode = "lastPlayed" | "name" | "added" | "system";

export interface LibraryControlsHost {
  openSettings?: (tab: string) => void;
  focusFirstCard: () => void | Promise<void>;
  scheduleRender: (debounceMs?: number) => void;
  resetFiltersAndRender: () => void;
  runBulkCoverFetch: (button: HTMLButtonElement) => void;
  onSettingsChange?: (patch: Partial<Settings>) => void;
  isBulkCoverBusy: () => boolean;
}

let searchQuery = "";
let sortMode: LibrarySortMode = "lastPlayed";
let systemFilter = "";
let showFavorites = false;
let lastLayout: Settings["libraryLayout"] = "grid";
let controlSettings: Settings | null = null;
let searchDebounce: ReturnType<typeof setTimeout> | null = null;
let renderSignature = "";
let controlsWired = false;
let renderHost: LibraryControlsHost | null = null;

export function getLibraryRenderSignature(): string {
  return renderSignature;
}

export function setLibraryRenderSignature(sig: string): void {
  renderSignature = sig;
}

export function resetLibraryControlsForDomRebuild(): void {
  if (searchDebounce !== null) {
    clearTimeout(searchDebounce);
    searchDebounce = null;
  }
  controlsWired = false;
  searchQuery = "";
  sortMode = "lastPlayed";
  systemFilter = "";
  showFavorites = false;
  renderSignature = "";
  renderHost = null;
}

export function setLibraryControlSettings(settings: Settings): void {
  controlSettings = settings;
}

export function setLibraryLastLayout(layout: Settings["libraryLayout"]): void {
  lastLayout = layout;
}

export function libraryInCleanBrowse(): boolean {
  return !searchQuery && !systemFilter && !showFavorites;
}

export function getLibrarySearchQuery(): string {
  return searchQuery;
}

export function getLibrarySystemFilter(): string {
  return systemFilter;
}

export function getLibrarySortMode(): LibrarySortMode {
  return sortMode;
}

export function isLibrarySystemFilterActive(id: string): boolean {
  return systemFilter === id;
}

export function toggleLibrarySystemFilter(id: string): void {
  systemFilter = systemFilter === id ? "" : id;
}

export function clearLibrarySystemFilter(): void {
  systemFilter = "";
}

export function pruneStaleSystemFilter(allGames: GameMetadata[]): void {
  if (!systemFilter) return;
  const presentSystemIds = new Set(allGames.map((g) => g.systemId));
  if (!presentSystemIds.has(systemFilter)) systemFilter = "";
}

export function resetToolbarFilters(): void {
  searchQuery = "";
  systemFilter = "";
  sortMode = "lastPlayed";
  showFavorites = false;
  syncLibraryControlState();
}

export function focusLibraryFavorites(): void {
  showFavorites = true;
  syncLibraryControlState();
}

export function computeLibraryRenderSignature(
  allGames: GameMetadata[],
  displayed: GameMetadata[],
  settings: Settings,
): string {
  const gameSig = displayed
    .map((g) =>
      `${g.id}:${g.lastPlayedAt ?? 0}:${g.isFavorite ? 1 : 0}:${g.hasCoverArt ? 1 : 0}:${g.thumbnailUrl ?? ""}`,
    )
    .join("|");
  return [
    allGames.length,
    gameSig,
    searchQuery,
    systemFilter,
    showFavorites ? 1 : 0,
    sortMode,
    settings.libraryLayout,
    settings.libraryGrouped ? 1 : 0,
  ].join(";");
}

export function applyLibraryFilters(games: GameMetadata[], settings: Settings): GameMetadata[] {
  let result = games;

  if (settings.profileLibraryFilter) {
    const profileId = getProfileManager().getActiveProfileId();
    if (profileId) {
      result = result.filter((g) => isGameVisibleForProfile(g.id, profileId, true));
    }
  }

  if (systemFilter) {
    result = result.filter((g) => g.systemId === systemFilter);
  }

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    result = result.filter((g) =>
      g.name.toLowerCase().includes(q) ||
      (getSystemById(g.systemId)?.name ?? "").toLowerCase().includes(q) ||
      g.systemId.toLowerCase().includes(q),
    );
  }

  if (showFavorites) {
    result = result.filter((g) => g.isFavorite);
  }

  switch (sortMode) {
    case "name":
      result = [...result].sort((a, b) => a.name.localeCompare(b.name));
      break;
    case "added":
      result = [...result].sort((a, b) => b.addedAt - a.addedAt);
      break;
    case "system":
      result = [...result].sort((a, b) => a.systemId.localeCompare(b.systemId) || a.name.localeCompare(b.name));
      break;
    case "lastPlayed":
    default:
      result = [...result].sort((a, b) => (b.lastPlayedAt ?? b.addedAt) - (a.lastPlayedAt ?? a.addedAt));
      break;
  }

  return result;
}

export function libraryHasActiveOverviewFilters(
  allGames: GameMetadata[],
  displayed: GameMetadata[],
): boolean {
  return (
    displayed.length !== allGames.length ||
    showFavorites ||
    !!searchQuery ||
    !!systemFilter ||
    controlSettings?.profileLibraryFilter === true
  );
}

export function syncLibraryProfileFilterChip(settings: Settings): void {
  const chip = document.getElementById("library-profile-filter");
  if (!chip) return;
  if (!settings.profileLibraryFilter) {
    chip.hidden = true;
    chip.textContent = "";
    return;
  }
  const pm = getProfileManager();
  const name = pm.getActiveProfileName();
  const color = pm.getActiveProfileColor();
  chip.hidden = false;
  chip.innerHTML = "";
  const dot = make("span", { class: "library-profile-filter__dot", "aria-hidden": "true" });
  dot.style.backgroundColor = color;
  chip.append(dot, document.createTextNode(`Profile: ${name}`));
  chip.title =
    "Library filtered to games tagged for this profile (plus untagged shared games). " +
    "Open Settings → Cloud Library → Profiles to change.";
}

export function syncLibraryControlState(host?: Pick<LibraryControlsHost, "isBulkCoverBusy"> | null): void {
  const searchEl = document.getElementById("library-search") as HTMLInputElement | null;
  const sortEl = document.getElementById("library-sort") as HTMLSelectElement | null;
  const clearBtn = document.getElementById("library-search-clear") as HTMLButtonElement | null;

  if (searchEl) searchEl.value = searchQuery;
  if (sortEl) sortEl.value = sortMode;
  if (clearBtn) clearBtn.hidden = searchQuery.length === 0;

  const favBtn = document.getElementById("library-fav-filter") as HTMLButtonElement | null;
  if (favBtn) {
    favBtn.classList.toggle("active", showFavorites);
    favBtn.setAttribute("aria-pressed", String(showFavorites));
  }

  const layoutContainer = document.getElementById("library-layouts");
  if (layoutContainer) {
    layoutContainer.querySelectorAll(".layout-btn").forEach((btn) => {
      const layout = btn.getAttribute("data-layout");
      btn.setAttribute("aria-checked", String(layout === lastLayout));
      btn.classList.toggle("active", layout === lastLayout);
    });
  }

  const resetBtn = document.getElementById("library-controls-reset") as HTMLButtonElement | null;
  if (resetBtn) {
    resetBtn.hidden = !(searchQuery || systemFilter || showFavorites);
  }

  const bulkBusy = host?.isBulkCoverBusy?.() ?? renderHost?.isBulkCoverBusy() ?? false;
  const fetchCoversBtn = document.getElementById("library-fetch-covers") as HTMLButtonElement | null;
  if (fetchCoversBtn && !bulkBusy) {
    const offline = typeof navigator !== "undefined" && !navigator.onLine;
    fetchCoversBtn.disabled = offline;
    fetchCoversBtn.title = offline
      ? "Requires an internet connection"
      : "Match games against online cover databases (Settings → Connections)";
    fetchCoversBtn.setAttribute(
      "aria-label",
      offline
        ? "Fetch missing cover art — unavailable while offline"
        : "Fetch missing cover art from online",
    );
  }
}

export function getLibraryFilterStateForCards(): { libraryShowFavorites: boolean } {
  return { libraryShowFavorites: showFavorites };
}

export function wireLibraryControls(host: LibraryControlsHost): void {
  if (controlsWired) return;
  renderHost = host;
  controlsWired = true;

  document.getElementById("btn-cloud-onboarding")
    ?.addEventListener("click", () => host.openSettings?.("cloud"));
  document.getElementById("btn-cloud-library-onboarding")
    ?.addEventListener("click", () => host.openSettings?.("cloudlibrary"));
  document.getElementById("btn-open-help-onboarding")
    ?.addEventListener("click", () => host.openSettings?.("help"));

  const searchEl = document.getElementById("library-search") as HTMLInputElement | null;
  const sortEl = document.getElementById("library-sort") as HTMLSelectElement | null;
  const clearBtn = document.getElementById("library-search-clear") as HTMLButtonElement | null;
  const resetBtn = document.getElementById("library-controls-reset") as HTMLButtonElement | null;

  syncLibraryControlState(host);

  resetBtn?.addEventListener("click", () => host.resetFiltersAndRender());

  const fetchCoversBtn = document.getElementById("library-fetch-covers") as HTMLButtonElement | null;
  fetchCoversBtn?.addEventListener("click", () => host.runBulkCoverFetch(fetchCoversBtn));

  searchEl?.addEventListener("input", () => {
    searchQuery = searchEl.value;
    syncLibraryControlState(host);
    host.scheduleRender(120);
  });
  searchEl?.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      void host.focusFirstCard();
      return;
    }
    if (event.key !== "Escape" || searchQuery.length === 0) return;
    event.preventDefault();
    searchQuery = "";
    syncLibraryControlState(host);
    host.scheduleRender();
  });

  sortEl?.addEventListener("change", () => {
    sortMode = sortEl.value as LibrarySortMode;
    syncLibraryControlState(host);
    host.scheduleRender();
  });

  clearBtn?.addEventListener("click", () => {
    if (!searchEl) return;
    searchQuery = "";
    searchEl.value = "";
    syncLibraryControlState(host);
    searchEl.focus();
    host.scheduleRender();
  });

  const favFilterBtn = document.getElementById("library-fav-filter");
  favFilterBtn?.addEventListener("click", () => {
    showFavorites = !showFavorites;
    syncLibraryControlState(host);
    host.scheduleRender();
  });

  document.querySelectorAll(".layout-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const layout = btn.getAttribute("data-layout") as Settings["libraryLayout"];
      if (layout) {
        host.onSettingsChange?.({ libraryLayout: layout });
        host.scheduleRender();
      }
    });
  });

  const layoutContainer = document.getElementById("library-layouts");
  layoutContainer?.addEventListener("keydown", (event: KeyboardEvent) => {
    const buttons = Array.from(layoutContainer.querySelectorAll<HTMLButtonElement>(".layout-btn"));
    if (buttons.length === 0) return;
    const current = buttons.findIndex((btn) => btn.getAttribute("aria-checked") === "true");
    let next = current;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      next = (current + 1) % buttons.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      next = (current - 1 + buttons.length) % buttons.length;
    } else if (event.key === "Home") {
      event.preventDefault();
      next = 0;
    } else if (event.key === "End") {
      event.preventDefault();
      next = buttons.length - 1;
    } else {
      return;
    }
    const layout = buttons[next]!.getAttribute("data-layout") as Settings["libraryLayout"];
    if (!layout) return;
    host.onSettingsChange?.({ libraryLayout: layout });
    host.scheduleRender();
    buttons[next]!.focus();
  });
}

/** Test helper — reset module state between unit tests. */
export function resetLibraryControlsForTests(): void {
  resetLibraryControlsForDomRebuild();
}
