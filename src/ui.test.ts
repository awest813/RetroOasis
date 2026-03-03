import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildDOM, initUI } from "./ui.js";
import type { PSPEmulator } from "./emulator.js";
import type { GameLibrary } from "./library.js";
import type { BiosLibrary } from "./bios.js";
import type { SaveStateLibrary } from "./saves.js";
import type { Settings } from "./main.js";
import type { DeviceCapabilities } from "./performance.js";

describe("ui drag-over state", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("clears drag-over class when the window loses focus mid-drag", () => {
    const app = document.createElement("div");
    document.body.appendChild(app);
    buildDOM(app);

    const settings: Settings = {
      volume: 0.7,
      lastGameName: null,
      performanceMode: "auto",
      showFPS: false,
      showAudioVis: false,
      useWebGPU: false,
      postProcessEffect: "none",
      autoSaveEnabled: true,
      touchControls: false,
      hapticFeedback: true,
      orientationLock: true,
    };

    initUI({
      emulator: {
        state: "idle",
        activeTier: "medium",
        currentSystem: null,
        setFPSMonitorEnabled: vi.fn(),
      } as unknown as PSPEmulator,
      library: { getAllGamesMetadata: vi.fn().mockResolvedValue([]) } as unknown as GameLibrary,
      biosLibrary: {} as BiosLibrary,
      saveLibrary: {} as SaveStateLibrary,
      settings,
      deviceCaps: { isLowSpec: false, isChromOS: false } as unknown as DeviceCapabilities,
      onLaunchGame: vi.fn(async () => {}),
      onSettingsChange: vi.fn(),
      onReturnToLibrary: vi.fn(),
      onApplyPatch: vi.fn(async () => {}),
      onFileChosen: vi.fn(async () => {}),
      getCurrentGameId: () => null,
      getCurrentGameName: () => null,
      getCurrentSystemId: () => null,
    });

    const dropZone = document.getElementById("drop-zone");
    expect(dropZone).toBeTruthy();

    document.dispatchEvent(new Event("dragover", { bubbles: true, cancelable: true }));
    expect(dropZone!.classList.contains("drag-over")).toBe(true);

    window.dispatchEvent(new Event("blur"));
    expect(dropZone!.classList.contains("drag-over")).toBe(false);
  });
});
