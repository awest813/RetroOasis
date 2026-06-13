import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ApiKeyStore } from "../../apiKeyStore.js";
import { resetProfileManagerForTests } from "../../profileManager.js";
import type { Settings } from "../../types/settings.js";
import { buildAccountTab } from "./AccountTab.js";

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    clear: () => { map.clear(); },
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
  };
}

function makeSettings(overrides: Partial<Settings> = {}): Settings {
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
    libraryLayout: "grid",
    libraryGrouped: true,
    recordPlayHistory: true,
    dynamicResolutionScaling: false,
    uiScale: 1,
    profileLibraryFilter: false,
    profileCloudBackupEncrypted: false,
    ...overrides,
  };
}

describe("buildAccountTab", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    resetProfileManagerForTests();
  });

  afterEach(() => {
    resetProfileManagerForTests();
    vi.restoreAllMocks();
  });

  it("renders a scannable account status summary", () => {
    const container = document.createElement("div");
    const settings = makeSettings({
      netplayEnabled: true,
      netplayServerUrl: "wss://netplay.example.com",
      profileLibraryFilter: true,
      cloudLibraries: [{
        id: "drive",
        provider: "gdrive",
        name: "Drive",
        enabled: true,
        config: '{"accessToken":"token"}',
      }],
    });
    const apiKeyStore = new ApiKeyStore({ storage: memoryStorage(), providers: [] });

    buildAccountTab(container, settings, vi.fn(), apiKeyStore);

    const summary = container.querySelector(".account-summary");
    expect(summary?.textContent).toContain("Active profile");
    expect(summary?.textContent).toContain("Default");
    expect(summary?.textContent).toContain("Filtered");
    expect(summary?.textContent).toContain("Ready");
    expect(summary?.textContent).toContain("1 source");
  });
});
