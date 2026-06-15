# RetroOasis Companion Server (reference, Phase 2)

A minimal, dependency-free reference implementation of the optional companion
server described in [`docs/COMPANION_SERVER.md`](../docs/COMPANION_SERVER.md).
It scans a `roms/` directory and serves a library index plus ROM payloads to the
RetroOasis browser client, which still does all emulation locally.

> **Status:** read-only (browse + fetch). Save sync, multi-user auth, cover art,
> and background jobs are later phases. This is a starting point, not a hardened
> deployment.

## Run

```bash
cd server
ROMS_DIR=/path/to/roms AUTH_TOKEN=your-secret node server.mjs
```

Environment:

| Var | Default | Purpose |
| --- | --- | --- |
| `ROMS_DIR` | `./roms` | Root of your `roms/<platform>/<game>` tree |
| `PORT` | `8723` | Listen port |
| `AUTH_TOKEN` | _(unset)_ | When set, all routes except `/health` require `Authorization: Bearer <token>` |

Organise ROMs by platform folder so the scanner can infer systems, e.g.
`roms/snes/Chrono Trigger.sfc`, `roms/psx/FF7/FF7.cue`.

## Endpoints

| Method | Path | Description |
| --- | --- | --- |
| GET | `/health` | Liveness check (no auth) |
| GET | `/library` | `{ version: 1, games: CompanionGame[] }` |
| GET | `/blob/:id` | ROM bytes for a game id (supports range) |
| GET | `/cover/:id` | Cover art (404 in this reference build) |

The wire shape matches `src/companionProtocol.ts` in the client.

## Connect from the client

The browser side registers a `CompanionSource` (`src/companionSource.ts`) via
`connectCompanion({ url, token })` (`src/companionConnection.ts`), which adds it
to the library source registry. Wiring this into the Connections settings UI and
caching fetched ROMs for offline play is the next step (Phase 2b).

## Security

- Prefer binding to `localhost` or a trusted LAN; put it behind a reverse proxy
  with TLS for remote access.
- Always set `AUTH_TOKEN` when exposed beyond localhost.
- Blob reads are limited to files discovered by the scan — no path traversal.
