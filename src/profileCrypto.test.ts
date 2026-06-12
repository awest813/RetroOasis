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
  isProfileDecryptError,
  parseProfileImportFile,
  ENCRYPTED_PROFILE_FORMAT,
  PROFILE_KDF_ITERATIONS_MAX,
  PROFILE_CRYPTO_MAX_FIELD_B64_LENGTH,
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
    profileLibraryFilter: false,
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

  it("rejects envelopes with oversized base64 fields", async () => {
    const snapshot = buildProfileSnapshot({
      settings: makeSettings(),
      apiKeyStore: new ApiKeyStore({ providers: [] }),
    });
    const encrypted = await encryptProfileExport(serializeProfileSnapshot(snapshot), "pw");
    const envelope = JSON.parse(encrypted) as Record<string, unknown>;
    envelope.ciphertext = "A".repeat(PROFILE_CRYPTO_MAX_FIELD_B64_LENGTH + 1);
    const result = await decryptProfileExport(JSON.stringify(envelope), "pw");
    expect(isProfileDecryptError(result)).toBe(true);
    expect(result).toContain("too large");
  });

  it("rejects envelopes with excessive PBKDF2 iterations", async () => {
    const snapshot = buildProfileSnapshot({
      settings: makeSettings(),
      apiKeyStore: new ApiKeyStore({ providers: [] }),
    });
    const encrypted = await encryptProfileExport(serializeProfileSnapshot(snapshot), "pw");
    const envelope = JSON.parse(encrypted) as Record<string, unknown>;
    envelope.iterations = PROFILE_KDF_ITERATIONS_MAX + 1;
    const result = await decryptProfileExport(JSON.stringify(envelope), "pw");
    expect(result).toContain("unsupported KDF");
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
