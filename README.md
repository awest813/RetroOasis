# RetroOasis

RetroOasis is a static, browser-based ROM library UI built on top of EmulatorJS.

- XMB-style home + library browsing
- Game detail, favorites, recents, metadata overrides
- Add ROM (IndexedDB) + optional hosted manifest + optional linked local folder
- Static deploy target (GitHub Pages, Netlify, S3, etc.)

> This repository still contains upstream EmulatorJS assets in `data/`. The active product here is `retrooasis/`.

## Quick start

From repo root:

```sh
npm run oasis:dev
```

Open `http://localhost:5173/`.

Useful commands:

```sh
npm run oasis:dev       # run Vite dev server
npm run oasis:build     # typecheck + build retrooasis/dist
npm run build           # build and sync to repo-root dist/ for Pages
npm run oasis:preview   # preview production build locally
npm run oasis:scan      # scan roms/ -> roms/manifest.json
npm run oasis:manifest  # generate manifest from hosted rom folders
```

## GitHub Pages

GitHub Pages deploys from `.github/workflows/github-pages.yml`.

- Trigger: push to `main` (or manual dispatch)
- Build output: `retrooasis/dist/`
- Published artifact: repo-root `dist/` (synced by `scripts/sync-pages-dist.mjs`)

### Important limitations on GitHub Pages

GitHub Pages cannot set custom COOP/COEP headers. That means threaded cores requiring `SharedArrayBuffer` (PSP/3DS/DOS) will not run there.

- Supported on Pages: core SPA browsing flows and non-threaded systems
- For PSP/3DS/DOS: use `npm run oasis:dev`, `npm run oasis:preview`, or a host that supports custom headers

## ROM sources

Catalog merge order:

1. `retrooasis/public/catalog/games.json` (demo)
2. `roms/manifest.json` (hosted)
3. Saved uploads (IndexedDB)
4. Linked local folder (Chromium)

Demo entries are placeholders; real play requires real ROM files.

## Project layout

```text
retrooasis/          # Vite + TypeScript app
  src/views/         # xmb, library, detail, upload, settings
  src/lib/           # router, catalog, store, pwa, input, etc.
  public/player.html # EmulatorJS host page
  public/catalog/    # sample catalog

data/                # EmulatorJS runtime assets
roms/                # local/hosted ROM files (gitignored)
dist/                # Pages artifact synced from retrooasis/dist/
```

## More docs

- App docs: [`/retrooasis/README.md`](/retrooasis/README.md)
- Frontend plan: [`/docs/plans/retrooasis-frontend.md`](/docs/plans/retrooasis-frontend.md)
- EmulatorJS upstream docs: <https://emulatorjs.org/docs/>
