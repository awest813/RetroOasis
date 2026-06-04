/**
 * coreCdn.ts — EmulatorJS WASM core CDN URL wiring and reachability probes.
 *
 * The frontend does not bundle cores in git; at launch, EmulatorJS downloads
 * `cores/reports/<core>.json` then the matching `*-wasm.data` archive. RetroOasis
 * steers those requests via `window.EJS_paths` (CDN) or `window.EJS_corePath`
 * (external bundles such as Flycast).
 */

import { getSystemById, type SystemInfo } from "./systems.js";

export const EJS_CDN_BASE = "https://cdn.emulatorjs.org/stable/data/";
export const EJS_NIGHTLY_CDN_BASE = "https://cdn.emulatorjs.org/nightly/data/";

/** Maps system id → default prefetch blob path (basename drives core package name). */
const CORE_PREFETCH_MAP: Record<string, string> = {
  psp:        "cores/ppsspp-thread-wasm.data",
  n64:        "cores/parallel_n64-wasm.data",
  psx:        "cores/pcsx_rearmed-wasm.data",
  nds:        "cores/desmume2015-wasm.data",
  gba:        "cores/mgba-wasm.data",
  gb:         "cores/gambatte-wasm.data",
  gbc:        "cores/gambatte-wasm.data",
  nes:        "cores/fceumm-wasm.data",
  snes:       "cores/snes9x-wasm.data",
  snesBsnes:  "cores/bsnes-wasm.data",
  segaMD:     "cores/genesis_plus_gx-wasm.data",
  segaMDWide: "cores/genesis_plus_gx_wide-wasm.data",
  segaCD:     "cores/genesis_plus_gx-wasm.data",
  sega32x:    "cores/picodrive-wasm.data",
  segaGG:     "cores/genesis_plus_gx-wasm.data",
  segaMS:     "cores/genesis_plus_gx-wasm.data",
  arcade:     "cores/fbneo-wasm.data",
  segaSaturn: "cores/yabause-wasm.data",
  mame2003:   "cores/mame2003_plus-wasm.data",
  atari7800:  "cores/prosystem-wasm.data",
  intv:       "cores/freeintv-wasm.data",
  dos:        "cores/dosbox_pure-thread-wasm.data",
  lynx:       "cores/handy-wasm.data",
  ngp:        "cores/mednafen_ngp-wasm.data",
  atari2600:  "cores/stella2014-wasm.data",
  "3ds":      "cores/azahar-thread-wasm.data",
};

const CORE_CDN_BASE_OVERRIDES: Record<string, string> = {
  ppsspp: EJS_NIGHTLY_CDN_BASE,
  azahar: EJS_NIGHTLY_CDN_BASE,
  bsnes: EJS_NIGHTLY_CDN_BASE,
  dosbox_pure: EJS_NIGHTLY_CDN_BASE,
  freeintv: EJS_NIGHTLY_CDN_BASE,
  genesis_plus_gx_wide: EJS_NIGHTLY_CDN_BASE,
};

export function coreNameForSystem(
  system: SystemInfo,
  ejsSettings: Record<string, string>,
): string {
  if (ejsSettings.retroarch_core) return ejsSettings.retroarch_core;
  const relPath = CORE_PREFETCH_MAP[system.id];
  const fileName = relPath?.split("/").pop();
  if (fileName) {
    return fileName.replace(/(?:-thread)?(?:-legacy)?-wasm\.data$/, "");
  }
  return system.coreId ?? system.id;
}

export function cdnBaseForCore(coreName: string): string {
  return CORE_CDN_BASE_OVERRIDES[coreName] ?? EJS_CDN_BASE;
}

function resolveCorePath(corePath: string): string {
  if (/^(?:https?:|blob:|data:)/i.test(corePath)) return corePath;
  if (typeof window === "undefined" || typeof URL !== "function") return corePath;
  return new URL(corePath, window.location.href).toString();
}

/** Result of mapping a system to EmulatorJS `EJS_paths` / `EJS_corePath` globals. */
export interface EjsCorePathsResult {
  corePath?: string;
  paths?: Record<string, string>;
}

/** Build the EmulatorJS core download map for a system + tier settings. */
export function buildEjsCorePaths(
  system: SystemInfo,
  ejsSettings: Record<string, string>,
): EjsCorePathsResult {
  if (system.corePath) {
    return { corePath: resolveCorePath(system.corePath) };
  }

  const selectedCore = coreNameForSystem(system, ejsSettings);
  const runtimeCore = system.coreId ?? system.id;
  const coreCdnBase = cdnBaseForCore(selectedCore);
  const corePathAliases: Record<string, string> = runtimeCore === selectedCore ? {} : {
    [`${runtimeCore}.json`]:                    `${coreCdnBase}cores/reports/${selectedCore}.json`,
    [`${runtimeCore}-wasm.data`]:               `${coreCdnBase}cores/${selectedCore}-wasm.data`,
    [`${runtimeCore}-legacy-wasm.data`]:        `${coreCdnBase}cores/${selectedCore}-legacy-wasm.data`,
    [`${runtimeCore}-thread-wasm.data`]:        `${coreCdnBase}cores/${selectedCore}-thread-wasm.data`,
    [`${runtimeCore}-thread-legacy-wasm.data`]: `${coreCdnBase}cores/${selectedCore}-thread-legacy-wasm.data`,
  };

  const paths: Record<string, string> = {
    ...corePathAliases,
    [`${selectedCore}.json`]:                    `${coreCdnBase}cores/reports/${selectedCore}.json`,
    [`${selectedCore}-wasm.data`]:               `${coreCdnBase}cores/${selectedCore}-wasm.data`,
    [`${selectedCore}-legacy-wasm.data`]:        `${coreCdnBase}cores/${selectedCore}-legacy-wasm.data`,
    [`${selectedCore}-thread-wasm.data`]:        `${coreCdnBase}cores/${selectedCore}-thread-wasm.data`,
    [`${selectedCore}-thread-legacy-wasm.data`]: `${coreCdnBase}cores/${selectedCore}-thread-legacy-wasm.data`,
    ...(selectedCore === "ppsspp"
      ? { "ppsspp-assets.zip": `${coreCdnBase}cores/ppsspp-assets.zip` }
      : {}),
  };

  return { paths };
}

export interface CoreCdnProbeResult {
  ok: boolean;
  url: string;
  status?: number;
  error?: string;
}

/** Verify the frontend can reach the CDN URLs configured for a system's core. */
export async function probeEmulatorCoreCdn(
  systemId: string,
  ejsSettings: Record<string, string> = {},
  opts?: { timeoutMs?: number },
): Promise<CoreCdnProbeResult> {
  const system = getSystemById(systemId);
  if (!system) {
    return { ok: false, url: "", error: `Unknown system: ${systemId}` };
  }

  const built = buildEjsCorePaths(system, ejsSettings);
  if (built.corePath) {
    return probeCoreCdnUrl(built.corePath, opts);
  }

  const selectedCore = coreNameForSystem(system, ejsSettings);
  const reportUrl = built.paths?.[`${selectedCore}.json`];
  if (!reportUrl) {
    return { ok: false, url: "", error: "No core report URL configured" };
  }

  return probeCoreCdnUrl(reportUrl, opts);
}

async function probeCoreCdnUrl(
  url: string,
  opts?: { timeoutMs?: number },
): Promise<CoreCdnProbeResult> {
  const timeoutMs = opts?.timeoutMs ?? 12_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let res = await fetch(url, {
      method: "HEAD",
      mode: "cors",
      signal: controller.signal,
    });

    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, {
        method: "GET",
        mode: "cors",
        signal: controller.signal,
        headers: { Range: "bytes=0-0" },
      });
    }

    if (res.ok) {
      return { ok: true, url, status: res.status };
    }

    return { ok: false, url, status: res.status, error: `HTTP ${res.status}` };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, url, error: message };
  } finally {
    clearTimeout(timer);
  }
}

/** Relative prefetch path for a system id (used by emulator prefetch hints). */
export function corePrefetchRelPath(systemId: string): string | undefined {
  return CORE_PREFETCH_MAP[systemId];
}
