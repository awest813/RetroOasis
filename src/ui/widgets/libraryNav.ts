/**
 * libraryNav.ts — Library keyboard arrow navigation and gamepad polling loop.
 *
 * Extracted from src/ui.ts as part of the modularisation effort.
 */

import { safeScrollIntoView } from "../viewHelpers.js";

let _libraryNavWired = false;
let _libraryGamepadRafId: number | null = null;
let _libraryGamepadRestartFn: (() => void) | null = null;

let _libGpPrevAxes: number[] = [];
let _libGpPrevBtns: boolean[] = [];
let _libGpRepeatTimer = 0;
const _LIB_NAV_INITIAL_DELAY = 400;
const _LIB_NAV_REPEAT_RATE   = 150;

let _libGpCachedCards: HTMLElement[] | null = null;

let _gpNavSuppressedCache = false;
let _gpNavSuppressedFrame = -1;

function _getNavigatorGamepads(): Gamepad[] {
  let raw: readonly (Gamepad | null)[];
  if (typeof navigator.getGamepads === "function") {
    raw = navigator.getGamepads();
  } else if (typeof navigator.webkitGetGamepads === "function") {
    raw = navigator.webkitGetGamepads() as unknown as (Gamepad | null)[];
  } else {
    return [];
  }
  const out: Gamepad[] = [];
  for (let i = 0; i < raw.length; i++) {
    const g = raw[i];
    if (g != null && g.connected) out.push(g);
  }
  return out;
}

function _gamepadBtnDown(btn: GamepadButton | undefined): boolean {
  if (!btn) return false;
  if (btn.pressed) return true;
  const v = typeof btn.value === "number" ? btn.value : 0;
  return v > 0.35;
}

function _libraryGamepadNavSuppressed(): boolean {
  const now = performance.now();
  if (Math.floor(now / 16) !== _gpNavSuppressedFrame) {
    _gpNavSuppressedFrame = Math.floor(now / 16);
    _gpNavSuppressedCache =
      !!document.getElementById("error-banner")?.classList.contains("visible") ||
      !!document.querySelector(".confirm-overlay") ||
      !!(document.getElementById("settings-panel") && !document.getElementById("settings-panel")!.hidden) ||
      !!document.querySelector("#system-picker:not([hidden])") ||
      !!document.querySelector(".easy-netplay-overlay");
  }
  return _gpNavSuppressedCache;
}

export function invalidateLibraryGamepadCardCache(): void {
  _libGpCachedCards = null;
}

function _queryLibraryGameCards(): HTMLElement[] {
  const grid = document.getElementById("library-grid");
  if (!grid) return [];
  return Array.from(grid.querySelectorAll<HTMLElement>(".game-card"));
}

export function focusFirstLibraryCard(): boolean {
  const cards = _queryLibraryGameCards();
  if (!cards.length) return false;
  invalidateLibraryGamepadCardCache();
  cards[0]!.focus();
  safeScrollIntoView(cards[0]!, { block: "nearest", behavior: "smooth" });
  return true;
}

export function focusLastLibraryCard(): boolean {
  const cards = _queryLibraryGameCards();
  if (!cards.length) return false;
  const last = cards[cards.length - 1]!;
  invalidateLibraryGamepadCardCache();
  last.focus();
  safeScrollIntoView(last, { block: "nearest", behavior: "smooth" });
  return true;
}

export function startLibraryGamepadNavigation(): void {
  if (_libraryNavWired) return;

  const grid = document.getElementById("library-grid");
  if (!grid) return;

  _libraryNavWired = true;

  grid.addEventListener("keydown", (e: KeyboardEvent) => {
    const key = e.key;
    if (key !== "ArrowLeft" && key !== "ArrowRight" &&
        key !== "ArrowUp"   && key !== "ArrowDown"  &&
        key !== "Home"       && key !== "End"       &&
        key !== "PageUp"     && key !== "PageDown") return;

    const cards = Array.from(grid.querySelectorAll<HTMLElement>(".game-card"));
    if (!cards.length) return;

    const focused = document.activeElement as HTMLElement | null;
    const idx = focused ? cards.indexOf(focused) : -1;
    if (idx === -1) {
      if (key === "ArrowDown" || key === "PageDown") {
        e.preventDefault();
        void focusFirstLibraryCard();
      } else if (key === "ArrowUp" || key === "PageUp") {
        e.preventDefault();
        void focusLastLibraryCard();
      } else if (key === "Home") {
        e.preventDefault();
        void focusFirstLibraryCard();
      } else if (key === "End") {
        e.preventDefault();
        void focusLastLibraryCard();
      }
      return;
    }

    e.preventDefault();

    let nextIdx = idx;
    if (key === "ArrowLeft") {
      nextIdx = Math.max(0, idx - 1);
    } else if (key === "ArrowRight") {
      nextIdx = Math.min(cards.length - 1, idx + 1);
    } else if (key === "Home" || key === "PageUp") {
      nextIdx = 0;
    } else if (key === "End" || key === "PageDown") {
      nextIdx = cards.length - 1;
    } else {
      const curRect = cards[idx]!.getBoundingClientRect();
      const curMidX = curRect.left + curRect.width / 2;
      const curTop  = curRect.top;
      let best = -1;
      let bestScore = Infinity;
      for (let i = 0; i < cards.length; i++) {
        if (i === idx) continue;
        const r = cards[i]!.getBoundingClientRect();
        if (key === "ArrowUp"   && r.top >= curTop - 4) continue;
        if (key === "ArrowDown" && r.top <= curTop + 4) continue;
        const dx = Math.abs((r.left + r.width / 2) - curMidX);
        const dy = Math.abs(r.top - curTop);
        const score = dx * 3 + dy;
        if (score < bestScore) { bestScore = score; best = i; }
      }
      if (best !== -1) nextIdx = best;
    }

    if (nextIdx !== idx) {
      cards[nextIdx]!.focus();
      invalidateLibraryGamepadCardCache();
      safeScrollIntoView(cards[nextIdx]!, { block: "nearest", behavior: "smooth" });
    }
  });

  const librarySection = document.getElementById("library-section");
  if (librarySection) {
    librarySection.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key !== "ArrowDown") return;
      const landingEl = document.getElementById("landing");
    if (!landingEl || landingEl.classList.contains("hidden")) {
      stopLibraryGamepadNavigation();
      return;
    }
      if (_libraryGamepadNavSuppressed()) return;
      const t = e.target as HTMLElement;
      if (t.closest(".game-card")) return;
      if (t.id === "library-search") return;
      if (t.id === "library-sort") return;
      if (t.closest("#drop-zone")) return;
      if (!t.closest(".library-toolbar, .system-filter, .library-overview, #library-highlights")) return;
      e.preventDefault();
      void focusFirstLibraryCard();
    });
  }

  function _libGamepadTick(): void {
    _libraryGamepadRafId = requestAnimationFrame(_libGamepadTick);

    const landingEl = document.getElementById("landing");
    if (!landingEl || landingEl.classList.contains("hidden")) {
      cancelAnimationFrame(_libraryGamepadRafId);
      _libraryGamepadRafId = null;
      return;
    }

    if (_libraryGamepadNavSuppressed()) return;

    const gp = _getNavigatorGamepads()[0];
    if (!gp) {
      document.body.classList.remove("using-gamepad");
      return;
    }

    if (!document.body.classList.contains("using-gamepad")) {
      document.body.classList.add("using-gamepad");
    }

    const now = performance.now();

    const ax = gp.axes[0] ?? 0;
    const ay = gp.axes[1] ?? 0;
    const hatX = gp.axes.length > 6 ? (gp.axes[6] ?? 0) : 0;
    const hatY = gp.axes.length > 7 ? (gp.axes[7] ?? 0) : 0;

    const rawUp =
      _gamepadBtnDown(gp.buttons[12]) || ay < -0.55 || hatY < -0.55;
    const rawDown =
      _gamepadBtnDown(gp.buttons[13]) || ay > 0.55 || hatY > 0.55;
    const rawLeft =
      _gamepadBtnDown(gp.buttons[14]) || ax < -0.55 || hatX < -0.55;
    const rawRight =
      _gamepadBtnDown(gp.buttons[15]) || ax > 0.55 || hatX > 0.55;

    const btnA = _gamepadBtnDown(gp.buttons[0]);
    const btnB = _gamepadBtnDown(gp.buttons[1]);
    const btnL1 = _gamepadBtnDown(gp.buttons[4]);
    const btnR1 = _gamepadBtnDown(gp.buttons[5]);
    const btnStart = _gamepadBtnDown(gp.buttons[9]);

    const prevBtnA = _libGpPrevBtns[0] ?? false;
    const prevBtnB = _libGpPrevBtns[1] ?? false;
    const prevBtnL1 = _libGpPrevBtns[4] ?? false;
    const prevBtnR1 = _libGpPrevBtns[5] ?? false;
    const prevBtnStart = _libGpPrevBtns[9] ?? false;

    const pressedA = btnA && !prevBtnA;
    const pressedB = btnB && !prevBtnB;
    const pressedL1 = btnL1 && !prevBtnL1;
    const pressedR1 = btnR1 && !prevBtnR1;
    const pressedStart = btnStart && !prevBtnStart;

    _libGpPrevBtns[0] = btnA;
    _libGpPrevBtns[1] = btnB;
    _libGpPrevBtns[4] = btnL1;
    _libGpPrevBtns[5] = btnR1;
    _libGpPrevBtns[9] = btnStart;

    const anyDir = rawUp || rawDown || rawLeft || rawRight;

    let doMove = false;
    if (anyDir) {
      if (_libGpPrevAxes[0] !== 1) {
        doMove = true;
        _libGpRepeatTimer = now + _LIB_NAV_INITIAL_DELAY;
      } else if (now >= _libGpRepeatTimer) {
        doMove = true;
        _libGpRepeatTimer = now + _LIB_NAV_REPEAT_RATE;
      }
    }
    _libGpPrevAxes[0] = anyDir ? 1 : 0;

    const needCards = pressedA || pressedB || pressedL1 || pressedR1 || pressedStart || doMove;
    if (!needCards) return;

    _libGpCachedCards ??= Array.from(grid!.querySelectorAll<HTMLElement>(".game-card"));
    const cards: HTMLElement[] = _libGpCachedCards;

    if (pressedStart) {
      const settingsBtn = document.getElementById("header-settings-btn");
      settingsBtn?.click();
      return;
    }

    if (pressedA && cards.length) {
      const focused = document.activeElement as HTMLElement | null;
      const idx = focused ? cards.indexOf(focused) : -1;
      if (idx !== -1) { cards[idx]!.click(); return; }
      cards[0]!.focus();
      invalidateLibraryGamepadCardCache();
      cards[0]!.click();
      return;
    }

    if (pressedB) {
      const searchEl = document.getElementById("library-search") as HTMLInputElement | null;
      if (searchEl) searchEl.focus();
      return;
    }

    if ((pressedL1 || pressedR1) && cards.length) {
      const focused = document.activeElement as HTMLElement | null;
      const idx = focused ? cards.indexOf(focused) : -1;
      const jump = 10;
      let nextIdx = idx;
      if (pressedL1) nextIdx = Math.max(0, idx - jump);
      if (pressedR1) nextIdx = Math.min(cards.length - 1, idx + jump);
      if (idx === -1) nextIdx = 0;
      
      if (nextIdx !== idx) {
        cards[nextIdx]!.focus();
        invalidateLibraryGamepadCardCache();
        safeScrollIntoView(cards[nextIdx]!, { block: "nearest", behavior: "smooth" });
      }
      return;
    }

    if (!doMove || !cards.length) return;

    const focused = document.activeElement as HTMLElement | null;
    const idx = focused ? cards.indexOf(focused) : -1;

    if (idx === -1) {
      cards[0]!.focus();
      invalidateLibraryGamepadCardCache();
      safeScrollIntoView(cards[0]!, { block: "nearest", behavior: "smooth" });
      return;
    }

    let nextIdx = idx;
    if (rawLeft) {
      nextIdx = Math.max(0, idx - 1);
    } else if (rawRight) {
      nextIdx = Math.min(cards.length - 1, idx + 1);
    } else {
      const curRect = cards[idx]!.getBoundingClientRect();
      const curMidX = curRect.left + curRect.width / 2;
      const curTop  = curRect.top;
      let best = -1;
      let bestScore = Infinity;
      for (let i = 0; i < cards.length; i++) {
        if (i === idx) continue;
        const r = cards[i]!.getBoundingClientRect();
        if (rawUp   && r.top >= curTop - 4) continue;
        if (rawDown && r.top <= curTop + 4) continue;
        const dx = Math.abs((r.left + r.width / 2) - curMidX);
        const dy = Math.abs(r.top - curTop);
        const score = dx * 3 + dy;
        if (score < bestScore) { bestScore = score; best = i; }
      }
      if (best !== -1) nextIdx = best;
    }

    if (nextIdx !== idx) {
      cards[nextIdx]!.focus();
      invalidateLibraryGamepadCardCache();
      safeScrollIntoView(cards[nextIdx]!, { block: "nearest", behavior: "smooth" });
    }
  }

  _libraryGamepadRafId = requestAnimationFrame(_libGamepadTick);
  _libraryGamepadRestartFn = () => {
    if (_libraryGamepadRafId === null) {
      _libraryGamepadRafId = requestAnimationFrame(_libGamepadTick);
    }
  };
}

export function stopLibraryGamepadNavigation(): void {
  if (_libraryGamepadRafId !== null) {
    cancelAnimationFrame(_libraryGamepadRafId);
    _libraryGamepadRafId = null;
  }
  _libraryNavWired = false;
  _libGpPrevAxes = [];
  _libGpPrevBtns = [];
}

export function restartLibraryGamepadNavigation(): void {
  _libraryGamepadRestartFn?.();
}
