import { describe, it, expect } from "vitest";
import {
  canRenderProfileShareQr,
  renderProfileShareQrSvg,
  PROFILE_SHARE_QR_MAX_BYTES,
} from "./profileQr.js";
import { encodeProfileSharePayload } from "./profileShare.js";

describe("profileQr", () => {
  it("renders SVG for compact share codes", () => {
    const code = encodeProfileSharePayload('{"format":"retro-oasis-profile-encrypted","small":true}');
    expect(canRenderProfileShareQr(code)).toBe(true);
    const svg = renderProfileShareQrSvg(code);
    expect(svg).toContain("<svg");
    expect(svg).toContain("path");
  });

  it("rejects payloads above the QR byte budget", () => {
    const big = "ro-profile:v1:" + "A".repeat(PROFILE_SHARE_QR_MAX_BYTES + 50);
    expect(canRenderProfileShareQr(big)).toBe(false);
    expect(renderProfileShareQrSvg(big)).toBeNull();
  });
});
