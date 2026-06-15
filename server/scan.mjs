/**
 * scan.mjs — Reference companion-server filesystem scanner (Phase 2).
 *
 * Pure-ish logic for turning a `/roms/<platform>/<game>` tree into a library
 * index. Filesystem and hashing are injectable so the core is unit-testable.
 * See docs/COMPANION_SERVER.md.
 */

import { promises as nodeFs } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

// Minimal extension → system map (a subset of the client's systems.ts). The
// folder name is the stronger signal; extension is the fallback.
const EXT_TO_SYSTEM = {
  sfc: "snes", smc: "snes", nes: "nes", gba: "gba", gbc: "gbc", gb: "gb",
  n64: "n64", z64: "n64", v64: "n64", nds: "nds", gen: "segaMD", md: "segaMD",
  smd: "segaMD", sms: "segaMS", gg: "segaGG", pce: "pce", a26: "atari2600",
};

const FOLDER_TO_SYSTEM = {
  snes: "snes", "super nintendo": "snes", nes: "nes", famicom: "nes",
  gba: "gba", "game boy advance": "gba", gbc: "gbc", gb: "gb",
  n64: "n64", "nintendo 64": "n64", nds: "nds", "nintendo ds": "nds",
  psx: "psx", ps1: "psx", playstation: "psx", psp: "psp",
  genesis: "segaMD", "mega drive": "segaMD", megadrive: "segaMD",
  "master system": "segaMS", sms: "segaMS", "game gear": "segaGG",
  dreamcast: "segaDC", saturn: "segaSaturn", arcade: "arcade",
};

const SKIP_EXT = new Set(["txt", "nfo", "dat", "xml", "jpg", "jpeg", "png", "db", "ini"]);

function ext(name) {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

function normalizeFolder(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Infer a system id from a file's path relative to the roms root. */
export function inferSystem(relPath) {
  const parts = relPath.split("/");
  const parent = parts.length > 1 ? normalizeFolder(parts[parts.length - 2]) : "";
  if (FOLDER_TO_SYSTEM[parent]) return FOLDER_TO_SYSTEM[parent];
  const e = ext(parts[parts.length - 1]);
  return EXT_TO_SYSTEM[e] ?? null;
}

/** Default content hash: sha1 over a stable identity (path + size). */
export function defaultHash(relPath, size) {
  return createHash("sha1").update(`${relPath}:${size}`).digest("hex");
}

/**
 * Walk `rootDir` and build the library index. Returns
 * `{ games: CompanionGame[], byId: Map<id, { absPath, game }> }`.
 *
 * @param rootDir absolute path to the roms root
 * @param opts.fs   fs.promises-like (readdir withFileTypes, stat)
 * @param opts.hash (relPath, size) => string content id
 */
export async function scanRoms(rootDir, opts = {}) {
  const fs = opts.fs ?? nodeFs;
  const hash = opts.hash ?? defaultHash;
  const games = [];
  const byId = new Map();

  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(abs);
        continue;
      }
      const relPath = path.relative(rootDir, abs).split(path.sep).join("/");
      const fileExt = ext(entry.name);
      if (!fileExt || SKIP_EXT.has(fileExt) || entry.name.startsWith(".")) continue;
      const systemId = inferSystem(relPath);
      if (!systemId) continue;
      const stat = await fs.stat(abs);
      const id = hash(relPath, stat.size);
      const game = {
        id,
        name: entry.name.replace(/\.[^.]+$/, ""),
        fileName: entry.name,
        systemId,
        size: stat.size,
        contentHash: id,
        addedAt: Math.round(stat.mtimeMs ?? Date.now()),
        hasCover: false,
      };
      games.push(game);
      byId.set(id, { absPath: abs, game });
    }
  }

  await walk(rootDir);
  games.sort((a, b) => b.addedAt - a.addedAt);
  return { games, byId };
}

/** Build the `GET /library` response body from a scan result. */
export function buildLibraryResponse(scan) {
  return { version: 1, games: scan.games };
}
