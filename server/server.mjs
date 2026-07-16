/**
 * server.mjs — Minimal reference companion server (Phase 2, read-only).
 *
 * Scans a roms directory and serves:
 *   GET /health        → { ok: true }
 *   GET /library       → CompanionLibraryResponse
 *   GET /blob/:id      → ROM bytes
 *   GET /cover/:id     → cover bytes (404 in this reference build)
 *
 * Emulation runs in the browser client; this only supplies metadata + payloads.
 * Dependency-free (Node built-ins only). Run: `node server.mjs`. Configure via
 * env: ROMS_DIR (default ./roms), PORT (default 8723), AUTH_TOKEN (optional).
 *
 * SECURITY: bind to localhost or a trusted LAN. When AUTH_TOKEN is set, all
 * routes except /health require `Authorization: Bearer <token>`. Blob reads are
 * restricted to files discovered by the scan (no path traversal).
 */

import { createServer } from "node:http";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { timingSafeEqual } from "node:crypto";
import { scanRoms, buildLibraryResponse } from "./scan.mjs";

const ROMS_DIR = path.resolve(process.env.ROMS_DIR ?? "./roms");
const PORT = Number(process.env.PORT ?? 8723);
const AUTH_TOKEN = process.env.AUTH_TOKEN ?? "";

let index = { games: [], byId: new Map() };

async function rescan() {
  index = await scanRoms(ROMS_DIR);
  console.log(`[companion] indexed ${index.games.length} games from ${ROMS_DIR}`);
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
}

function json(res, status, body) {
  cors(res);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function authorized(req) {
  if (!AUTH_TOKEN) return true;

  const expectedTokenStr = `Bearer ${AUTH_TOKEN}`;
  const providedTokenStr = req.headers.authorization || "";

  const expectedBuffer = Buffer.from(expectedTokenStr, "utf8");
  const providedBuffer = Buffer.from(providedTokenStr, "utf8");

  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, providedBuffer);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const route = url.pathname;

  if (req.method === "OPTIONS") { cors(res); res.writeHead(204); res.end(); return; }
  if (route === "/health") return json(res, 200, { ok: true });

  if (!authorized(req)) return json(res, 401, { error: "unauthorized" });

  if (route === "/library") {
    return json(res, 200, buildLibraryResponse(index));
  }

  const blobMatch = route.match(/^\/blob\/([^/]+)$/);
  if (blobMatch) {
    const entry = index.byId.get(decodeURIComponent(blobMatch[1]));
    if (!entry) return json(res, 404, { error: "not found" });
    try {
      const stat = await fs.stat(entry.absPath);
      cors(res);
      res.writeHead(200, {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(stat.size),
        "Accept-Ranges": "bytes",
      });
      createReadStream(entry.absPath).pipe(res);
    } catch {
      json(res, 404, { error: "not found" });
    }
    return;
  }

  if (/^\/cover\/[^/]+$/.test(route)) {
    // Cover art is not indexed in this reference build.
    return json(res, 404, { error: "no cover" });
  }

  json(res, 404, { error: "not found" });
});

await rescan();
server.listen(PORT, () => {
  console.log(`[companion] listening on http://localhost:${PORT} (roms: ${ROMS_DIR})`);
  if (!AUTH_TOKEN) console.log("[companion] WARNING: no AUTH_TOKEN set — bind to a trusted network only.");
});
