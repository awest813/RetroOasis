/**
 * profileDisplayPrefs.ts — Display / performance settings bundled per profile (v2 subset).
 */

import type { Settings } from "./types/settings.js";
import type { PerformanceMode } from "./performance.js";
import { parsePostProcessEffect, type PostProcessEffect } from "./postProcessEffectSchema.js";

export interface ProfileDisplayPrefs {
  volume: number;
  performanceMode: PerformanceMode;
  showFPS: boolean;
  showAudioVis: boolean;
  useWebGPU: boolean;
  postProcessEffect: PostProcessEffect;
  orientationLock: boolean;
  uiMode: Settings["uiMode"];
  libraryLayout: Settings["libraryLayout"];
  libraryGrouped: boolean;
  uiScale: number;
  dynamicResolutionScaling: boolean;
  audioFilterType: Settings["audioFilterType"];
  audioFilterCutoff: number;
}

/** Baseline display prefs applied when a snapshot omits displayPrefs (prevents bleed across profiles). */
export const DEFAULT_DISPLAY_PREFS: ProfileDisplayPrefs = {
  volume: 0.7,
  performanceMode: "auto",
  showFPS: false,
  showAudioVis: false,
  useWebGPU: false,
  postProcessEffect: "none",
  orientationLock: true,
  uiMode: "auto",
  libraryLayout: "grid",
  libraryGrouped: true,
  uiScale: 1.0,
  dynamicResolutionScaling: false,
  audioFilterType: "none",
  audioFilterCutoff: 10_000,
};

function clampDisplayPrefs(prefs: ProfileDisplayPrefs): ProfileDisplayPrefs {
  return {
    ...prefs,
    volume: Math.min(1, Math.max(0, prefs.volume)),
    uiScale: Math.min(2, Math.max(0.5, Math.round(prefs.uiScale * 100) / 100)),
    audioFilterCutoff: Math.min(20_000, Math.max(100, Math.round(prefs.audioFilterCutoff))),
  };
}

export function pickDisplayPrefs(settings: Settings): ProfileDisplayPrefs {
  return {
    volume: settings.volume,
    performanceMode: settings.performanceMode,
    showFPS: settings.showFPS,
    showAudioVis: settings.showAudioVis,
    useWebGPU: settings.useWebGPU,
    postProcessEffect: settings.postProcessEffect,
    orientationLock: settings.orientationLock,
    uiMode: settings.uiMode,
    libraryLayout: settings.libraryLayout,
    libraryGrouped: settings.libraryGrouped,
    uiScale: settings.uiScale,
    dynamicResolutionScaling: settings.dynamicResolutionScaling,
    audioFilterType: settings.audioFilterType,
    audioFilterCutoff: settings.audioFilterCutoff,
  };
}

export function displayPrefsToSettingsPatch(prefs: ProfileDisplayPrefs | undefined): Partial<Settings> {
  if (!prefs) return {};
  return {
    volume: prefs.volume,
    performanceMode: prefs.performanceMode,
    showFPS: prefs.showFPS,
    showAudioVis: prefs.showAudioVis,
    useWebGPU: prefs.useWebGPU,
    postProcessEffect: parsePostProcessEffect(prefs.postProcessEffect) ?? "none",
    orientationLock: prefs.orientationLock,
    uiMode: prefs.uiMode,
    libraryLayout: prefs.libraryLayout,
    libraryGrouped: prefs.libraryGrouped,
    uiScale: prefs.uiScale,
    dynamicResolutionScaling: prefs.dynamicResolutionScaling,
    audioFilterType: prefs.audioFilterType,
    audioFilterCutoff: prefs.audioFilterCutoff,
  };
}

export function parseDisplayPrefs(raw: unknown): ProfileDisplayPrefs | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const rec = raw as Record<string, unknown>;
  const performanceModes: PerformanceMode[] = ["auto", "performance", "quality"];
  const uiModes: Settings["uiMode"][] = ["auto", "quality", "lite"];
  const layouts: Settings["libraryLayout"][] = ["grid", "list", "compact"];
  const audioFilters: Settings["audioFilterType"][] = ["none", "lowpass", "highpass"];
  if (typeof rec.volume !== "number") return undefined;
  if (!performanceModes.includes(rec.performanceMode as PerformanceMode)) return undefined;
  if (typeof rec.showFPS !== "boolean" || typeof rec.showAudioVis !== "boolean") return undefined;
  if (typeof rec.useWebGPU !== "boolean" || typeof rec.orientationLock !== "boolean") return undefined;
  if (!uiModes.includes(rec.uiMode as Settings["uiMode"])) return undefined;
  if (!layouts.includes(rec.libraryLayout as Settings["libraryLayout"])) return undefined;
  if (typeof rec.libraryGrouped !== "boolean" || typeof rec.dynamicResolutionScaling !== "boolean") return undefined;
  if (typeof rec.uiScale !== "number") return undefined;
  if (!audioFilters.includes(rec.audioFilterType as Settings["audioFilterType"])) return undefined;
  if (typeof rec.audioFilterCutoff !== "number") return undefined;
  const effect = parsePostProcessEffect(rec.postProcessEffect);
  if (!effect) return undefined;
  return clampDisplayPrefs({
    volume: rec.volume,
    performanceMode: rec.performanceMode as PerformanceMode,
    showFPS: rec.showFPS,
    showAudioVis: rec.showAudioVis,
    useWebGPU: rec.useWebGPU,
    postProcessEffect: effect,
    orientationLock: rec.orientationLock,
    uiMode: rec.uiMode as Settings["uiMode"],
    libraryLayout: rec.libraryLayout as Settings["libraryLayout"],
    libraryGrouped: rec.libraryGrouped,
    uiScale: rec.uiScale,
    dynamicResolutionScaling: rec.dynamicResolutionScaling,
    audioFilterType: rec.audioFilterType as Settings["audioFilterType"],
    audioFilterCutoff: rec.audioFilterCutoff,
  });
}

/** Resolve display prefs from snapshot data, falling back to defaults when absent or malformed. */
export function resolveDisplayPrefs(raw: unknown): ProfileDisplayPrefs {
  return parseDisplayPrefs(raw) ?? { ...DEFAULT_DISPLAY_PREFS };
}
