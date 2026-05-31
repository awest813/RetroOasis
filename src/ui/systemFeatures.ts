import { type SystemInfo } from "../systems.js";
import { isNetplaySupportedSystemId } from "../multiplayerUtils.js";
import { createElement as make } from "./dom.js";

type SystemFeaturePill = {
  label: string;
  title: string;
  tone?: "accent" | "warn" | "neutral";
};

export function getSystemFeaturePills(
  system: SystemInfo | undefined,
  opts: { includeExperimental?: boolean; includeOnline?: boolean; max?: number } = {},
  appName = "RetroOasis",
): SystemFeaturePill[] {
  if (!system) return [];

  const { includeExperimental = true, includeOnline = false, max } = opts;
  const pills: SystemFeaturePill[] = [];

  if (includeExperimental && system.experimental) {
    pills.push({
      label: "Experimental",
      title: system.stabilityNotice ?? "Support for this system is still being stabilized.",
      tone: "warn",
    });
  }
  if (system.is3D) {
    pills.push({
      label: "3D core",
      title: `${system.name} uses a heavier 3D rendering core and benefits from tuned graphics settings.`,
      tone: "accent",
    });
  } else {
    pills.push({
      label: "2D core",
      title: `${system.name} uses a lightweight 2D core and is highly performant on all devices.`,
      tone: "neutral",
    });
  }
  if (system.needsBios) {
    pills.push({
      label: "BIOS",
      title: `${system.name} needs system files for the best compatibility.`,
      tone: "neutral",
    });
  } else if (system.id === "segaDC") {
    pills.push({
      label: "HLE BIOS",
      title: "Flycast can boot most Dreamcast games with its built-in HLE BIOS. Dumped boot/flash files are optional compatibility boosters.",
      tone: "neutral",
    });
  }
  if (system.needsWebGL2) {
    pills.push({
      label: "WebGL 2",
      title: `${system.name} needs WebGL 2 support in the browser.`,
      tone: "neutral",
    });
  }
  if (system.needsThreads) {
    pills.push({
      label: "Threaded core",
      title: "Uses additional CPU threads and requires SharedArrayBuffer (cross-origin isolation).",
      tone: "neutral",
    });
  }
  if (system.touchControlMode === "builtin") {
    pills.push({
      label: "Touch UI",
      title: "This system has built-in stylus/touch input in the emulator core.",
      tone: "neutral",
    });
  }
  if (system.hasAchievements) {
    pills.push({
      label: "RetroAchievements",
      title: "Games may unlock RetroAchievements.org rewards when you are logged in.",
      tone: "accent",
    });
  }
  if (includeOnline && isNetplaySupportedSystemId(system.id)) {
    pills.push({
      label: "Play Together",
      title: `${system.name} supports ${appName} Play Together multiplayer.`,
      tone: "accent",
    });
  }

  return typeof max === "number" ? pills.slice(0, max) : pills;
}

export function buildSystemFeatureRow(
  system: SystemInfo | undefined,
  opts: { includeExperimental?: boolean; includeOnline?: boolean; max?: number; className?: string } = {},
  appName?: string,
): HTMLElement | null {
  const pills = getSystemFeaturePills(system, opts, appName);
  if (pills.length === 0) return null;

  const row = make("div", { class: opts.className ?? "system-feature-row" });
  for (const pill of pills) {
    const cls = ["system-feature-chip"];
    if (pill.tone) cls.push(`system-feature-chip--${pill.tone}`);
    row.appendChild(make("span", { class: cls.join(" "), title: pill.title }, pill.label));
  }
  return row;
}
