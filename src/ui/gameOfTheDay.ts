/**
 * gameOfTheDay.ts — Deterministic daily game picker and corner widget.
 */

import type { GameMetadata } from "../library.js";
import { getSystemById } from "../systems.js";
import { createElement as make } from "./dom.js";

/** UTC date key used as the daily random seed (YYYY-MM-DD). */
export function dateSeedForGameOfTheDay(date: Date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Pick one game deterministically for the given UTC calendar day.
 * The same library + date always yields the same pick.
 */
export function pickGameOfTheDay(
  games: GameMetadata[],
  date: Date = new Date(),
): GameMetadata | null {
  if (games.length === 0) return null;

  const playable = games.filter((g) => g.hasLocalBlob || g.cloudId);
  const pool = playable.length > 0 ? playable : games;

  const seed = dateSeedForGameOfTheDay(date);
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % pool.length;
  return pool[index] ?? null;
}

export interface GameOfTheDayWidgetOpts {
  game: GameMetadata;
  getSystemIcon: (systemId: string) => string;
  onPlay: (game: GameMetadata) => void;
  onDismiss?: () => void;
}

/**
 * Floating corner widget showing today's suggested game.
 */
export function buildGameOfTheDayWidget(opts: GameOfTheDayWidgetOpts): HTMLElement {
  const { game, onPlay } = opts;
  const system = getSystemById(game.systemId);

  const widget = make("aside", {
    class: "game-of-the-day",
    role: "complementary",
    "aria-label": "Game of the day",
  });

  const header = make("div", { class: "game-of-the-day__header" });
  header.appendChild(make("span", { class: "game-of-the-day__eyebrow" }, "Game of the day"));

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
    "aria-label": `Play ${game.name}, ${system?.shortName ?? game.systemId}`,
  }) as HTMLButtonElement;

  const icon = make("span", { class: "game-of-the-day__icon", "aria-hidden": "true" });
  const iconOutput = opts.getSystemIcon(game.systemId);
  if (iconOutput.includes("<svg") || iconOutput.includes("<img")) {
    icon.innerHTML = iconOutput;
  } else {
    icon.textContent = iconOutput;
  }

  const info = make("div", { class: "game-of-the-day__info" });
  info.append(
    make("span", { class: "game-of-the-day__name" }, game.name),
    make("span", { class: "game-of-the-day__system" }, system?.shortName ?? game.systemId.toUpperCase()),
  );

  body.append(icon, info);
  body.addEventListener("click", () => onPlay(game));

  widget.append(header, body);
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
