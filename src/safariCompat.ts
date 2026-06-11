/**
 * safariCompat.ts — Safari / iOS browser compatibility helpers.
 */

import type { DeviceCapabilities } from "./performance.js";
import { isLikelyIOS } from "./performance.js";
import type { SystemInfo } from "./systems.js";
import { isPwaDisplayMode } from "./ui/mobile.js";

/** Threaded EmulatorJS cores need SharedArrayBuffer + cross-origin isolation. iOS WebKit cannot provide this today. */
export function threadedCoresSupported(caps?: Pick<DeviceCapabilities, "isIOS">): boolean {
  if (caps?.isIOS ?? isLikelyIOS()) return false;
  if (typeof SharedArrayBuffer === "undefined") return false;
  try {
    return typeof crossOriginIsolated !== "undefined" && crossOriginIsolated;
  } catch {
    return false;
  }
}

/** User-facing reason when a threaded system cannot run on this device. */
export function threadedCoreBlockedReason(
  system: Pick<SystemInfo, "name" | "shortName" | "needsThreads">,
  caps?: Pick<DeviceCapabilities, "isIOS">,
): string | null {
  if (!system.needsThreads) return null;
  if (caps?.isIOS ?? isLikelyIOS()) {
    return `${system.name} needs multi-threaded emulation, which is not supported in iPhone or iPad browsers. Use a Mac or PC instead.`;
  }
  if (!threadedCoresSupported(caps)) {
    return `${system.name} needs cross-origin isolation (SharedArrayBuffer). Reload once the service worker activates, or use Safari 17+ / Chrome on desktop.`;
  }
  return null;
}

/** True when we should show manual “Add to Home Screen” guidance (iOS Safari has no install prompt). */
export function canShowIosPwaInstallGuide(caps?: Pick<DeviceCapabilities, "isIOS">): boolean {
  return (caps?.isIOS ?? isLikelyIOS()) && !isPwaDisplayMode();
}

export const IOS_PWA_INSTALL_HINT =
  "To install on iPhone or iPad: tap Share in Safari, then \"Add to Home Screen\". " +
  "Open RetroOasis from your home screen for a full-screen app experience.";

/** iOS cannot extract 7z/RAR inside the browser tab reliably. */
export function iosBlockedArchiveExtension(ext: string): boolean {
  const normalized = ext.toLowerCase().replace(/^\./, "");
  return normalized === "7z" || normalized === "rar";
}

export function iosBlockedArchiveMessage(fileName: string): string {
  return (
    `"${fileName}" is a compressed archive that cannot be opened inside Safari on iPhone or iPad.\n\n` +
    "Extract it in the Files app or on a computer, then import the ROM file directly."
  );
}

/**
 * COEP value for cross-origin isolation. WebKit (Safari, iOS Chrome) needs
 * `credentialless`; Chromium/Firefox use `require-corp`.
 */
export function coepPolicyForUserAgent(userAgent: string): "credentialless" | "require-corp" {
  const isWebKit =
    (/Safari\//.test(userAgent) && !/Chrome\//.test(userAgent) && !/Chromium\//.test(userAgent)) ||
    /CriOS\//.test(userAgent);
  return isWebKit ? "credentialless" : "require-corp";
}
