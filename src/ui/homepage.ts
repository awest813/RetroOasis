import type { GameMetadata } from "../library.js";
import type { Settings } from "../types/settings.js";
import { getSystemById } from "../systems.js";
import { createElement as make } from "./dom.js";
import { isSvgMarkup } from "../chromeIcons.js";

/** Featured platforms shown on the empty-state homepage. */
export const HOMEPAGE_FEATURED_SYSTEM_IDS = [
  "psp",
  "nes",
  "snes",
  "gba",
  "n64",
  "nds",
  "psx",
  "segaMD",
  "segaDC",
  "3ds",
] as const;

const WELCOME_BACK_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export const RECENTLY_ADDED_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
export const RECENTLY_ADDED_MAX = 8;

export function resolveLibraryHeadline(allGames: GameMetadata[]): string {
  if (allGames.length === 0) return "My Library";

  const mostRecent = [...allGames]
    .filter((g) => typeof g.lastPlayedAt === "number")
    .sort((a, b) => (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0))[0];

  if (
    mostRecent?.lastPlayedAt &&
    Date.now() - mostRecent.lastPlayedAt < WELCOME_BACK_WINDOW_MS
  ) {
    return "Welcome back";
  }

  return "My Library";
}

export function getRecentlyAddedGames(
  allGames: GameMetadata[],
  opts?: { withinMs?: number; limit?: number; excludeIds?: ReadonlySet<string> },
): GameMetadata[] {
  const withinMs = opts?.withinMs ?? RECENTLY_ADDED_WINDOW_MS;
  const limit = opts?.limit ?? RECENTLY_ADDED_MAX;
  const cutoff = Date.now() - withinMs;

  return [...allGames]
    .filter((g) => g.addedAt >= cutoff && !opts?.excludeIds?.has(g.id))
    .sort((a, b) => b.addedAt - a.addedAt)
    .slice(0, limit);
}

export interface LibraryGridSignatureInput {
  allGames: GameMetadata[];
  displayed: GameMetadata[];
  settings: Settings;
  searchQuery: string;
  systemFilter: string;
  showFavorites: boolean;
  sortMode: string;
}

export function computeLibraryGridSignature(input: LibraryGridSignatureInput): string {
  const { allGames, displayed, settings, searchQuery, systemFilter, showFavorites, sortMode } = input;
  return [
    allGames.length,
    displayed.length,
    displayed.map((g) => `${g.id}:${g.isFavorite ? 1 : 0}:${g.hasCoverArt ? 1 : 0}`).join("|"),
    searchQuery,
    systemFilter,
    showFavorites ? "1" : "0",
    sortMode,
    settings.libraryLayout,
    settings.libraryGrouped ? "1" : "0",
  ].join(";");
}

export function buildEmptyDetailsGuide(opts: {
  onChooseRoms: () => void;
  onOpenHelp: () => void;
  onCloudSaves: () => void;
  onCloudLibrary?: () => void;
}): HTMLElement {
  const panel = make("div", { class: "landing-details__guide" });
  const title = make("h3", { class: "landing-details__guide-title" }, "Getting started");
  const intro = make("p", { class: "landing-details__guide-copy" },
    "Drop ROMs or disc images to build your library. Everything stays on this device unless you connect cloud saves.");

  const list = make("ul", { class: "landing-details__guide-list" });
  for (const step of [
    "Choose ROMs or drag files into the import area",
    "RetroOasis detects the system automatically",
    "Press Play — saves stay local in your browser",
  ]) {
    list.appendChild(make("li", {}, step));
  }

  const actions = make("div", { class: "landing-details__actions" });
  const importBtn = make("button", { class: "btn btn--primary", type: "button" }, "Choose ROMs");
  importBtn.addEventListener("click", opts.onChooseRoms);
  const cloudBtn = make("button", { class: "btn btn--ghost", type: "button" }, "Cloud saves");
  cloudBtn.addEventListener("click", opts.onCloudSaves);
  const helpBtn = make("button", { class: "btn btn--ghost", type: "button" }, "View guide");
  helpBtn.addEventListener("click", opts.onOpenHelp);
  if (opts.onCloudLibrary) {
    const cloudLibBtn = make("button", { class: "btn btn--ghost", type: "button" }, "Cloud library");
    cloudLibBtn.addEventListener("click", opts.onCloudLibrary);
    actions.append(importBtn, cloudBtn, cloudLibBtn, helpBtn);
  } else {
    actions.append(importBtn, cloudBtn, helpBtn);
  }

  panel.append(title, intro, list, actions);
  return panel;
}

export function buildPlatformsStrip(
  getIcon: (systemId: string) => string,
): HTMLElement {
  const strip = make("div", {
    class: "homepage-platforms",
    "aria-label": "Supported platforms",
  });

  const label = make("p", { class: "homepage-platforms__label" }, "Supports 25+ systems including");
  strip.appendChild(label);

  const grid = make("div", { class: "homepage-platforms__grid" });
  for (const systemId of HOMEPAGE_FEATURED_SYSTEM_IDS) {
    const system = getSystemById(systemId);
    if (!system) continue;

    const chip = make("div", {
      class: "homepage-platforms__chip",
      title: system.name,
    });
    chip.style.setProperty("--sys-color", system.color);

    const icon = make("span", { class: "homepage-platforms__icon", "aria-hidden": "true" });
    const iconOutput = getIcon(systemId);
    if (iconOutput.includes("/assets/")) {
      icon.appendChild(make("img", { src: iconOutput, alt: "" }));
    } else if (isSvgMarkup(iconOutput)) {
      icon.innerHTML = iconOutput;
    } else {
      icon.textContent = iconOutput;
    }

    const name = make("span", { class: "homepage-platforms__name" }, system.shortName);
    chip.append(icon, name);
    grid.appendChild(chip);
  }

  strip.appendChild(grid);
  return strip;
}
