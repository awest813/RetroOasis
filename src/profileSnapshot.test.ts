import { describe, it, expect, vi } from "vitest";
import { tagGameForProfile } from "./profileGameTags.js";
import { setGameBacklogStatus } from "./profileBacklog.js";
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
import { DEFAULT_DISPLAY_PREFS } from "./profileDisplayPrefs.js";
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
    profileLibraryFilter: false,
    profileCloudBackupEncrypted: false,
  };
}

describe("profileSnapshot", () => {
  it("includes library game ids when profileId is provided", () => {
    vi.stubGlobal("localStorage", (() => {
      const map = new Map<string, string>();
      return {
        getItem: (k: string) => map.get(k) ?? null,
        setItem: (k: string, v: string) => { map.set(k, v); },
        removeItem: (k: string) => { map.delete(k); },
        clear: () => { map.clear(); },
        get length() { return map.size; },
        key: (i: number) => [...map.keys()][i] ?? null,
      };
    })());
    tagGameForProfile("g1", "profile-1");
    const snapshot = buildProfileSnapshot({
      settings: makeSettings(),
      apiKeyStore: new ApiKeyStore({ providers: [] }),
      profileId: "profile-1",
    });
    expect(snapshot.libraryGameIds).toEqual(["g1"]);
    vi.unstubAllGlobals();
  });

  it("includes backlog game ids when profileId is provided", () => {
    vi.stubGlobal("localStorage", (() => {
      const map = new Map<string, string>();
      return {
        getItem: (k: string) => map.get(k) ?? null,
        setItem: (k: string, v: string) => { map.set(k, v); },
        removeItem: (k: string) => { map.delete(k); },
        clear: () => { map.clear(); },
        get length() { return map.size; },
        key: (i: number) => [...map.keys()][i] ?? null,
      };
    })());
    setGameBacklogStatus("queued-game", "profile-1", true);
    const snapshot = buildProfileSnapshot({
      settings: makeSettings(),
      apiKeyStore: new ApiKeyStore({ providers: [] }),
      profileId: "profile-1",
    });
    expect(snapshot.backlogGameIds).toEqual(["queued-game"]);
    vi.unstubAllGlobals();
  });

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
      settings: {
        ...makeSettings(),
        netplayEnabled: true,
        netplayServerUrl: "wss://netplay.example.com/socket",
        netplayIceServers: [{
          urls: "turn:turn.example.com:3478",
          username: "turn-user",
          credential: "turn-secret",
        }],
      },
      apiKeyStore: new ApiKeyStore({ providers: [] }),
    });
    const applied = applyProfileSnapshot(snapshot);
    expect(applied.settingsPatch.cloudLibraries).toHaveLength(1);
    expect(applied.settingsPatch.netplayEnabled).toBe(true);
    expect(applied.settingsPatch.netplayServerUrl).toBe("wss://netplay.example.com/socket");
    expect(applied.settingsPatch.netplayUsername).toBe("player1");
    expect(applied.settingsPatch.netplayIceServers).toEqual([{
      urls: "turn:turn.example.com:3478",
      username: "turn-user",
      credential: "turn-secret",
    }]);
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

  it("sanitizes malformed cloud libraries and api keys on import", () => {
    const store = new ApiKeyStore({ providers: [] });
    const snapshot = buildProfileSnapshot({ settings: makeSettings(), apiKeyStore: store });
    const raw = JSON.parse(serializeProfileSnapshot(snapshot)) as Record<string, unknown>;
    raw.cloudLibraries = [
      { id: "ok", provider: "gdrive", name: "Good", enabled: true, config: '{"accessToken":"tok"}' },
      { id: "bad-provider", provider: "not-real", name: "Bad", enabled: true, config: "{}" },
      { id: "bad-config", provider: "gdrive", name: "Bad", enabled: true, config: "not-json" },
    ];
    raw.apiKeys = {
      rawg: { key: "secret", enabled: true },
      "bad id!": { key: "drop", enabled: true },
      empty: { key: "", enabled: true },
    };
    raw.backlogGameIds = ["queued", "queued", "", "x".repeat(129)];
    const parsed = parseProfileSnapshot(JSON.stringify(raw));
    expect(typeof parsed).not.toBe("string");
    if (typeof parsed === "string") return;
    expect(parsed.cloudLibraries).toHaveLength(1);
    expect(parsed.cloudLibraries[0]?.id).toBe("ok");
    expect(parsed.apiKeys).toEqual({ rawg: { key: "secret", enabled: true } });
    expect(parsed.backlogGameIds).toEqual(["queued"]);
  });

  it("applyProfileSnapshot tolerates malformed cloudLibraries", () => {
    const store = new ApiKeyStore({ providers: [] });
    const snapshot = buildProfileSnapshot({ settings: makeSettings(), apiKeyStore: store });
    (snapshot as { cloudLibraries: unknown }).cloudLibraries = "not-an-array";
    const applied = applyProfileSnapshot(snapshot);
    expect(Array.isArray(applied.settingsPatch.cloudLibraries)).toBe(true);
    expect(applied.settingsPatch.cloudLibraries).toHaveLength(0);
  });

  it("sanitizes imported Play Together ICE servers", () => {
    const store = new ApiKeyStore({ providers: [] });
    const snapshot = buildProfileSnapshot({ settings: makeSettings(), apiKeyStore: store });
    const raw = JSON.parse(serializeProfileSnapshot(snapshot)) as Record<string, unknown>;
    raw.settingsSubset = {
      ...(raw.settingsSubset as Record<string, unknown>),
      netplayEnabled: true,
      netplayServerUrl: "wss://netplay.example.com",
      netplayIceServers: [
        { urls: [" stun:one.example.com ", ""], username: "u", credential: "c" },
        { urls: 42 },
        { urls: "turn:two.example.com:3478", credential: "secret" },
      ],
    };

    const parsed = parseProfileSnapshot(JSON.stringify(raw));
    expect(typeof parsed).not.toBe("string");
    if (typeof parsed === "string") return;
    expect(parsed.settingsSubset.netplayEnabled).toBe(true);
    expect(parsed.settingsSubset.netplayServerUrl).toBe("wss://netplay.example.com");
    expect(parsed.settingsSubset.netplayIceServers).toEqual([
      { urls: ["stun:one.example.com"], username: "u", credential: "c" },
      { urls: "turn:two.example.com:3478", credential: "secret" },
    ]);
  });

  it("resets display prefs to defaults when snapshot omits displayPrefs", () => {
    const store = new ApiKeyStore({ providers: [] });
    const snapshot = buildProfileSnapshot({
      settings: { ...makeSettings(), uiScale: 1.5, showFPS: true },
      apiKeyStore: store,
    });
    delete snapshot.settingsSubset.displayPrefs;
    const applied = applyProfileSnapshot(snapshot);
    expect(applied.settingsPatch.uiScale).toBe(DEFAULT_DISPLAY_PREFS.uiScale);
    expect(applied.settingsPatch.showFPS).toBe(DEFAULT_DISPLAY_PREFS.showFPS);
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
