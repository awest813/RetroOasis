import { describe, it, expect, vi } from "vitest";
import {
  buildProfileSnapshot,
  parseProfileSnapshot,
  applyProfileSnapshot,
  serializeProfileSnapshot,
  clearCloudSaveStorage,
  restoreCloudSaveStorage,
  syncApiKeyStoreFromSnapshot,
  CLOUD_SAVE_STORAGE_KEYS,
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

  it("clearCloudSaveStorage removes all credential keys", () => {
    const storage = new Map<string, string>();
    const ls = {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => { storage.set(k, v); },
      removeItem: (k: string) => { storage.delete(k); },
      clear: () => { storage.clear(); },
      get length() { return storage.size; },
      key: (i: number) => [...storage.keys()][i] ?? null,
    };
    vi.stubGlobal("localStorage", ls);
    for (const key of CLOUD_SAVE_STORAGE_KEYS) ls.setItem(key, "blob");
    clearCloudSaveStorage();
    for (const key of CLOUD_SAVE_STORAGE_KEYS) {
      expect(ls.getItem(key)).toBeNull();
    }
    vi.unstubAllGlobals();
  });

  it("restoreCloudSaveStorage clears stale keys before restoring", () => {
    const storage = new Map<string, string>();
    const ls = {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => { storage.set(k, v); },
      removeItem: (k: string) => { storage.delete(k); },
      clear: () => { storage.clear(); },
      get length() { return storage.size; },
      key: (i: number) => [...storage.keys()][i] ?? null,
    };
    vi.stubGlobal("localStorage", ls);
    ls.setItem(CLOUD_SAVE_STORAGE_KEYS[0]!, "stale");
    ls.setItem(CLOUD_SAVE_STORAGE_KEYS[1]!, "also-stale");
    restoreCloudSaveStorage({ [CLOUD_SAVE_STORAGE_KEYS[0]!]: "restored" });
    expect(ls.getItem(CLOUD_SAVE_STORAGE_KEYS[0]!)).toBe("restored");
    expect(ls.getItem(CLOUD_SAVE_STORAGE_KEYS[1]!)).toBeNull();
    vi.unstubAllGlobals();
  });

  it("syncApiKeyStoreFromSnapshot removes keys absent from the snapshot", () => {
    const providers = [
      { id: "rawg", name: "RAWG", description: "", signupUrl: "", validate: () => true as const },
      { id: "moby", name: "Moby", description: "", signupUrl: "", validate: () => true as const },
    ];
    const store = new ApiKeyStore({ providers });
    store.setKey("rawg", "keep-me");
    store.setKey("moby", "drop-me");
    const snapshot = buildProfileSnapshot({
      settings: makeSettings(),
      apiKeyStore: new ApiKeyStore({
        providers,
        storage: (() => {
          const map = new Map<string, string>();
          return {
            getItem: (k: string) => map.get(k) ?? null,
            setItem: (k: string, v: string) => { map.set(k, v); },
            removeItem: (k: string) => { map.delete(k); },
            clear: () => { map.clear(); },
            get length() { return map.size; },
            key: (i: number) => [...map.keys()][i] ?? null,
          };
        })(),
      }),
    });
    snapshot.apiKeys = { rawg: { key: "keep-me", enabled: true } };
    syncApiKeyStoreFromSnapshot(store, snapshot);
    expect(store.getState("rawg").key).toBe("keep-me");
    expect(store.getState("moby").key).toBe("");
  });
});
