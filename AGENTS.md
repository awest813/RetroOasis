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
| `npm run oasis:scan` | Scan `roms/` (+ optional `--covers`) into manifest |
| `npx eslint .` | Lint (repo root). Rules are `warn`-only; ~1600 warnings from minified `data/` are expected and exit 0. |
| `npm run typecheck` | TypeScript check only (`retrooasis/`) |
| `npm run build` in `retrooasis/` | Same as `oasis:build` |

### RetroOasis architecture (quick map)

- **Routes** (`src/lib/router.ts`): hash router — `#/` (XMB home), `#/library`, `#/library/@recent|@favorites|@all`, `#/library/<platform>`, `#/game/<id>`, `#/upload`, `#/settings`
- **Views** (`src/views/`): `xmb.ts` (home shell), `library.ts` (grid + collections rail), `detail.ts`, `upload.ts`, `settings.ts` (console-style row focus)
- **Play**: navigates to `public/player.html` with EmulatorJS `EJS_*` globals (iframe isolation)
- **Catalog merge** (`src/lib/catalog.ts`): demo JSON → `roms/manifest.json` → IndexedDB uploads → linked local folder
- **Prefs** (`src/lib/store.ts`): recents, favorites, accent, CRT, layout, sounds, Libretro covers, EJS channel — all `localStorage`

### Non-obvious notes

- The `retrooasis/public/catalog/games.json` demo entries point at ROM files under `roms/` that are **not committed** (gitignored) and do not exist. Clicking "Play" navigates to `player.html`, but the demo ROM will 404 — real play requires hosting real ROMs, using **Add ROM** (saved permanently in IndexedDB on that device), or linking a local folder. Core SPA flows (browse library, game detail, favorite, accent/theme in Settings, all persisted to localStorage) work fully without any ROMs.
- PSP / 3DS / DOS need `SharedArrayBuffer` (COOP/COEP). Vite dev/preview and `public/_headers` provide this; GitHub Pages cannot.
- PWA service worker (`public/sw.js`) registers in production builds only; caches app shell + catalog, not cores or ROMs.
- Two independent npm projects: repo root (`package.json`) and `retrooasis/` (`retrooasis/package.json`). Each has its own lockfile and `node_modules`.
