/**
 * fpsOverlay.ts — FPS overlay update and low-framerate performance suggestion toast.
 *
 * Extracted from src/ui.ts as part of the modularisation effort.
 */

import { type FPSSnapshot, type PSPEmulator } from "../../emulator.js";
import { formatTierLabel, isLikelyAndroid, isLikelyIOS } from "../../performance.js";
import { createElement as make } from "../dom.js";
import { ICON_CLOSE_X_SVG } from "../../chromeIcons.js";

let _fpsOverlayEls: Record<string, HTMLElement | null> | null = null;

export function resetFpsOverlayElsCache(): void {
  _fpsOverlayEls = null;
}

export function updateFPSOverlay(snapshot: FPSSnapshot, emulator: PSPEmulator): void {
  if (!_fpsOverlayEls) {
    _fpsOverlayEls = {
      val: document.getElementById("fps-current-val"),
      avg: document.getElementById("fps-avg"),
      tier: document.getElementById("fps-tier"),
      drs: document.getElementById("fps-drs"),
      dropped: document.getElementById("fps-dropped"),
    };
  }
  const { val: valEl, avg: avgEl, tier: tierEl, drs: drsEl, dropped: droppedEl } = _fpsOverlayEls;

  if (valEl) {
    valEl.textContent = `${snapshot.current}`;
    valEl.className = `fps-val ${snapshot.current >= 50 ? "fps-good" : snapshot.current >= 30 ? "fps-ok" : "fps-bad"}`;
  }
  if (avgEl) avgEl.textContent = `avg ${snapshot.average}`;
  if (tierEl) {
    tierEl.textContent =
      emulator.activeTier !== null ? formatTierLabel(emulator.activeTier) : "";
  }
  if (drsEl) {
    const drsHint = emulator.drsOverlayHint;
    if (drsHint) {
      drsEl.textContent = drsHint;
      drsEl.hidden = false;
    } else {
      drsEl.textContent = "";
      drsEl.hidden = true;
    }
  }
  if (droppedEl) {
    if (snapshot.droppedFrames > 0) { 
      droppedEl.textContent = `${snapshot.droppedFrames} dropped`; 
      droppedEl.hidden = false; 
    } else { 
      droppedEl.hidden = true; 
    }
  }

  onFpsSnapshot(snapshot);
}

const LOW_FPS_THRESHOLD = 25;
const LOW_FPS_TRIGGER   = 6;

let _lowFPSCount = 0;
let _perfSuggestionShown = false;
let _perfSuggestionAutoDismissTimer: ReturnType<typeof setTimeout> | null = null;

function onFpsSnapshot(snapshot: FPSSnapshot): void {
  if (snapshot.average > 0 && snapshot.average < LOW_FPS_THRESHOLD) {
    _lowFPSCount++;
    if (_lowFPSCount >= LOW_FPS_TRIGGER && !_perfSuggestionShown) { _perfSuggestionShown = true; showPerfSuggestion(); }
  } else {
    _lowFPSCount = Math.max(0, _lowFPSCount - 1);
  }
}

const PERF_SUGGESTION_AUTO_DISMISS_MS = 10_000;
const PERF_SUGGESTION_FADE_DELAY_MS = 300;

function showPerfSuggestion(): void {
  const existing = document.getElementById("perf-suggestion");
  if (existing) return;

  const isMobile = isLikelyIOS() || isLikelyAndroid();
  const mobileTip = isMobile ? " Closing background apps may also help on mobile." : "";

  const toast = make("div", { id: "perf-suggestion", class: "perf-suggestion", role: "status" });
  toast.innerHTML =
    `<span class="perf-suggestion__msg">Game running slowly? Try <strong>Performance mode</strong> or turn on <strong>Dynamic resolution</strong> under Settings → Performance.${mobileTip}</span>` +
    `<button class="perf-suggestion__close" aria-label="Dismiss">${ICON_CLOSE_X_SVG}</button>`;
  document.body.appendChild(toast);

  _perfSuggestionAutoDismissTimer = setTimeout(() => { _perfSuggestionAutoDismissTimer = null; dismiss(); }, PERF_SUGGESTION_AUTO_DISMISS_MS);
  const dismiss = () => {
    if (_perfSuggestionAutoDismissTimer !== null) { clearTimeout(_perfSuggestionAutoDismissTimer); _perfSuggestionAutoDismissTimer = null; }
    toast.classList.add("perf-suggestion--hiding"); setTimeout(() => toast.remove(), PERF_SUGGESTION_FADE_DELAY_MS);
  };
  toast.querySelector(".perf-suggestion__close")?.addEventListener("click", dismiss);
  requestAnimationFrame(() => toast.classList.add("perf-suggestion--visible"));
}

export function resetPerfSuggestion(): void {
  _lowFPSCount = 0;
  _perfSuggestionShown = false;
  if (_perfSuggestionAutoDismissTimer !== null) { clearTimeout(_perfSuggestionAutoDismissTimer); _perfSuggestionAutoDismissTimer = null; }
  document.getElementById("perf-suggestion")?.remove();
}
