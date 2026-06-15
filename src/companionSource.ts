/**
 * companionSource.ts — A LibrarySource backed by an optional self-hosted
 * companion server over HTTP (companion-server Phase 2).
 *
 * Read-only: lists games from `GET /library` and fetches ROM/cover bytes from
 * `GET /blob/:id` / `GET /cover/:id`. Emulation still runs in the browser; this
 * source only supplies metadata and payloads. See docs/COMPANION_SERVER.md.
 */

import type { GameMetadata } from "./library.js";
import type { LibrarySource, LibrarySourceKind } from "./librarySource.js";
import {
  companionGameToMetadata,
  isCompanionLibraryResponse,
} from "./companionProtocol.js";

export interface CompanionSourceOptions {
  /** Bearer token for authenticated servers. */
  token?: string;
  /** Injectable fetch (defaults to global fetch) — used in tests. */
  fetchImpl?: typeof fetch;
  /** Override the source id (defaults to `companion:<baseUrl>`). */
  sourceId?: string;
}

export class CompanionSource implements LibrarySource {
  readonly id: string;
  readonly kind: LibrarySourceKind = "companion";

  private readonly baseUrl: string;
  private readonly token?: string;
  private readonly fetchImpl: typeof fetch;

  constructor(baseUrl: string, opts: CompanionSourceOptions = {}) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.token = opts.token;
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.id = opts.sourceId ?? `companion:${this.baseUrl}`;
  }

  private url(path: string): string {
    return `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
  }

  private headers(): Record<string, string> {
    return this.token ? { Authorization: `Bearer ${this.token}` } : {};
  }

  async listGames(): Promise<GameMetadata[]> {
    const res = await this.fetchImpl(this.url("/library"), { headers: this.headers() });
    if (!res.ok) throw new Error(`companion /library failed: ${res.status}`);
    const data: unknown = await res.json();
    if (!isCompanionLibraryResponse(data)) {
      throw new Error("companion /library returned an unexpected shape");
    }
    return data.games.map(companionGameToMetadata);
  }

  async getGameBlob(gameId: string): Promise<Blob | null> {
    const res = await this.fetchImpl(
      this.url(`/blob/${encodeURIComponent(gameId)}`),
      { headers: this.headers() },
    );
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`companion /blob failed: ${res.status}`);
    return await res.blob();
  }

  async getCoverArt(gameId: string): Promise<Blob | null> {
    const res = await this.fetchImpl(
      this.url(`/cover/${encodeURIComponent(gameId)}`),
      { headers: this.headers() },
    );
    if (!res.ok) return null;
    return await res.blob();
  }
}
