import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import type { Settings } from "./types/settings.js";
import { ApiKeyStore } from "./apiKeyStore.js";
import { getProfileManager, resetProfileManagerForTests, PROFILE_INDEX_STORAGE_KEY } from "./profileManager.js";

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
    netplayUsername: "alice",
    netplayIceServers: [],
    verboseLogging: false,
    cloudLibraries: [],
    libretroMatchingServerUrl: "",
    audioFilterType: "none",
    audioFilterCutoff: 10000,
    uiMode: "auto",
    libraryLayout: "grid",
    libraryGrouped: false,
    recordPlayHistory: true,
    dynamicResolutionScaling: true,
    uiScale: 1,
    profileLibraryFilter: false,
    ...overrides,
  };
}

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

describe("ProfileManager", () => {
  let storage: Storage;
  let settings: Settings;
  let apiKeyStore: ApiKeyStore;
  let onSettingsChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetProfileManagerForTests();
    storage = memoryStorage();
    settings = makeSettings();
    apiKeyStore = new ApiKeyStore({ storage: memoryStorage(), providers: [] });
    onSettingsChange = vi.fn((patch: Partial<Settings>) => { Object.assign(settings, patch); });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetProfileManagerForTests();
  });

  it("creates a default profile on first init", () => {
    const pm = getProfileManager(storage);
    pm.ensureInitialized({ settings, apiKeyStore, onSettingsChange });
    expect(pm.listProfiles()).toHaveLength(1);
    expect(pm.getActiveProfileName()).toBe("Default");
    expect(storage.getItem(PROFILE_INDEX_STORAGE_KEY)).toContain("Default");
  });

  it("switches profiles and applies settings patch", async () => {
    const pm = getProfileManager(storage);
    const deps = { settings, apiKeyStore, onSettingsChange };
    pm.ensureInitialized(deps);

    const work = pm.createProfile("Work", deps);
    settings.netplayUsername = "work-user";
    pm.saveActiveSnapshot(deps);

    pm.createProfile("Home", deps);
    settings.netplayUsername = "home-user";
    pm.saveActiveSnapshot(deps);

    const ok = await pm.switchProfile(work.id, deps);
    expect(ok).toBe(true);
    expect(pm.getActiveProfileName()).toBe("Work");
    expect(onSettingsChange).toHaveBeenCalled();
  });

  it("debounces auto-save", () => {
    vi.useFakeTimers();
    const pm = getProfileManager(storage);
    const deps = { settings, apiKeyStore, onSettingsChange };
    pm.ensureInitialized(deps);

    pm.scheduleAutoSave(deps);
    pm.scheduleAutoSave(deps);
    vi.advanceTimersByTime(1600);

    const raw = storage.getItem(PROFILE_INDEX_STORAGE_KEY)!;
    expect(raw).toContain("Default");
    vi.useRealTimers();
  });

  it("applies the active profile snapshot on boot when profiles already exist", () => {
    const pm = getProfileManager(storage);
    const deps = { settings, apiKeyStore, onSettingsChange };
    pm.ensureInitialized(deps);
    settings.netplayUsername = "boot-user";
    pm.saveActiveSnapshot(deps);

    settings.netplayUsername = "stale-in-memory";
    resetProfileManagerForTests();
    const pm2 = getProfileManager(storage);
    pm2.ensureInitialized(deps);
    expect(settings.netplayUsername).toBe("boot-user");
  });

  it("renames the active profile", () => {
    const pm = getProfileManager(storage);
    const deps = { settings, apiKeyStore, onSettingsChange };
    pm.ensureInitialized(deps);
    pm.renameActiveProfile("Family");
    expect(pm.getActiveProfileName()).toBe("Family");
    expect(storage.getItem(PROFILE_INDEX_STORAGE_KEY)).toContain("Family");
  });

  it("deletes a profile and switches to another when the active one is removed", () => {
    const pm = getProfileManager(storage);
    const deps = { settings, apiKeyStore, onSettingsChange };
    pm.ensureInitialized(deps);
    const keepId = pm.getActiveProfileId();
    pm.createProfile("Temporary", deps);
    const tempId = pm.getActiveProfileId();
    expect(pm.listProfiles()).toHaveLength(2);

    const ok = pm.deleteProfile(tempId, deps);
    expect(ok).toBe(true);
    expect(pm.listProfiles()).toHaveLength(1);
    expect(pm.getActiveProfileId()).toBe(keepId);
  });

  it("refuses to delete the last profile", () => {
    const pm = getProfileManager(storage);
    const deps = { settings, apiKeyStore, onSettingsChange };
    pm.ensureInitialized(deps);
    expect(pm.deleteProfile(pm.getActiveProfileId(), deps)).toBe(false);
  });

  it("assigns and persists profile colors", () => {
    const pm = getProfileManager(storage);
    const deps = { settings, apiKeyStore, onSettingsChange };
    pm.ensureInitialized(deps);
    expect(pm.getActiveProfileColor()).toMatch(/^#[0-9a-f]{6}$/i);
    pm.setActiveProfileColor("#ff375f");
    expect(pm.getActiveProfileColor()).toBe("#ff375f");
    expect(storage.getItem(PROFILE_INDEX_STORAGE_KEY)).toContain("#ff375f");
  });

  it("merges a remote profile index", () => {
    const pm = getProfileManager(storage);
    const deps = { settings, apiKeyStore, onSettingsChange };
    pm.ensureInitialized(deps);
    const localRaw = pm.exportProfileIndexRaw();

    const remote = JSON.parse(localRaw) as { version: number; activeId: string; profiles: Record<string, unknown> };
    remote.profiles["remote-id"] = {
      meta: { id: "remote-id", name: "Remote", createdAt: 1, updatedAt: 1, color: "#5b8def" },
      snapshot: pm.exportActiveSnapshot(deps),
    };
    const err = pm.importProfileIndexRaw(JSON.stringify(remote), "merge");
    expect(err).toBeNull();
    expect(pm.listProfiles().some((p) => p.id === "remote-id")).toBe(true);
  });

  it("exports a stored profile without switching", () => {
    const pm = getProfileManager(storage);
    const deps = { settings, apiKeyStore, onSettingsChange };
    pm.ensureInitialized(deps);
    settings.netplayUsername = "home";
    pm.saveActiveSnapshot(deps);
    const homeId = pm.getActiveProfileId();

    pm.createProfile("Work", deps);
    settings.netplayUsername = "work";
    pm.saveActiveSnapshot(deps);

    const exported = pm.exportProfileSnapshot(homeId, deps);
    expect(exported?.settingsSubset.netplayUsername).toBe("home");
  });

  it("merges an imported snapshot into the active profile", () => {
    const pm = getProfileManager(storage);
    const deps = { settings, apiKeyStore, onSettingsChange };
    pm.ensureInitialized(deps);
    settings.netplayUsername = "before-merge";
    pm.saveActiveSnapshot(deps);

    const imported = pm.exportActiveSnapshot(deps);
    imported.settingsSubset.netplayUsername = "after-merge";

    pm.importSnapshotIntoActive(imported, deps);
    expect(settings.netplayUsername).toBe("after-merge");
    expect(pm.getActiveProfileName()).toBe("Default");

    settings.netplayUsername = "stale";
    resetProfileManagerForTests();
    const pm2 = getProfileManager(storage);
    pm2.ensureInitialized(deps);
    expect(settings.netplayUsername).toBe("after-merge");
  });

  it("removes API keys that are not in the switched profile", async () => {
    const providers = [
      { id: "rawg", name: "RAWG", description: "", signupUrl: "", validate: () => true as const },
    ];
    apiKeyStore = new ApiKeyStore({ storage: memoryStorage(), providers });
    const deps = { settings, apiKeyStore, onSettingsChange };
    const pm = getProfileManager(storage);
    pm.ensureInitialized(deps);

    apiKeyStore.setKey("rawg", "work-key");
    pm.saveActiveSnapshot(deps);
    const workId = pm.getActiveProfileId();

    pm.createProfile("No Keys", deps);
    apiKeyStore.removeKey("rawg");
    pm.saveActiveSnapshot(deps);
    const noKeysId = pm.getActiveProfileId();

    await pm.switchProfile(workId, deps);
    expect(apiKeyStore.getState("rawg").key).toBe("work-key");

    await pm.switchProfile(noKeysId, deps);
    expect(apiKeyStore.getState("rawg").key).toBe("");
  });
});
