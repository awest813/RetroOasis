import { describe, it, expect, vi, afterEach } from "vitest";
import {
  threadedCoresSupported,
  threadedCoreBlockedReason,
  canShowIosPwaInstallGuide,
  iosBlockedArchiveExtension,
  coepPolicyForUserAgent,
} from "./safariCompat.js";

describe("safariCompat", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("blocks threaded cores on iOS", () => {
    expect(threadedCoresSupported({ isIOS: true })).toBe(false);
    const reason = threadedCoreBlockedReason(
      { name: "PlayStation Portable", shortName: "PSP", needsThreads: true },
      { isIOS: true },
    );
    expect(reason).toMatch(/iPhone|iPad/i);
  });

  it("allows threaded cores when SAB and COI are available on desktop", () => {
    vi.stubGlobal("SharedArrayBuffer", class {});
    vi.stubGlobal("crossOriginIsolated", true);
    expect(threadedCoresSupported({ isIOS: false })).toBe(true);
  });

  it("detects iOS PWA install guide eligibility", () => {
    vi.stubGlobal("window", {
      matchMedia: () => ({ matches: false }),
    });
    expect(canShowIosPwaInstallGuide({ isIOS: true })).toBe(true);
    expect(canShowIosPwaInstallGuide({ isIOS: false })).toBe(false);
  });

  it("flags 7z and rar as blocked on iOS import", () => {
    expect(iosBlockedArchiveExtension("7z")).toBe(true);
    expect(iosBlockedArchiveExtension("rar")).toBe(true);
    expect(iosBlockedArchiveExtension("zip")).toBe(false);
  });

  it("picks credentialless COEP for Safari user agents", () => {
    const safariUa =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
    const chromeUa =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36";
    expect(coepPolicyForUserAgent(safariUa)).toBe("credentialless");
    expect(coepPolicyForUserAgent(chromeUa)).toBe("require-corp");
  });
});
