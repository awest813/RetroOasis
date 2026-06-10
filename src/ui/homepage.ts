import type { GameMetadata } from "../library.js";
import { getSystemById } from "../systems.js";
import { createElement as make } from "./dom.js";

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

export function getContinuePlayingGame(allGames: GameMetadata[]): GameMetadata | null {
  const sorted = [...allGames]
    .filter((g) => typeof g.lastPlayedAt === "number")
    .sort((a, b) => (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0));
  return sorted[0] ?? null;
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
    if (iconOutput.includes("<svg") || iconOutput.includes("<img")) {
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
