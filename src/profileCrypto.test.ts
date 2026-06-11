import { describe, it, expect } from "vitest";
import type { Settings } from "./types/settings.js";
import { ApiKeyStore } from "./apiKeyStore.js";
import {
  buildProfileSnapshot,
  serializeProfileSnapshot,
  PROFILE_SNAPSHOT_VERSION,
} from "./profileSnapshot.js";
import {
  encryptProfileExport,
  decryptProfileExport,
  isEncryptedProfileJson,
  parseProfileImportFile,
  ENCRYPTED_PROFILE_FORMAT,
} from "./profileCrypto.js";

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
  };
}

describe("profileCrypto", () => {
  it("encrypts and decrypts a profile round-trip", async () => {
    const snapshot = buildProfileSnapshot({
      name: "Encrypted",
      settings: makeSettings(),
      apiKeyStore: new ApiKeyStore({ providers: [] }),
    });
    const plaintext = serializeProfileSnapshot(snapshot);
    const encrypted = await encryptProfileExport(plaintext, "household-secret");
    expect(isEncryptedProfileJson(encrypted)).toBe(true);
    expect(encrypted).toContain(ENCRYPTED_PROFILE_FORMAT);

    const decrypted = await decryptProfileExport(encrypted, "household-secret");
    expect(decrypted).toContain('"name": "Encrypted"');
    expect(decrypted).not.toContain("Could not decrypt");
  });

  it("rejects a wrong passphrase", async () => {
    const snapshot = buildProfileSnapshot({
      settings: makeSettings(),
      apiKeyStore: new ApiKeyStore({ providers: [] }),
    });
    const encrypted = await encryptProfileExport(serializeProfileSnapshot(snapshot), "correct");
    const result = await decryptProfileExport(encrypted, "wrong");
    expect(result).toContain("Could not decrypt");
  });

  it("parseProfileImportFile decrypts encrypted files", async () => {
    const snapshot = buildProfileSnapshot({
      name: "Import me",
      settings: makeSettings(),
      apiKeyStore: new ApiKeyStore({ providers: [] }),
    });
    const encrypted = await encryptProfileExport(serializeProfileSnapshot(snapshot), "pw");
    const parsed = await parseProfileImportFile(encrypted, async () => "pw");
    expect(typeof parsed).not.toBe("string");
    if (typeof parsed === "string") return;
    expect(parsed.version).toBe(PROFILE_SNAPSHOT_VERSION);
    expect(parsed.name).toBe("Import me");
  });
});
