# RetroOasis

Static web frontend for browsing a ROM library and launching games with [EmulatorJS](https://emulatorjs.org/). Themed like a 90s PlayStation / Sega arcade cabinet. Designed to deploy as plain static files, with PWA install support planned next.

## Quick start

```sh
cd retrooasis
npm install
npm run dev
```

Open the URL Vite prints (default `http://localhost:5173/`). Dev mode proxies repo-root `data/` and `roms/` so EmulatorJS can load, and sends **COOP/COEP** headers so threaded cores (PSP/PPSSPP, DOS, 3DS) work.

### EmulatorJS cores / PSP (PPSSPP)

- The library lists **all EmulatorJS systems** (NES through PSP, 3DS, DOS, etc.).
- Settings → **EmulatorJS channel** defaults to **nightly** so PPSSPP and other CDN cores are available without installing every npm core package locally.
- Channels: `nightly` · `stable` · `latest` · `local` (`data/` beside the site).
- PSP/DOS/3DS require `SharedArrayBuffer`. Use the Vite dev/preview headers, or deploy `public/_headers` (Netlify/Cloudflare Pages).

## Scripts

| Command | Purpose |
| ------- | ------- |
| `npm run dev` | Local SPA + EmulatorJS data proxy |
| `npm run build` | Typecheck + production static build → `dist/` |
| `npm run preview` | Preview the production build |

## Static hosting

1. Build: `npm run build`
2. Publish the contents of `retrooasis/dist/`
3. Place EmulatorJS **`data/`** next to the built site (same origin path `/data/…`)
4. Place your ROMs under **`roms/<platform>/…`** and list them in `catalog/games.json` (copied into `dist/catalog/` at build time)

Hash routing (`#/library`, `#/game/…`) means no server rewrite rules are required (GitHub Pages, S3, nginx `try_files`, etc. all work).

### Cloudflare Pages

The repo includes a GitHub Actions workflow at `.github/workflows/cloudflare-pages.yml` that builds the app and deploys the generated `dist/` folder to Cloudflare Pages. To use it, add these repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_PAGES_PROJECT_NAME`

The workflow runs on pushes to `main` and can also be triggered manually from the Actions tab.

`player.html` loads EmulatorJS in a dedicated page (iframe-friendly / SPA-safe) via `data/loader.js`.

## Catalog

- `public/catalog/platforms.json` — systems / cores
- `public/catalog/games.json` — titles, file paths, optional covers

Demo entries ship for UI walkthrough. Point `file` at real ROMs you host; do not commit copyrighted game binaries.

## ROM library sources

Merge order: demo catalog → `roms/manifest.json` (hosted) → linked local folder (wins on id clash).

### Hosted manifest (all browsers)

Place ROMs under `roms/<platform>/` next to the built site, then either write `roms/manifest.json` by hand or generate it:

```sh
npm run oasis:manifest
# → ../roms/manifest.json
```

See `roms.manifest.example.json`.

### Local ROM folder (Chromium)

**Library → Link folder** (or Settings) and choose a directory shaped like:

```text
roms/
  nes/*.nes
  snes/*.sfc
  segaMD/*.md
  psx/*.bin
  covers/nes/Game.png   # optional
```

Handles are remembered in IndexedDB; ROMs play via blob URLs into `player.html`.

### Sidecar metadata

Optional JSON next to a ROM (`MyGame.json` or `game.json`) enriches title, core, cover, year, developer, description, and tags. The generate script merges sidecars into `roms/manifest.json`. See `game.sidecar.example.json`.

Game detail → **Edit metadata** stores browser-local overrides (exportable JSON).

### Scan + Libretro covers

```sh
npm run oasis:scan              # write roms/manifest.json
npm run oasis:scan -- --covers  # also HEAD-probe thumbnails.libretro.com
```

In the UI, **Libretro covers** (Settings, on by default) fills missing boxart at browse time.

## Layout & PWA

- **Collections rail**: Recent / Favorites / All games beside systems
- **TV layout** (Settings): larger tiles/focus for couch + gamepad
- **UI sounds** (Settings): soft or arcade packs, off by default
- **Install**: top-bar / Settings button when `beforeinstallprompt` fires
- Escape / gamepad B goes back; focus rings only for keyboard/gamepad
- `manifest.webmanifest` + `sw.js` cache the app shell and catalog (not cores/ROMs), production only

## Repo layout

```text
retrooasis/          ← this app (static SPA)
  public/player.html ← EmulatorJS play host
  public/catalog/    ← sample library JSON
data/                ← EmulatorJS (sibling, unchanged)
roms/                ← your ROMs (gitignored)
docs/plans/          ← product plan
```
