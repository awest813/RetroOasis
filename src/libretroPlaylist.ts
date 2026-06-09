/**
 * libretroPlaylist.ts — RetroArch .lpl playlist parsing (libretro-database format).
 */
import { libretroDbNameToSystemId } from "./libretroCoreInfo.js";
import { getSystemByCoreHint } from "./systems.js";

export interface LibretroPlaylistItem {
  path: string;
  label: string;
  corePath?: string;
  coreName?: string;
  crc32?: string;
  dbName?: string;
}

export interface LibretroPlaylist {
  version?: string;
  items: LibretroPlaylistItem[];
}

function normalizePlaylistItem(raw: Record<string, unknown>): LibretroPlaylistItem | null {
  const path = typeof raw.path === "string" ? raw.path.trim() : "";
  const label = typeof raw.label === "string" ? raw.label.trim() : "";
  if (!path && !label) return null;

  return {
    path,
    label: label || path.replace(/^.*[\\/]/, "").replace(/\.[^.]+$/, ""),
    corePath: typeof raw.core_path === "string" ? raw.core_path : undefined,
    coreName: typeof raw.core_name === "string" ? raw.core_name : undefined,
    crc32: typeof raw.crc32 === "string" ? raw.crc32 : undefined,
    dbName: typeof raw.db_name === "string" ? raw.db_name : undefined,
  };
}

/**
 * Parse a RetroArch JSON playlist (.lpl).
 * Returns null when the text is not valid playlist JSON.
 */
export function parseLibretroPlaylist(text: string): LibretroPlaylist | null {
  if (!text.trim()) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;

  const root = parsed as Record<string, unknown>;
  const rawItems = Array.isArray(root.items) ? root.items : [];
  const items: LibretroPlaylistItem[] = [];

  for (const entry of rawItems) {
    if (!entry || typeof entry !== "object") continue;
    const item = normalizePlaylistItem(entry as Record<string, unknown>);
    if (item) items.push(item);
  }

  if (items.length === 0) return null;

  return {
    version: typeof root.version === "string" ? root.version : undefined,
    items,
  };
}

export function isRemotePlaylistPath(path: string): boolean {
  return /^https?:\/\//i.test(path.trim());
}

/**
 * Infer RetroOasis systemId from playlist metadata (db_name, core_name).
 */
export function resolveSystemIdFromPlaylistItem(item: LibretroPlaylistItem): string | undefined {
  const fromDb = libretroDbNameToSystemId(item.dbName);
  if (fromDb) return fromDb;

  const core = item.coreName?.trim();
  if (!core || core === "DETECT") return undefined;

  return getSystemByCoreHint(core)?.id;
}

/**
 * Resolve system for a playlist using the first item with enough metadata.
 */
export function resolveSystemIdFromPlaylist(playlist: LibretroPlaylist): string | undefined {
  for (const item of playlist.items) {
    const id = resolveSystemIdFromPlaylistItem(item);
    if (id) return id;
  }
  return undefined;
}
