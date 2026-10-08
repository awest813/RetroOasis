# AGENTS.md

## Cursor Cloud specific instructions

This repo is **EmulatorJS** (a static JS emulation library) plus a fork app **RetroOasis** in `retrooasis/` (a Vite + TypeScript static SPA for browsing a ROM library and launching EmulatorJS). RetroOasis is the active product on this branch.

Dependencies for both the repo root and `retrooasis/` are installed by the startup update script, so you do not need to run installs manually.

### Services / commands

| Command | Purpose |
| ------- | ------- |
| `npm run oasis:dev` | RetroOasis dev server at `http://localhost:5173/` (or `npm run dev` in `retrooasis/`). Vite proxies repo-root `data/` and `roms/`; sets COOP/COEP for threaded cores. |
| `npm run start` | Classic EmulatorJS demo via `http-server` at `http://localhost:8080/` (`index.html`). Separate from RetroOasis. |
| `npm run oasis:build` | Typecheck + Vite build → `retrooasis/dist/` |
| `npm run build` | `oasis:build` + `scripts/sync-pages-dist.mjs` → repo-root `dist/` (GitHub Pages artifact) |
| `npm run oasis:preview` | Preview production build with thread headers |
| `npm run oasis:manifest` | Generate `roms/manifest.json` from hosted ROM folders |
| `npm run oasis:lan:link` | Build the GB/GBC/GBA Trade & link cores (pinned SameBoy + gpSP, Emscripten, RGBDS) into ignored `retrooasis/.handheld-cache/link/`. Needs network once; `npm run test:lan` skips core-backed link checks when absent. |
| `npm run oasis:scan` | Scan `roms/` (+ optional `--covers`) into manifest |
| `npx eslint .` | Lint (repo root). Rules are `warn`-only; ~1600 warnings from minified `data/` are expected and exit 0. |
| `npm run typecheck` in `retrooasis/` | TypeScript check only (`npm --prefix retrooasis run typecheck` from the repo root) |
| `npm run test:archives` in `retrooasis/` | Fixture tests for the zip/7z/rar archive-peek parsers (`src/lib/archives.ts`) |
| `npm run build` in `retrooasis/` | Same as `oasis:build` |

### RetroOasis architecture (quick map)

- **Routes** (`src/lib/router.ts`): hash router — `#/` (XMB home), `#/library`, `#/library/@recent|@favorites|@all`, `#/library/<platform>`, `#/library/tag/<t>` (legacy: opens All games with the tag prefilled as search), `#/game/<id>`, `#/upload`, `#/settings`, `#/saves`
- **Views** (`src/views/`): `xmb.ts` (home shell), `library.ts` (Switch-style flat cover grid: one filter chip row — a swipeable single row on phones, your games A–Z then labelled samples, search; Up/Down leave the search box), `detail.ts` (Play + “＋ Options” vertical menu for favorite/edit/remove), `upload.ts`, `settings.ts` (console-style row focus)
- **Play**: navigates to `public/player.html` with EmulatorJS `EJS_*` globals (iframe isolation)
- **Archives** (`src/lib/archives.ts`): header-only peek into zip/7z/rar for Auto-detect (zip central directory, RAR4/5 block walk, 7z plain header; compressed 7z headers fall back to EmulatorJS's `data/compression/extract7z.js` worker — CDN in production, same-origin on the local channel). EmulatorJS itself extracts archives at play time.
- **Catalog merge** (`src/lib/catalog.ts`): demo JSON → `roms/manifest.json` → IndexedDB uploads → linked local folder
- **Trade & link** (`public/link.html`, `link-host.js`, `link-session.js`): the host browser runs two linked handheld consoles and reuses the LAN room host (`lan-host.js` `mountHost`) to stream Console 2. Guests send their ROM and save over a `cart` data channel (`link-transfer.js`). Served by `scripts/lan-server.mjs` under `/link/` only after `scripts/lan-link.mjs` verifies the manifest checksums.
- **Prefs** (`src/lib/store.ts`): recents, favorites, accent, CRT, layout, sounds, Libretro covers, EJS channel — all `localStorage`

### Non-obvious notes

- The `retrooasis/public/catalog/games.json` demo entries point at ROM files under `roms/` that are **not committed** (gitignored) and do not exist. Clicking "Play" navigates to `player.html`, but the demo ROM will 404 — real play requires hosting real ROMs, using **Add ROM** (saved permanently in IndexedDB on that device), or linking a local folder. Core SPA flows (browse library, game detail, favorite, accent/theme in Settings, all persisted to localStorage) work fully without any ROMs.
- PSP / 3DS / DOS need `SharedArrayBuffer` (COOP/COEP). Vite dev/preview and `public/_headers` provide this; on a host that can't send headers (GitHub Pages) the player installs `sw.js` and reloads once, and the service worker adds the headers to `player.html?threads=1`.
- PWA service worker (`public/sw.js`) registers in production builds only; caches app shell + catalog, not cores or ROMs.
- Two independent npm projects: repo root (`package.json`) and `retrooasis/` (`retrooasis/package.json`). Each has its own lockfile and `node_modules`.
