# Optional Companion Server — Design

> Status: Draft / proposal. Strategic, larger bet than `docs/DIRECTORY_SCAN_IMPORT.md`.
> Goal: lift RetroOasis's structural browser limits (storage quota, no filesystem, per-
> device re-import) for users who opt in to running a small self-hosted server — **without
> compromising the zero-install, fully-local default**.

## Why

RetroOasis's hardest ceilings are intrinsic to being browser-bound (`docs/ARCHITECTURE_MAP.md`):

- **Storage quota** — ROMs, saves, BIOS, states all live in IndexedDB
  (`src/library.ts`, `src/storage.ts`). Big PSP/Dreamcast/multi-disc libraries hit origin
  quota; `src/storage.ts` already nags about pressure.
- **No filesystem** — the browser can't mount an existing `/roms` tree; everything is
  copied in (even directory-scan import copies bytes — see that doc).
- **Per-device re-import** — a new device starts empty. "Sync" today means shuttling blobs
  through consumer cloud providers (`src/cloudSave.ts`, `src/cloudLibrary.ts`), which is
  per-provider, rate-limited, and not a real shared index.

retrom solves all three with a central self-hosted server that **owns the files and the
library index**; clients stay thin. RetroOasis already has the entire emulation,
rendering, netplay, and metadata stack — what it lacks is an authoritative backend. This
design adds one as a **pluggable remote source**, reusing the abstraction the cloud
library code already implies, so the browser app keeps working unchanged when no server is
configured.

## Principles

1. **Opt-in, never required.** Default RetroOasis stays a static, offline-capable PWA. The
   server is a Connections-style toggle, framed like Save Sync is today in `docs/PLAN.md`.
2. **The browser stays the player.** The server stores and indexes; emulation still runs
   in EmulatorJS in the client (where all the perf-tier/WebGPU/netplay value lives). The
   server is *not* a streaming/emulation host in v1.
3. **Reuse, don't fork.** The server speaks the same library/metadata shapes the client
   already uses (`GameMetadata` in `src/library.ts`); it's a new *source*, not a new app.
4. **Local-first caching.** Launching a remote game streams its blob and caches it via the
   existing virtual-game path (`addVirtualGame`/`upsertVirtualGame`/`findVirtualGame` in
   `src/library.ts`) so play works offline after first fetch and respects quota limits.

## Architecture

```
   ┌───────────────────────── RetroOasis browser app (unchanged core) ─────────────────────────┐
   │                                                                                            │
   │   GameLibrary (IndexedDB)        LibrarySource interface (NEW abstraction)                 │
   │        local games  ◄───────────►   • LocalSource      (today's IndexedDB)                 │
   │                                     • CloudSource       (today's cloudLibrary.ts)          │
   │   EmulatorJS player  ◄────────────  • CompanionSource   (NEW) ──┐                          │
   └────────────────────────────────────────────────────────────────┼──────────────────────────┘
                                                                     │ HTTPS (REST + JWT)
                                                                     ▼
                       ┌──────────────────────── Companion Server (NEW, self-hosted) ───────────┐
                       │  • Library index (SQLite): games, systems, hashes, metadata, users     │
                       │  • Filesystem scanner (watches /roms/<platform>/…)                      │
                       │  • Blob endpoints: ranged GET of ROM/BIOS/state by content hash         │
                       │  • Save-state sync store (authoritative, multi-device)                  │
                       │  • Metadata proxy (IGDB/SteamGridDB/ScreenScraper server-side keys)     │
                       │  • Auth (multi-user), background scan/metadata jobs                     │
                       │  Ships as a single Docker image + docker-compose; bind-mount /roms      │
                       └────────────────────────────────────────────────────────────────────────┘
```

### The pivotal abstraction: `LibrarySource`

The whole design hinges on introducing a `LibrarySource` interface that the UI talks to
instead of `GameLibrary` directly. There are already two *de facto* sources — local
IndexedDB and the cloud library index — so this is mostly **naming an abstraction that
implicitly exists**, then adding a third implementation.

```ts
export interface LibrarySource {
  readonly id: string;
  readonly kind: "local" | "cloud" | "companion";
  listGames(): Promise<GameMetadata[]>;        // same shape the UI already renders
  getGameBlob(gameId: string): Promise<Blob>;  // local: IndexedDB; companion: ranged fetch + cache
  getCoverArt(gameId: string): Promise<Blob | null>;
  // saves/states route through the existing saveService + cloudSave abstractions
}
```

- `listGames()` from `CompanionSource` returns server-indexed entries; the library view
  merges/dedupes them with local entries (dedupe by content hash, see below).
- `getGameBlob()` on a remote entry does a **ranged HTTP fetch** of the blob, shows
  progress via the existing `loadingOverlay`, and writes it through
  `GameLibrary.upsertVirtualGame()` so the next launch is local/offline and quota-aware.

This keeps `emulator.ts`, the perf system, and netplay completely untouched — they receive
a `File`/blob exactly as they do today.

## Server

Deliberately small and boring; the client already does the hard real-time work.

- **Language:** any single-binary-friendly runtime. retrom uses Rust; for this repo's
  maintainers, **Go or Node/TypeScript** keeps the stack coherent (shared types with the
  TS client) — recommend TypeScript so `GameMetadata`/system definitions can be shared via
  a small workspace package rather than re-described.
- **Store:** SQLite (zero-config, file-backed) for the index; bind-mounted `/roms` for
  blobs. No object store needed for self-host scale.
- **Identity of a game = content hash** (e.g. SHA-1 of the ROM, the format DAT databases
  and `src/saveService.ts`-style checksums already lean on). This makes dedupe across
  local + companion deterministic and lets save states key off the game, not a path.
- **Scanner:** walks `/roms/<platform>/…` (same convention as the directory-scan doc),
  infers systems from folder + extension using a port of the client's `detectSystem`
  rules, and records hash + size + mtime. Runs as a **background job** with status the
  client can poll — mirroring retrom's long-running scan jobs.
- **Metadata proxy:** holds provider API keys server-side so users configure
  IGDB/SteamGridDB/ScreenScraper once on the server instead of per-device in client
  Connections. The client's free providers (Libretro thumbnails, etc.) still work without
  it.
- **Auth:** username/password → JWT; multi-user so a household shares one server with
  separate save spaces. v1 can be single-user with auth scaffolding in place.

### Endpoints (REST, v1)

| Method | Path | Purpose |
|---|---|---|
| `POST /auth/login` | → JWT | |
| `GET /library` | indexed games (paginated, since-cursor for incremental) | |
| `GET /blob/:hash` | ranged ROM/BIOS bytes | |
| `GET /cover/:gameId` | cover art | |
| `GET /saves/:gameId` / `PUT /saves/:gameId` | authoritative save-state sync | |
| `POST /scan` / `GET /jobs/:id` | trigger + poll background scan | |

REST over gRPC for v1: it's directly reachable from `fetch`, supports HTTP range requests
for blob streaming, and needs no proxy/codegen. (retrom uses gRPC; we don't need the
client tooling cost.)

## Client integration

| Area | Change |
|---|---|
| `src/library.ts` | Extract a `LibrarySource` interface; make today's `GameLibrary` the `LocalSource`. Library view iterates registered sources and merges by content hash. |
| New `src/companionSource.ts` | Implements `LibrarySource` over the REST API; ranged blob fetch → `upsertVirtualGame()` cache. |
| `src/cloudAuth.ts` / Connections UI | Add a "Companion Server" connection (URL + credentials), tested like other providers. |
| `src/saveService.ts` / `src/cloudSave.ts` | Add the companion server as a save-sync target; server saves are authoritative when connected. |
| Settings | Surface server status, last scan time, and job progress. |

Crucially, when **no** companion server is configured, none of this runs — `listGames()`
sees only the `LocalSource` and the app behaves exactly as it does today.

## Relationship to directory-scan import

They compose:

- **Directory scan** (`docs/DIRECTORY_SCAN_IMPORT.md`) = browser-only accelerator that
  still *copies into IndexedDB*. Good for laptops/Chromebooks with no server.
- **Companion server** = the same `/roms/<platform>` convention, but the bytes stay on the
  server and stream on demand, lifting the quota ceiling and giving a real cross-device
  shared index. Implementing directory scan first means the folder-convention + inference
  logic (`FOLDER_ALIASES`, hash-based identity) is already designed and tested when the
  server reuses it.

## Phasing

1. **Abstraction only (no server):** extract `LibrarySource`, refactor `GameLibrary` →
   `LocalSource`, route the existing cloud library through it. Pure refactor, fully tested,
   ships value as cleanup even if the server never lands.
2. **Read-only companion:** server scanner + `GET /library` + `GET /blob` +
   `CompanionSource` with virtual-game caching. Browse and play a server library.
3. **Saves:** authoritative save-state sync via the server.
4. **Multi-user + metadata proxy + job UI.**
5. **Packaging:** Docker image, `docker-compose.yml`, and a `docs/DEPLOYMENT.md` section.

## Risks / open questions

- **Scope creep into a streaming host.** Explicitly out of scope for v1 — emulation stays
  client-side. Revisit only if there's demand for thin-client/handheld targets.
- **Security surface.** A self-hosted server with file access needs sane defaults: auth on
  by default, HTTPS guidance, no directory traversal outside the bind-mounted `/roms`.
  Call this out in `docs/DEPLOYMENT.md` and the privacy posture in `PRIVACY.md`.
- **Maintenance cost of a second codebase.** Mitigated by sharing TypeScript types with the
  client and keeping the server intentionally minimal (index + blobs + saves).
- **Quota interplay.** Streamed-and-cached blobs still consume IndexedDB; the cache needs
  an eviction policy (LRU by last-played) so the server *reduces* rather than duplicates
  local pressure.
