import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Settings } from "../../types/settings.js";
import { buildMultiplayerTab } from "./MultiplayerTab.js";

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

describe("buildMultiplayerTab", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("renders a setup checklist that reflects Play Together readiness", () => {
    const container = document.createElement("div");
    buildMultiplayerTab(container, makeSettings({
      netplayEnabled: true,
      netplayServerUrl: "wss://netplay.example.com",
      netplayIceServers: [{ urls: "turn:turn.example.com:3478" }],
    }), vi.fn());

    const checklist = container.querySelector(".playtogether-checklist");
    expect(checklist?.textContent).toContain("Online play");
    expect(checklist?.textContent).toContain("Server URL");
    expect(checklist?.textContent).toContain("Connection servers");
    expect(container.querySelectorAll(".playtogether-checklist__item--done")).toHaveLength(3);
  });
});
