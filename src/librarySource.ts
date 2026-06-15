/**
 * librarySource.ts — Pluggable library sources (companion-server Phase 1).
 *
 * Today the app reads games from one place: the local IndexedDB `GameLibrary`.
 * Cloud-indexed games are already folded into it as virtual entries. This module
 * names the abstraction that implicitly exists — a `LibrarySource` — and adds a
 * registry that can merge several sources (local + a future companion server)
 * behind one read API, deduping the same game across sources.
 *
 * Phase 1 is a pure, additive refactor: `GameLibrary` implements `LibrarySource`
 * and registers itself as the "local" source. Existing read paths are unchanged;
 * the registry is the seam a `CompanionSource` plugs into later (see
 * docs/COMPANION_SERVER.md).
 */

import type { GameMetadata } from "./library.js";

export type LibrarySourceKind = "local" | "cloud" | "companion";

/** A place games can be listed and their payloads fetched from. */
export interface LibrarySource {
  /** Stable, unique source id (e.g. "local", or a server URL hash). */
  readonly id: string;
  readonly kind: LibrarySourceKind;
  /** Lightweight metadata for every game this source exposes (no ROM blobs). */
  listGames(): Promise<GameMetadata[]>;
  /** The ROM payload for a game, or null if unavailable. */
  getGameBlob(gameId: string): Promise<Blob | null>;
  /** Cover art for a game, or null if none. */
  getCoverArt(gameId: string): Promise<Blob | null>;
}

/** A game tagged with the source it came from (for blob/cover routing). */
export type SourcedGame = GameMetadata & { sourceId: string };

/** Lower number = higher priority when deduping (local wins). */
const KIND_PRIORITY: Record<LibrarySourceKind, number> = {
  local: 0,
  cloud: 1,
  companion: 2,
};

/**
 * Dedupe key for merging the same game seen in multiple sources. Prefers a
 * content hash when present (so a local copy and a server copy of the same ROM
 * collapse to one entry); otherwise falls back to the per-source id, which keeps
 * distinct games distinct but cannot cross-source dedupe without a hash.
 */
export function mergeKey(game: GameMetadata): string {
  const hash = (game as { contentHash?: string }).contentHash;
  return hash ? `hash:${hash}` : `id:${game.id}`;
}

/** Holds the registered library sources and presents a merged read view. */
export class LibrarySourceRegistry {
  private readonly sources = new Map<string, LibrarySource>();

  register(source: LibrarySource): void {
    this.sources.set(source.id, source);
  }

  unregister(id: string): void {
    this.sources.delete(id);
  }

  get(id: string): LibrarySource | undefined {
    return this.sources.get(id);
  }

  has(id: string): boolean {
    return this.sources.has(id);
  }

  /** Registered sources, ordered by dedupe priority (local first). */
  list(): LibrarySource[] {
    return [...this.sources.values()].sort(
      (a, b) => KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind],
    );
  }

  /**
   * Merge games across all sources, deduped by {@link mergeKey}. Higher-priority
   * sources (local) win on conflict. A source that throws is skipped so one bad
   * source can't blank the whole library.
   */
  async listGames(): Promise<SourcedGame[]> {
    const ordered = this.list();
    const collected = await Promise.all(
      ordered.map(async (source) => {
        try {
          return { source, games: await source.listGames() };
        } catch {
          return { source, games: [] as GameMetadata[] };
        }
      }),
    );

    const byKey = new Map<string, SourcedGame>();
    for (const { source, games } of collected) {
      for (const game of games) {
        const key = mergeKey(game);
        if (!byKey.has(key)) byKey.set(key, { ...game, sourceId: source.id });
      }
    }
    return [...byKey.values()];
  }

  /** Fetch a ROM blob from a specific source. */
  async getGameBlob(sourceId: string, gameId: string): Promise<Blob | null> {
    return (await this.sources.get(sourceId)?.getGameBlob(gameId)) ?? null;
  }

  /** Fetch cover art from a specific source. */
  async getCoverArt(sourceId: string, gameId: string): Promise<Blob | null> {
    return (await this.sources.get(sourceId)?.getCoverArt(gameId)) ?? null;
  }
}

let _registry: LibrarySourceRegistry | null = null;

/** The process-wide library source registry. */
export function getLibraryRegistry(): LibrarySourceRegistry {
  return (_registry ??= new LibrarySourceRegistry());
}

/** Test-only: drop the singleton registry. */
export function _resetLibraryRegistryForTests(): void {
  _registry = null;
}
