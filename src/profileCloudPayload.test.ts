import { describe, it, expect } from "vitest";
import {
  prepareProfileIndexForCloudUpload,
  parseProfileIndexFromCloudDownload,
} from "./profileCloudPayload.js";

const SAMPLE_INDEX = JSON.stringify({ version: 1, activeId: "a", profiles: {} });

describe("profileCloudPayload", () => {
  it("passes plaintext through unchanged", async () => {
    const result = await prepareProfileIndexForCloudUpload(SAMPLE_INDEX, false);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.raw).toBe(SAMPLE_INDEX);
  });

  it("encrypts and decrypts cloud backup round-trip", async () => {
    const encrypted = await prepareProfileIndexForCloudUpload(
      SAMPLE_INDEX,
      true,
      async () => "cloud-secret",
    );
    expect(encrypted.ok).toBe(true);
    if (!encrypted.ok) return;

    const decrypted = await parseProfileIndexFromCloudDownload(
      encrypted.raw,
      async () => "cloud-secret",
    );
    expect(decrypted.ok).toBe(true);
    if (decrypted.ok) expect(decrypted.raw).toBe(SAMPLE_INDEX);
  });

  it("requires passphrase for encrypted upload", async () => {
    const result = await prepareProfileIndexForCloudUpload(SAMPLE_INDEX, true, async () => null);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("Passphrase");
  });
});
