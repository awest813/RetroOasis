/**
 * companionProtocol.ts — Wire types for the optional companion server
 * (companion-server Phase 2). Shared shape between the browser CompanionSource
 * and the reference server in `server/`. See docs/COMPANION_SERVER.md.
 */

import type { GameMetadata } from "./library.js";

/** A game as described by the companion server's `GET /library`. */
export interface CompanionGame {
  /** Server-side id — the content hash, used for `/blob/:id` and `/cover/:id`. */
  id: string;
  name: string;
  fileName: string;
  /** RetroOasis system id (e.g. "snes"). */
  systemId: string;
  size: number;
  /** Content hash (defaults to `id`) for cross-source dedupe. */
  contentHash?: string;
  /** Whether the server has cover art for this game. */
  hasCover?: boolean;
  /** Epoch ms the game was indexed. */
  addedAt?: number;
}

/** Response body of `GET /library`. */
export interface CompanionLibraryResponse {
  version: 1;
  games: CompanionGame[];
}

function isCompanionGame(v: unknown): v is CompanionGame {
  if (!v || typeof v !== "object") return false;
  const g = v as Record<string, unknown>;
  return typeof g.id === "string"
    && typeof g.name === "string"
    && typeof g.fileName === "string"
    && typeof g.systemId === "string"
    && typeof g.size === "number";
}

/** Validate a parsed `GET /library` body. */
export function isCompanionLibraryResponse(v: unknown): v is CompanionLibraryResponse {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return r.version === 1 && Array.isArray(r.games) && r.games.every(isCompanionGame);
}

/** Map a server game into the client's GameMetadata shape. */
export function companionGameToMetadata(game: CompanionGame): GameMetadata {
  return {
    id: game.id,
    name: game.name,
    fileName: game.fileName,
    systemId: game.systemId,
    size: game.size,
    addedAt: game.addedAt ?? 0,
    lastPlayedAt: null,
    hasLocalBlob: false,
    hasCoverArt: false,
    contentHash: game.contentHash ?? game.id,
  };
}
