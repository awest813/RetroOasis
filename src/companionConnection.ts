/**
 * companionConnection.ts — Configure and (de)register the companion server
 * source (companion-server Phase 2).
 *
 * Stores the opt-in server URL + token in localStorage and wires a
 * CompanionSource into the library registry when connected. With no config
 * saved, nothing is registered and the app behaves exactly as today.
 */

import { CompanionSource, type CompanionSourceOptions } from "./companionSource.js";
import { getLibraryRegistry } from "./librarySource.js";

const STORAGE_KEY = "retrooasis.companion";

export interface CompanionConfig {
  url: string;
  token?: string;
}

export interface CompanionTestResult {
  ok: boolean;
  gameCount?: number;
  error?: string;
}

export function getCompanionConfig(): CompanionConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && typeof (parsed as CompanionConfig).url === "string") {
      const cfg = parsed as CompanionConfig;
      return cfg.url ? { url: cfg.url, token: cfg.token } : null;
    }
  } catch {
    /* ignore malformed config */
  }
  return null;
}

export function saveCompanionConfig(config: CompanionConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ url: config.url, token: config.token }));
}

export function clearCompanionConfig(): void {
  localStorage.removeItem(STORAGE_KEY);
}

let _active: CompanionSource | null = null;

/** The currently registered companion source, if any. */
export function getActiveCompanionSource(): CompanionSource | null {
  return _active;
}

/** Create a CompanionSource for the config and register it (replacing any prior). */
export function connectCompanion(
  config: CompanionConfig,
  opts: CompanionSourceOptions = {},
): CompanionSource {
  disconnectCompanion();
  const source = new CompanionSource(config.url, { token: config.token, ...opts });
  getLibraryRegistry().register(source);
  _active = source;
  saveCompanionConfig(config);
  return source;
}

/** Unregister the active companion source (does not clear saved config). */
export function disconnectCompanion(): void {
  if (_active) {
    getLibraryRegistry().unregister(_active.id);
    _active = null;
  }
}

/** Probe a server by listing its library; never throws. */
export async function testCompanionConnection(
  config: CompanionConfig,
  opts: CompanionSourceOptions = {},
): Promise<CompanionTestResult> {
  try {
    const source = new CompanionSource(config.url, { token: config.token, ...opts });
    const games = await source.listGames();
    return { ok: true, gameCount: games.length };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Re-register the companion source from saved config at startup. Returns the
 * source, or null when no companion server is configured.
 */
export function restoreCompanionConnection(opts: CompanionSourceOptions = {}): CompanionSource | null {
  const config = getCompanionConfig();
  return config ? connectCompanion(config, opts) : null;
}

/** Test-only: drop the active source reference (does not touch the registry). */
export function _resetCompanionConnectionForTests(): void {
  _active = null;
}
