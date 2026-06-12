import { describe, it, expect } from "vitest";
import type { Settings } from "./types/settings.js";
import { ApiKeyStore } from "./apiKeyStore.js";
import { buildProfileSnapshot, serializeProfileSnapshot, PROFILE_SNAPSHOT_VERSION } from "./profileSnapshot.js";
import { encryptProfileExport } from "./profileCrypto.js";
import {
  encodeProfileSharePayload,
  decodeProfileSharePayload,
  isProfileShareCode,
  isProfileShareDecodeError,
  parseProfileImportPayload,
  PROFILE_SHARE_PREFIX,
  PROFILE_SHARE_MAX_CHARS,
} from "./profileShare.js";

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
    netplayUsername: "player",
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
  };
}

describe("profileShare", () => {
  it("round-trips compressed share codes", async () => {
    const snapshot = buildProfileSnapshot({
      name: "Shared",
      settings: makeSettings(),
      apiKeyStore: new ApiKeyStore({ providers: [] }),
    });
    const encrypted = await encryptProfileExport(serializeProfileSnapshot(snapshot), "pw");
    const code = encodeProfileSharePayload(encrypted);
    expect(isProfileShareCode(code)).toBe(true);
    expect(code.startsWith(PROFILE_SHARE_PREFIX)).toBe(true);
    const decoded = decodeProfileSharePayload(code);
    expect(decoded).toContain(encrypted.slice(0, 40));
  });

  it("rejects oversized share codes", () => {
    const huge = `${PROFILE_SHARE_PREFIX}${"A".repeat(PROFILE_SHARE_MAX_CHARS)}`;
    const decoded = decodeProfileSharePayload(huge);
    expect(isProfileShareDecodeError(decoded)).toBe(true);
    expect(decoded).toContain("too large");
  });

  it("parseProfileImportPayload accepts share codes", async () => {
    const snapshot = buildProfileSnapshot({
      name: "Shared",
      settings: makeSettings(),
      apiKeyStore: new ApiKeyStore({ providers: [] }),
    });
    const encrypted = await encryptProfileExport(serializeProfileSnapshot(snapshot), "pw");
    const code = encodeProfileSharePayload(encrypted);
    const parsed = await parseProfileImportPayload(code, async () => "pw");
    expect(typeof parsed).not.toBe("string");
    if (typeof parsed === "string") return;
    expect(parsed.version).toBe(PROFILE_SNAPSHOT_VERSION);
    expect(parsed.name).toBe("Shared");
  });
});
