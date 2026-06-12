/**
 * profileShare.ts — Compressed share codes for encrypted profile transfer.
 *
 * Format: ro-profile:v1:<base64url(gzip(payload))>
 * Payload should already be an encrypted profile envelope JSON string.
 */

import { gzipSync, gunzipSync, strFromU8, strToU8 } from "fflate";
import { parseProfileImportFile } from "./profileCrypto.js";
import type { ProfileSnapshotV1 } from "./profileSnapshot.js";

export const PROFILE_SHARE_PREFIX = "ro-profile:v1:" as const;
/** Practical upper bound for QR encoding; share codes may be longer (copy/paste). */
export const PROFILE_SHARE_QR_MAX_CHARS = 2048;

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array | string {
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
    const binary = atob(padded);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  } catch {
    return "Share code is not valid base64.";
  }
}

export function isProfileShareCode(raw: string): boolean {
  return raw.trim().startsWith(PROFILE_SHARE_PREFIX);
}

export function encodeProfileSharePayload(payload: string): string {
  const compressed = gzipSync(strToU8(payload));
  return `${PROFILE_SHARE_PREFIX}${bytesToBase64Url(compressed)}`;
}

export function decodeProfileSharePayload(code: string): string {
  const trimmed = code.trim();
  if (!trimmed.startsWith(PROFILE_SHARE_PREFIX)) return "Not a RetroOasis profile share code.";
  const encoded = trimmed.slice(PROFILE_SHARE_PREFIX.length);
  if (!encoded) return "Share code is empty.";
  const bytes = base64UrlToBytes(encoded);
  if (typeof bytes === "string") return bytes;
  try {
    return strFromU8(gunzipSync(bytes));
  } catch {
    return "Share code could not be decompressed.";
  }
}

export function canFitProfileShareQr(code: string): boolean {
  return code.length <= PROFILE_SHARE_QR_MAX_CHARS;
}

/**
 * Parse profile import from a file, share code, or raw JSON.
 * Encrypted payloads prompt for a passphrase when needed.
 */
export async function parseProfileImportPayload(
  raw: string,
  requestPassphrase?: () => Promise<string | null>,
): Promise<ProfileSnapshotV1 | string> {
  const trimmed = raw.trim();
  if (isProfileShareCode(trimmed)) {
    const decoded = decodeProfileSharePayload(trimmed);
    if (
      decoded.startsWith("Not a RetroOasis") ||
      decoded.startsWith("Share code")
    ) {
      return decoded;
    }
    return parseProfileImportFile(decoded, requestPassphrase);
  }
  return parseProfileImportFile(trimmed, requestPassphrase);
}
