import { describe, it, expect } from "vitest";
import {
  buildProfileSnapshot,
  parseProfileSnapshot,
  applyProfileSnapshot,
  serializeProfileSnapshot,
  PROFILE_SNAPSHOT_VERSION,
} from "./profileSnapshot.js";
import { ApiKeyStore } from "./apiKeyStore.js";
import type { Settings } from "./types/settings.js";

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
    netplayUsername: "player1",
    netplayIceServers: [],
    verboseLogging: false,
    cloudLibraries: [{
      id: "src-1",
      provider: "gdrive",
      name: "Drive ROMs",
      enabled: true,
      config: '{"accessToken":"tok"}',
    }],
    libretroMatchingServerUrl: "https://match.example.com",
    audioFilterType: "none",
    audioFilterCutoff: 10000,
    uiMode: "auto",
    libraryLayout: "grid",
    libraryGrouped: false,
    recordPlayHistory: true,
    dynamicResolutionScaling: true,
    uiScale: 1,
  };
}

describe("profileSnapshot", () => {
  it("round-trips export and parse", () => {
    const store = new ApiKeyStore({ providers: [] });
    const snapshot = buildProfileSnapshot({ name: "Test", settings: makeSettings(), apiKeyStore: store });
    const raw = serializeProfileSnapshot(snapshot);
    const parsed = parseProfileSnapshot(raw);
    expect(typeof parsed).not.toBe("string");
    if (typeof parsed === "string") return;
    expect(parsed.version).toBe(PROFILE_SNAPSHOT_VERSION);
    expect(parsed.name).toBe("Test");
    expect(parsed.cloudLibraries).toHaveLength(1);
  });

  it("applyProfileSnapshot returns settings patch", () => {
    const snapshot = buildProfileSnapshot({
      settings: makeSettings(),
      apiKeyStore: new ApiKeyStore({ providers: [] }),
    });
    const applied = applyProfileSnapshot(snapshot);
    expect(applied.settingsPatch.cloudLibraries).toHaveLength(1);
    expect(applied.settingsPatch.netplayUsername).toBe("player1");
  });
});
