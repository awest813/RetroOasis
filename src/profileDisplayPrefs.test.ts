import { describe, it, expect } from "vitest";
import type { Settings } from "./types/settings.js";
import {
  pickDisplayPrefs,
  displayPrefsToSettingsPatch,
  parseDisplayPrefs,
} from "./profileDisplayPrefs.js";
import { buildProfileSnapshot, applyProfileSnapshot } from "./profileSnapshot.js";
import { ApiKeyStore } from "./apiKeyStore.js";

function makeSettings(): Settings {
  return {
    volume: 0.5,
    lastGameName: null,
    performanceMode: "quality",
    showFPS: true,
    showAudioVis: false,
    useWebGPU: true,
    postProcessEffect: "none",
    autoSaveEnabled: true,
    coreOptions: {},
    orientationLock: false,
    netplayEnabled: false,
    netplayServerUrl: "",
    netplayUsername: "",
    netplayIceServers: [],
    verboseLogging: false,
    cloudLibraries: [],
    libretroMatchingServerUrl: "",
    audioFilterType: "lowpass",
    audioFilterCutoff: 8000,
    uiMode: "lite",
    libraryLayout: "list",
    libraryGrouped: true,
    recordPlayHistory: true,
    dynamicResolutionScaling: false,
    uiScale: 1.25,
    profileLibraryFilter: true,
  };
}

describe("profileDisplayPrefs", () => {
  it("round-trips display prefs through profile snapshots", () => {
    const settings = makeSettings();
    const snapshot = buildProfileSnapshot({
      settings,
      apiKeyStore: new ApiKeyStore({ providers: [] }),
    });
    expect(snapshot.settingsSubset.displayPrefs?.performanceMode).toBe("quality");
    expect(snapshot.settingsSubset.displayPrefs?.uiScale).toBe(1.25);

    const applied = applyProfileSnapshot(snapshot);
    expect(applied.settingsPatch.performanceMode).toBe("quality");
    expect(applied.settingsPatch.uiScale).toBe(1.25);
    expect(applied.settingsPatch.profileLibraryFilter).toBe(true);
  });

  it("parseDisplayPrefs rejects malformed input", () => {
    expect(parseDisplayPrefs({ volume: "bad" })).toBeUndefined();
    const prefs = parseDisplayPrefs(pickDisplayPrefs(makeSettings()));
    expect(prefs?.libraryLayout).toBe("list");
    expect(displayPrefsToSettingsPatch(prefs).uiMode).toBe("lite");
  });
});
