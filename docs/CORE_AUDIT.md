# RetroOasis — Emulator Core Audit

Last updated: 2026-06-10

This document records how RetroOasis loads EmulatorJS WASM cores, what is verified in CI/local tooling, and known gaps.

---

## Architecture

RetroOasis does **not** bundle most cores in git. At game launch, EmulatorJS:

1. Loads `data/loader.js` and `data/src/emulator.js` (vendored in-repo).
2. Reads `cores/reports/<core>.json` for the selected core.
3. Downloads the matching `*-wasm.data` archive from a CDN (or an external bundle URL).

Routing is configured in `src/coreCdn.ts`:

| Mechanism | When used |
|---|---|
| `window.EJS_paths` | CDN cores — maps report + blob filenames to absolute URLs |
| `window.EJS_corePath` | External bundles — single absolute URL (Dreamcast/Flycast) |

### CDN channels

| Channel | Base URL | Cores |
|---|---|---|
| **Stable** | `https://cdn.emulatorjs.org/stable/data/` | Most systems (fceumm, mgba, parallel_n64, etc.) |
| **Nightly (4.3-pre)** | `https://cdn.emulatorjs.org/nightly/data/` | ppsspp, azahar, bsnes, dosbox_pure, freeintv, genesis_plus_gx_wide |

Bundled EmulatorJS runtime version: `data/version.json` → **4.2.3** (stable channel metadata). Nightly cores may be ahead of that label.

### External bundle

| System | Bundle | Location |
|---|---|---|
| Dreamcast (`segaDC`) | `flycast-wasm.data` | `public/cores/flycast-wasm.data` (~1.4 MB) |

Dreamcast is the only system with `corePath` set in `src/systems.ts`. It is included in the PWA precache manifest when present in `dist/cores/`.

---

## Supported systems (27)

All systems are defined in `src/systems.ts`. Prefetch hints for CDN cores live in `CORE_PREFETCH_MAP` inside `src/coreCdn.ts`.

| System ID | Core package | CDN channel | Threads | WebGL2 | BIOS |
|---|---|---|:---:|:---:|:---:|
| psp | ppsspp-thread | nightly | ✓ | ✓ | optional |
| 3ds | azahar-thread | nightly | ✓ | ✓ | — |
| dos | dosbox_pure-thread | nightly | ✓ | — | — |
| snesBsnes | bsnes | nightly | — | — | — |
| segaMDWide | genesis_plus_gx_wide | nightly | — | — | — |
| intv | freeintv | nightly | — | — | — |
| segaDC | flycast | **bundled** | — | ✓ | required |
| nes | fceumm | stable | — | — | — |
| snes | snes9x | stable | — | — | — |
| gba / gb / gbc | gambatte / mgba | stable | — | — | gba optional |
| nds | desmume2015 | stable | — | — | — |
| n64 | parallel_n64 | stable | — | — | — |
| psx | pcsx_rearmed | stable | — | — | ✓ |
| segaMD / CD / GG / MS | genesis_plus_gx | stable | — | — | — |
| sega32x | picodrive | stable | — | — | — |
| segaSaturn | yabause | stable | — | — | — |
| arcade | fbneo | stable | — | — | — |
| mame2003 | mame2003_plus | stable | — | — | — |
| atari2600 / 7800 | stella2014 / prosystem | stable | — | — | — |
| lynx | handy | stable | — | — | — |
| ngp | mednafen_ngp | stable | — | — | — |

**iOS / Safari without SharedArrayBuffer:** threaded cores (PSP, 3DS, DOS) are blocked at launch with a user-facing message.

---

## Prefetch and offline behavior

| Layer | What is warmed | Offline? |
|---|---|---|
| `emulator.prefetchCore()` | `<link rel="prefetch">` for `*-wasm.data` | Only if previously fetched in-session |
| `emulator.prefetchTopSystems()` | History + heavy 3D order (`performance.ts`) | Same |
| PWA precache (`vite.config.ts`) | App shell, `data/loader.js`, **Flycast only** | Dreamcast works offline after install; other cores need prior CDN fetch |
| Browser HTTP cache | Core blobs after first launch | Per-origin, cleared with site data |

`segaDC` is in `HEAVY_3D_CORE_PREFETCH_ORDER` but intentionally **not** in `CORE_PREFETCH_MAP`; prefetch falls back to `system.corePath`.

Startup probes in `src/main.ts` HEAD-check NES (stable), PSP + 3DS (nightly), and Dreamcast (local bundle).

---

## Netplay core coverage

Play Together is limited to systems whose cores support deterministic sync in the current stack: **PSP, N64, NDS, GBA/GBC/GB**. Other systems may launch locally but are not advertised for netplay.

---

## Tooling

| Command | Purpose |
|---|---|
| `npm run doctor` | Local wiring: COI worker, EmulatorJS patches, nightly routing, **Flycast bundle**, prefetch map consistency |
| `npm run audit:cores` | Full audit: local checks + CDN HEAD probes for every `CORE_PREFETCH_MAP` entry |
| `npm run audit:cores -- --local` | Skip network; only bundle + map checks |

CI runs `audit:cores` on pull requests (`.github/workflows/core-audit.yml`).

---

## Known gaps / follow-ups

| Priority | Issue | Notes |
|---|---|---|
| P1 | CDN cores not in PWA precache | By design (multi‑MB blobs); document offline expectations in UI |
| P1 | Version skew stable 4.2.3 vs nightly 4.3-pre | Monitor upstream EmulatorJS releases |
| P2 | No automated ROM smoke tests per core | Manual QA or Playwright with fixture ROMs |
| P2 | WASM module cache | No `wasmCache.ts`; stale modules cleared via browser site data |
| P3 | Selective core precache setting | User-toggle for “download cores for offline” |

---

## Key files

- `src/coreCdn.ts` — CDN URLs, nightly overrides, `probeEmulatorCoreCdn()`
- `src/systems.ts` — per-system metadata and tier settings
- `src/emulator.ts` — launch wiring, prefetch, preflight
- `data/src/emulator.js` — core registration, thread/WebGL guards
- `public/cores/flycast-wasm.data` — Dreamcast bundle
- `tools/doctor.js` / `tools/audit-cores.js` — verification
