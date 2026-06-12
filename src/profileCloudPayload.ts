/**
 * profileCloudPayload.ts — Optional encryption for profile index cloud backup.
 */

import {
  decryptProfileExport,
  encryptProfileExport,
  isEncryptedProfileJson,
  isProfileDecryptError,
} from "./profileCrypto.js";

export type ProfileCloudPayloadResult =
  | { ok: true; raw: string }
  | { ok: false; error: string };

/** Prepare a profile index JSON string for cloud upload (plaintext or encrypted). */
export async function prepareProfileIndexForCloudUpload(
  rawIndex: string,
  encrypt: boolean,
  requestPassphrase?: () => Promise<string | null>,
): Promise<ProfileCloudPayloadResult> {
  if (!encrypt) return { ok: true, raw: rawIndex };
  const passphrase = await requestPassphrase?.();
  if (!passphrase) return { ok: false, error: "Passphrase required for encrypted cloud backup." };
  try {
    return { ok: true, raw: await encryptProfileExport(rawIndex, passphrase) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Encryption failed." };
  }
}

/** Parse a downloaded profile index payload (plaintext or encrypted envelope). */
export async function parseProfileIndexFromCloudDownload(
  payload: string,
  requestPassphrase?: () => Promise<string | null>,
): Promise<ProfileCloudPayloadResult> {
  if (!isEncryptedProfileJson(payload)) return { ok: true, raw: payload };
  const passphrase = await requestPassphrase?.();
  if (!passphrase) return { ok: false, error: "Passphrase required to decrypt cloud profile backup." };
  const decrypted = await decryptProfileExport(payload, passphrase);
  if (isProfileDecryptError(decrypted)) return { ok: false, error: decrypted };
  return { ok: true, raw: decrypted };
}
