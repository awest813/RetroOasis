/**
 * profileQr.ts — Local QR rendering for compact profile share codes.
 */

import qrcodeFactory from "qrcode-generator";
import { canFitProfileShareQr } from "./profileShare.js";

/** Byte-mode QR version 15 (M) holds ~800 bytes — practical for profile share codes. */
export const PROFILE_SHARE_QR_MAX_BYTES = 800;

export function canRenderProfileShareQr(text: string): boolean {
  if (!canFitProfileShareQr(text)) return false;
  return new TextEncoder().encode(text).length <= PROFILE_SHARE_QR_MAX_BYTES;
}

function buildQrMatrix(text: string): ReturnType<typeof qrcodeFactory> | null {
  if (!canRenderProfileShareQr(text)) return null;
  try {
    const qr = qrcodeFactory(0, "M");
    qr.addData(text);
    qr.make();
    return qr;
  } catch {
    return null;
  }
}

/** Draw a QR code onto a canvas and return a PNG data URL. */
export function renderProfileShareQrDataUrl(text: string, size = 240): string | null {
  const qr = buildQrMatrix(text);
  if (!qr || typeof document === "undefined") return null;
  const count = qr.getModuleCount();
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const scale = size / count;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#000000";
  for (let y = 0; y < count; y++) {
    for (let x = 0; x < count; x++) {
      if (qr.isDark(y, x)) {
        ctx.fillRect(Math.floor(x * scale), Math.floor(y * scale), Math.ceil(scale), Math.ceil(scale));
      }
    }
  }
  return canvas.toDataURL("image/png");
}
