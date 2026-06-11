import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GameMetadata, GameLibrary } from "../library.js";
import type { Settings } from "../types/settings.js";
import { launchGameFromLibrary } from "./launchGame.js";
import { isLaunchInProgress, setLaunchInProgress } from "./launchState.js";

function makeGame(overrides: Partial<GameMetadata> = {}): GameMetadata {
  return {
    id: "game-1",
    name: "Test Game",
    fileName: "test.iso",
    systemId: "psp",
    addedAt: Date.now(),
    size: 1024,
    lastPlayedAt: null,
    ...overrides,
  };
}

function makeLibrary(blob: Blob | null): GameLibrary {
  return {
    getGameBlob: vi.fn(async () => blob),
    markPlayed: vi.fn(async () => {}),
  } as unknown as GameLibrary;
}

const baseSettings = {} as Settings;

describe("launchGameFromLibrary", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="loading-overlay"></div>
      <p id="loading-message"></p>
      <p id="loading-subtitle" hidden></p>
      <div id="error-banner"><span id="error-message"></span></div>
    `;
    setLaunchInProgress(false);
  });

  it("launches when blob is available locally", async () => {
    const blob = new Blob(["rom"]);
    const onLaunchGame = vi.fn(async () => {});
    const onFetchFromCloud = vi.fn();

    await launchGameFromLibrary({
      game: makeGame(),
      library: makeLibrary(blob),
      settings: baseSettings,
      onFetchFromCloud,
      onLaunchGame,
    });

    expect(onLaunchGame).toHaveBeenCalledOnce();
    expect(onFetchFromCloud).not.toHaveBeenCalled();
  });

  it("leaves the global launch flag for the launcher handoff", async () => {
    const blob = new Blob(["rom"]);
    const onLaunchGame = vi.fn(async () => {
      expect(isLaunchInProgress()).toBe(false);
    });

    await launchGameFromLibrary({
      game: makeGame(),
      library: makeLibrary(blob),
      settings: baseSettings,
      onFetchFromCloud: vi.fn(),
      onLaunchGame,
    });

    expect(onLaunchGame).toHaveBeenCalledOnce();
  });

  it("shows error when game blob is missing", async () => {
    const onLaunchGame = vi.fn(async () => {});

    await launchGameFromLibrary({
      game: makeGame(),
      library: makeLibrary(null),
      settings: baseSettings,
      onFetchFromCloud: vi.fn(),
      onLaunchGame,
    });

    expect(onLaunchGame).not.toHaveBeenCalled();
    expect(document.getElementById("error-banner")?.classList.contains("visible")).toBe(true);
  });

  it("skips when a launch is already in progress", async () => {
    setLaunchInProgress(true);
    const onLaunchGame = vi.fn(async () => {});

    await launchGameFromLibrary({
      game: makeGame(),
      library: makeLibrary(new Blob(["rom"])),
      settings: baseSettings,
      onFetchFromCloud: vi.fn(),
      onLaunchGame,
    });

    expect(onLaunchGame).not.toHaveBeenCalled();
    expect(document.getElementById("info-toast")?.textContent).toContain("Already starting");
  });
});
