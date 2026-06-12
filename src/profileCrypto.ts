/**
 * profileCrypto.ts — Optional passphrase encryption for profile exports.
 *
 * Uses PBKDF2 (SHA-256) + AES-GCM via Web Crypto. See docs/PROFILE_SYSTEM_PLAN.md.
 */

import type { ProfileSnapshotV1 } from "./profileSnapshot.js";
import { parseProfileSnapshot } from "./profileSnapshot.js";

export const ENCRYPTED_PROFILE_FORMAT = "retro-oasis-profile-encrypted" as const;
export const ENCRYPTED_PROFILE_VERSION = 1 as const;
export const PROFILE_KDF_ITERATIONS = 250_000;
/** Reject untrusted envelopes above this iteration count (PBKDF2 DoS guard). */
export const PROFILE_KDF_ITERATIONS_MAX = 600_000;
/** Max base64-encoded field length in encrypted envelopes (DoS guard). */
export const PROFILE_CRYPTO_MAX_FIELD_B64_LENGTH = 88_000;

export interface EncryptedProfileEnvelopeV1 {
  format: typeof ENCRYPTED_PROFILE_FORMAT;
  version: typeof ENCRYPTED_PROFILE_VERSION;
  kdf: "PBKDF2";
  hash: "SHA-256";
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
}

function getSubtle(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("Web Crypto is not available in this environment.");
  return subtle;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array | null {
  if (value.length > PROFILE_CRYPTO_MAX_FIELD_B64_LENGTH) return null;
  try {
    const binary = atob(value);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

export function isProfileDecryptError(message: string): boolean {
  return message.startsWith("Could not decrypt")
    || message.startsWith("Encrypted profile")
    || message.startsWith("File is not")
    || message.startsWith("Passphrase is required");
}

function isEncryptedEnvelope(parsed: unknown): parsed is EncryptedProfileEnvelopeV1 {
  if (!parsed || typeof parsed !== "object") return false;
  const rec = parsed as Record<string, unknown>;
  return (
    rec.format === ENCRYPTED_PROFILE_FORMAT &&
    rec.version === ENCRYPTED_PROFILE_VERSION &&
    rec.kdf === "PBKDF2" &&
    rec.hash === "SHA-256" &&
    typeof rec.iterations === "number" &&
    typeof rec.salt === "string" &&
    typeof rec.iv === "string" &&
    typeof rec.ciphertext === "string"
  );
}

export function isEncryptedProfileJson(raw: string): boolean {
  try {
    const parsed: unknown = JSON.parse(raw);
    return isEncryptedEnvelope(parsed);
  } catch {
    return false;
  }
}

async function deriveAesKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const subtle = getSubtle();
  const passKey = await subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    passKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Encrypt a plaintext profile JSON string with a user passphrase. */
export async function encryptProfileExport(plaintext: string, passphrase: string): Promise<string> {
  if (!passphrase) throw new Error("Passphrase is required.");
  const subtle = getSubtle();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(passphrase, salt, PROFILE_KDF_ITERATIONS);
  const ciphertext = await subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  const envelope: EncryptedProfileEnvelopeV1 = {
    format: ENCRYPTED_PROFILE_FORMAT,
    version: ENCRYPTED_PROFILE_VERSION,
    kdf: "PBKDF2",
    hash: "SHA-256",
    iterations: PROFILE_KDF_ITERATIONS,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
  return JSON.stringify(envelope, null, 2);
}

/** Decrypt an encrypted profile envelope. Returns an error string on failure. */
export async function decryptProfileExport(envelopeJson: string, passphrase: string): Promise<string> {
  if (!passphrase) return "Passphrase is required.";
  let parsed: unknown;
  try {
    parsed = JSON.parse(envelopeJson);
  } catch {
    return "Encrypted profile file is not valid JSON.";
  }
  if (!isEncryptedEnvelope(parsed)) return "File is not a recognized encrypted profile.";
  if (
    !Number.isFinite(parsed.iterations) ||
    parsed.iterations < 1 ||
    parsed.iterations > PROFILE_KDF_ITERATIONS_MAX
  ) {
    return "Encrypted profile uses unsupported KDF parameters.";
  }
  const salt = base64ToBytes(parsed.salt);
  const iv = base64ToBytes(parsed.iv);
  const ciphertext = base64ToBytes(parsed.ciphertext);
  if (!salt || !iv || !ciphertext) return "Encrypted profile field is too large.";
  const subtle = getSubtle();
  try {
    const key = await deriveAesKey(passphrase, salt, Math.floor(parsed.iterations));
    const plaintext = await subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    return new TextDecoder().decode(plaintext);
  } catch {
    return "Could not decrypt profile. Check the passphrase and try again.";
  }
}

/**
 * Parse a profile import file. Prompts for a passphrase when the file is encrypted.
 * `requestPassphrase` is called only for encrypted files.
 */
export async function parseProfileImportFile(
  raw: string,
  requestPassphrase?: () => Promise<string | null>,
): Promise<ProfileSnapshotV1 | string> {
  if (isEncryptedProfileJson(raw)) {
    if (!requestPassphrase) return "This profile is encrypted. Enter a passphrase to import it.";
    const passphrase = await requestPassphrase();
    if (!passphrase) return "Import cancelled.";
    const decrypted = await decryptProfileExport(raw, passphrase);
    if (isProfileDecryptError(decrypted)) return decrypted;
    return parseProfileSnapshot(decrypted);
  }
  return parseProfileSnapshot(raw);
}
