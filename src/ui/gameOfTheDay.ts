/**
 * gameOfTheDay.ts — Daily game spotlight from the Wikipedia gaming catalog.
 */

import type { GameMetadata } from "../library.js";
import { normalizeRomName } from "../coverArt.js";
import { getSystemById } from "../systems.js";
import { WIKI_GAME_CATALOG, type WikiGameCatalogEntry } from "../wikiGameCatalog.js";
import type { WikipediaGamePage } from "../freeMetadata.js";
import { createElement as make } from "./dom.js";
import { isSvgMarkup } from "../chromeIcons.js";

/** UTC date key used as the daily random seed (YYYY-MM-DD). */
export function dateSeedForGameOfTheDay(date: Date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function hashSeed(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/**
 * Pick one catalog game deterministically for the given UTC calendar day.
 */
export function pickWikiGameOfTheDay(
  date: Date = new Date(),
  catalog: readonly WikiGameCatalogEntry[] = WIKI_GAME_CATALOG,
): WikiGameCatalogEntry {
  const index = hashSeed(dateSeedForGameOfTheDay(date)) % catalog.length;
  return catalog[index]!;
}

/** Find a library entry that likely matches the wiki spotlight title. */
export function findWikiGameInLibrary(
  entry: WikiGameCatalogEntry,
  games: GameMetadata[],
): GameMetadata | null {
  const target = normalizeRomName(entry.name);
  if (!target) return null;

  const sameSystem = games.filter((g) => g.systemId === entry.systemId);
  const pool = sameSystem.length > 0 ? sameSystem : games;

  return pool.find((g) => normalizeRomName(g.name) === target) ?? null;
}

let _wikiClientPromise: Promise<import("../freeMetadata.js").WikipediaMetadataClient> | null = null;

async function getWikiClient(): Promise<import("../freeMetadata.js").WikipediaMetadataClient> {
  if (!_wikiClientPromise) {
    _wikiClientPromise = import("../freeMetadata.js").then(({ WikipediaMetadataClient }) => new WikipediaMetadataClient());
  }
  return _wikiClientPromise;
}

/** Load Wikipedia summary and thumbnail for today's catalog entry. */
export async function loadWikiGameOfTheDayDetails(
  entry: WikiGameCatalogEntry,
  opts: { signal?: AbortSignal } = {},
): Promise<WikipediaGamePage | null> {
  return (await getWikiClient()).fetchGameByTitle(entry.wikiTitle, opts);
}

/** StrategyWiki search URL for a game title. */
export function strategyWikiSearchUrl(gameName: string): string {
  return `https://strategywiki.org/wiki/Special:Search?search=${encodeURIComponent(gameName)}`;
}

export interface GameOfTheDayWidgetOpts {
  entry: WikiGameCatalogEntry;
  wiki?: WikipediaGamePage | null;
  libraryMatch?: GameMetadata | null;
  getSystemIcon: (systemId: string) => string;
  onOpenWiki: (url: string) => void;
  onOpenStrategyWiki?: (url: string) => void;
  onPlayLibraryMatch?: (game: GameMetadata) => void;
  onDismiss?: () => void;
}

/**
 * Floating corner widget showing today's Wikipedia gaming spotlight.
 */
export function buildGameOfTheDayWidget(opts: GameOfTheDayWidgetOpts): HTMLElement {
  const { entry, onOpenWiki } = opts;
  const system = getSystemById(entry.systemId);
  const wikiUrl = opts.wiki?.pageUrl ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(entry.wikiTitle.replaceAll(" ", "_"))}`;

  const widget = make("aside", {
    class: "game-of-the-day",
    role: "complementary",
    "aria-label": "Game of the day from Wikipedia",
  });

  const header = make("div", { class: "game-of-the-day__header" });
  header.appendChild(make("span", { class: "game-of-the-day__eyebrow" }, "Game of the day · Wikipedia"));

  if (opts.onDismiss) {
    const dismiss = make("button", {
      class: "game-of-the-day__dismiss btn btn--ghost btn--icon",
      type: "button",
      "aria-label": "Dismiss game of the day",
      title: "Dismiss for today",
    }, "×") as HTMLButtonElement;
    dismiss.addEventListener("click", (e) => {
      e.stopPropagation();
      opts.onDismiss?.();
    });
    header.appendChild(dismiss);
  }

  const body = make("button", {
    class: "game-of-the-day__body",
    type: "button",
    "aria-label": `Read about ${entry.name} on Wikipedia (${system?.shortName ?? entry.systemId})`,
  }) as HTMLButtonElement;

  const icon = make("span", { class: "game-of-the-day__icon", "aria-hidden": "true" });
  if (opts.wiki?.thumbnailUrl) {
    const img = make("img", {
      src: opts.wiki.thumbnailUrl,
      alt: "",
      class: "game-of-the-day__thumb",
      draggable: "false",
      loading: "lazy",
    });
    icon.appendChild(img);
  } else {
    const iconOutput = opts.getSystemIcon(entry.systemId);
    if (iconOutput.includes("/assets/")) {
      const fallbackImg = make("img", { src: iconOutput, alt: "" });
      icon.appendChild(fallbackImg);
    } else if (isSvgMarkup(iconOutput)) {
      icon.innerHTML = iconOutput;
    } else {
      icon.textContent = iconOutput;
    }
  }

  const info = make("div", { class: "game-of-the-day__info" });
  info.append(
    make("span", { class: "game-of-the-day__name" }, entry.name),
    make("span", { class: "game-of-the-day__system" }, system?.shortName ?? entry.systemId.toUpperCase()),
  );

  if (opts.wiki?.summary) {
    const excerpt = opts.wiki.summary.length > 120
      ? `${opts.wiki.summary.slice(0, 117).trimEnd()}…`
      : opts.wiki.summary;
    info.appendChild(make("span", { class: "game-of-the-day__excerpt" }, excerpt));
  }

  body.append(icon, info);
  body.addEventListener("click", () => onOpenWiki(wikiUrl));

  const actions = make("div", { class: "game-of-the-day__actions" });
  const wikiBtn = make("button", {
    class: "btn btn--ghost btn--sm",
    type: "button",
  }, "Wikipedia") as HTMLButtonElement;
  wikiBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    onOpenWiki(wikiUrl);
  });
  actions.appendChild(wikiBtn);

  if (opts.onOpenStrategyWiki) {
    const strategyBtn = make("button", {
      class: "btn btn--ghost btn--sm",
      type: "button",
    }, "StrategyWiki") as HTMLButtonElement;
    strategyBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      opts.onOpenStrategyWiki?.(strategyWikiSearchUrl(entry.name));
    });
    actions.appendChild(strategyBtn);
  }

  if (opts.libraryMatch && opts.onPlayLibraryMatch) {
    const playBtn = make("button", {
      class: "btn btn--primary btn--sm",
      type: "button",
    }, "Play in library") as HTMLButtonElement;
    playBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      opts.onPlayLibraryMatch?.(opts.libraryMatch!);
    });
    actions.appendChild(playBtn);
  }

  widget.append(header, body, actions);
  return widget;
}

const GOTD_DISMISS_KEY = "retro-oasis.gotdDismissed";

export function isGameOfTheDayDismissed(date: Date = new Date()): boolean {
  try {
    return localStorage.getItem(GOTD_DISMISS_KEY) === dateSeedForGameOfTheDay(date);
  } catch {
    return false;
  }
}

export function dismissGameOfTheDayForToday(date: Date = new Date()): void {
  try {
    localStorage.setItem(GOTD_DISMISS_KEY, dateSeedForGameOfTheDay(date));
  } catch { /* ignore */ }
}
