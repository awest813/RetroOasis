import { describe, it, expect } from "vitest";
import {
  canRenderProfileShareQr,
  renderProfileShareQrDataUrl,
  PROFILE_SHARE_QR_MAX_BYTES,
} from "./profileQr.js";
import { encodeProfileSharePayload } from "./profileShare.js";

describe("profileQr", () => {
  it("accepts compact share codes within the QR byte budget", () => {
    const code = encodeProfileSharePayload('{"format":"retro-oasis-profile-encrypted","small":true}');
    expect(canRenderProfileShareQr(code)).toBe(true);
    // jsdom may lack a working canvas 2d context; null is acceptable here.
    const dataUrl = renderProfileShareQrDataUrl(code);
    expect(dataUrl === null || dataUrl.startsWith("data:image/png")).toBe(true);
  });

  it("rejects payloads above the QR byte budget", () => {
    const big = "ro-profile:v1:" + "A".repeat(PROFILE_SHARE_QR_MAX_BYTES + 50);
    expect(canRenderProfileShareQr(big)).toBe(false);
    expect(renderProfileShareQrDataUrl(big)).toBeNull();
  });
});
