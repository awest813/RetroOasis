# RetroOasis

Static web frontend for browsing a ROM library and launching games with [EmulatorJS](https://emulatorjs.org/). Home is an XMB-style cross menu (Outfit/Sora type, glass category icons, wave backdrop); Library, Add ROM, and Settings are leaf views. Designed to deploy as plain static files, with an installable PWA shell.

## Quick start

From the repo root:

```sh
npm run oasis:dev
```

Or from this folder:

```sh
cd retrooasis
npm install
npm run dev
```

Open the URL Vite prints (default `http://localhost:5173/`). Dev mode proxies repo-root `data/` and `roms/` so EmulatorJS can load, and sends **COOP/COEP** headers so threaded cores (PSP/PPSSPP, DOS, 3DS) work.

### EmulatorJS cores / PSP (PPSSPP)

- The library lists **all EmulatorJS systems** (NES through PSP, 3DS, DOS, etc.).
- Settings → **Emulator files** defaults to **stable** for most systems. **PSP / 3DS / DOS** always launch on **nightly** (unless Local).
- Channels: `stable` · `nightly` · `latest` · `local` (`data/` beside the site).
- PSP/DOS/3DS require `SharedArrayBuffer`. Use the Vite dev/preview headers, or deploy `public/_headers` on a host that supports custom headers (for example, Netlify). GitHub Pages does not support custom header files.

## Scripts

| Command (in `retrooasis/`) | Purpose |
| -------------------------- | ------- |
| `npm run dev` | Local SPA + EmulatorJS data proxy |
| `npm run build` | Typecheck + production static build → `dist/` |
| `npm run preview` | Preview the production build (with thread headers) |
| `npm run typecheck` | TypeScript only, no emit |
| `npm run manifest` | Generate `../roms/manifest.json` from `roms/` |
| `npm run scan` | Scan `roms/` (+ optional sidecars / covers) |

From the **repo root**, the same workflows are exposed as `npm run oasis:*` (for example `oasis:dev`, `oasis:build`, `oasis:scan`). `npm run build` at the root runs the RetroOasis build and syncs `retrooasis/dist/` → `dist/` for GitHub Pages.

## Routes

Hash routing — no server rewrite rules required.

| Route | View |
| ----- | ---- |
| `#/` | XMB home (systems, Recent, Favorites, shortcuts) |
| `#/library` | All games grid (same as `#/library/@all`) |
| `#/library/@recent` | Recently played |
| `#/library/@favorites` | Favorites |
| `#/library/@all` | Full shelf |
| `#/library/<platform>` | One system (for example `#/library/snes`) |
| `#/game/<id>` | Game detail + Play |
| `#/upload` | Add ROM (drag-drop or file picker) |
| `#/settings` | Look, sound, emulator channel, library, data |

Play opens `player.html` (EmulatorJS iframe host) with query params for the selected game.

## Static hosting

1. Build: `npm run build` (repo root) or `npm run build` in `retrooasis/`
2. Publish the contents of the generated repo-root `dist/` folder (or `retrooasis/dist/` if you skip the sync step)
3. Place EmulatorJS **`data/`** next to the built site (same origin path `/data/…`)
4. Place your ROMs under **`roms/<platform>/…`** and list them in `catalog/games.json` or `roms/manifest.json`

`player.html` loads EmulatorJS in a dedicated page (iframe-friendly / SPA-safe) via `data/loader.js`.

### GitHub Pages

The repo includes a GitHub Actions workflow at `.github/workflows/github-pages.yml` that builds the app and deploys the generated `dist/` folder to GitHub Pages. The workflow runs on pushes to `main` and can also be triggered manually from the Actions tab.

## Catalog

- `public/catalog/platforms.json` — systems / cores
- `public/catalog/games.json` — demo titles, file paths, optional covers

Demo entries ship for UI walkthrough. Point `file` at real ROMs you host; do not commit copyrighted game binaries.

## ROM library sources

Merge order: demo catalog → `roms/manifest.json` (hosted) → **saved uploads** (IndexedDB) → linked local folder (wins on id clash).

### Saved uploads (all browsers)

**Add ROM** stores file bytes in IndexedDB on this device and adds a shelf entry. Reloads keep the title until you remove it from game detail or clear uploads in Settings. Play uses a durable `library:` reference (not a one-shot staging key). Re-adding the same filename replaces the bytes but keeps the original title/`addedAt` when possible.

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

Handles are remembered in IndexedDB. Linked-folder ROMs are staged in IndexedDB before navigating to `player.html` (blob URLs do not survive that navigation). Saved uploads use a permanent library store instead.

### Sidecar metadata

Optional JSON next to a ROM (`MyGame.json` or `game.json`) enriches title, core, cover, year, developer, description, and tags. The generate script merges sidecars into `roms/manifest.json`. See `game.sidecar.example.json`.

Game detail → **Edit metadata** stores browser-local overrides (exportable JSON from Settings).

### Scan + Libretro covers

```sh
npm run oasis:scan              # write roms/manifest.json
npm run oasis:scan -- --covers  # also HEAD-probe thumbnails.libretro.com
```

In the UI, **Online box art** (Settings, on by default) fills missing boxart at browse time.

## Settings

All preferences persist in **localStorage** on this device (except ROM bytes and folder handles, which use IndexedDB).

| Group | Options |
| ----- | ------- |
| **Look** | Accent (Sega cyan / PS amber), Layout (Standard / TV), CRT overlay |
| **Sound & cores** | UI sounds (off by default), sound pack (Soft / XMB / Arcade), Emulator files channel, thread-support status |
| **Library** | Online box art, hide samples, saved ROMs, link local folder, hosted manifest status |
| **Data** | Install as app (PWA), clear recents & favorites, export/clear metadata edits |

Settings uses a console-style row menu with keyboard/gamepad focus (D-pad or arrows, Enter to confirm, Escape / B to go back).

## Layout, PWA & accessibility

- **XMB home**: cross-menu navigation with wave backdrop; desktop top bar is inert while focused on the menu
- **Collections rail**: Recent / Favorites / All games beside systems in Library
- **TV layout** (Settings): larger tiles/focus for couch + gamepad
- **UI sounds** (Settings): soft, XMB, or arcade packs — off by default
- **Install**: top-bar / Settings button when `beforeinstallprompt` fires; iOS uses Share → Add to Home Screen
- **Standalone mode**: home-screen launch uses `viewport-fit=cover`, safe-area padding, and hides install CTAs
- **Skip link**: “Skip to shelf” for keyboard users (reachable from XMB and Library)
- **Onboarding**: empty-library hint in the grid when only demo samples are visible
- Escape / gamepad B goes back; focus rings for keyboard/gamepad (`:focus-visible`); mouse/touch without sticky rings
- `manifest.webmanifest` (icons + shortcuts) + `sw.js` cache the app shell and catalog (not cores/ROMs), production only

## Repo layout

```text
retrooasis/          ← this app (Vite + TypeScript SPA)
  src/views/         ← xmb, library, detail, upload, settings
  src/lib/           ← catalog, router, store, PWA, gamepad, etc.
  public/player.html ← EmulatorJS play host
  public/catalog/    ← sample library JSON
data/                ← EmulatorJS (sibling, unchanged)
roms/                ← your ROMs (gitignored)
dist/                ← production build (synced from retrooasis/dist/)
docs/plans/          ← product plan
```
