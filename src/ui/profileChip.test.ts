import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Settings } from "../types/settings.js";
import { ApiKeyStore } from "../apiKeyStore.js";
import { getProfileManager, resetProfileManagerForTests } from "../profileManager.js";
import { refreshProfileHeaderChip, resetProfileChipForTests } from "./profileChip.js";

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => { map.set(k, v); },
    removeItem: (k) => { map.delete(k); },
    clear: () => { map.clear(); },
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
  };
}

function makeSettings(): Settings {
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
  };
}

describe("profileChip", () => {
  beforeEach(() => {
    document.body.innerHTML = `<div id="header-actions"></div>`;
    resetProfileManagerForTests();
    resetProfileChipForTests();
  });

  afterEach(() => {
    resetProfileChipForTests();
    resetProfileManagerForTests();
    vi.restoreAllMocks();
  });

  it("renders the active profile name in the header chip", () => {
    const storage = memoryStorage();
    const settings = makeSettings();
    const apiKeyStore = new ApiKeyStore({ storage: memoryStorage(), providers: [] });
    const pm = getProfileManager(storage);
    pm.ensureInitialized({ settings, apiKeyStore, onSettingsChange: vi.fn() });

    refreshProfileHeaderChip({
      openAccountSettings: vi.fn(),
      deps: { settings, apiKeyStore, onSettingsChange: vi.fn() },
    });

    const chip = document.getElementById("header-profile-chip");
    expect(chip?.textContent).toContain("Default");
  });

  it("opens a profile menu even when only one profile exists", () => {
    const storage = memoryStorage();
    const settings = makeSettings();
    const apiKeyStore = new ApiKeyStore({ storage: memoryStorage(), providers: [] });
    const pm = getProfileManager(storage);
    const deps = { settings, apiKeyStore, onSettingsChange: vi.fn() };
    pm.ensureInitialized(deps);

    const openAccountSettings = vi.fn();
    refreshProfileHeaderChip({ openAccountSettings, deps });

    const chip = document.getElementById("header-profile-chip") as HTMLButtonElement;
    expect(chip.getAttribute("aria-haspopup")).toBe("menu");
    expect(chip.querySelector(".profile-chip__caret")).toBeTruthy();

    chip.click();

    const menu = document.getElementById("header-profile-chip-menu");
    expect(menu).toBeTruthy();
    expect(menu?.textContent).toContain("Default");
    expect(menu?.textContent).toContain("Manage profiles");
    expect(openAccountSettings).not.toHaveBeenCalled();
  });
});
