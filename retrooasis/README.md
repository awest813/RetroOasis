# RetroOasis

Static web frontend for browsing a ROM library and launching games with [EmulatorJS](https://emulatorjs.org/). Themed like a 90s PlayStation / Sega arcade cabinet. Designed to deploy as plain static files, with PWA install support planned next.

## Quick start

```sh
cd retrooasis
npm install
npm run dev
```

Open the URL Vite prints (default `http://localhost:5173/`). Dev mode proxies repo-root `data/` and `roms/` so EmulatorJS can load.

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

`player.html` loads EmulatorJS in a dedicated page (iframe-friendly / SPA-safe) via `data/loader.js`.

## Catalog

- `public/catalog/platforms.json` — systems / cores
- `public/catalog/games.json` — titles, file paths, optional covers

Demo entries ship for UI walkthrough. Point `file` at real ROMs you host; do not commit copyrighted game binaries.

## PWA

`manifest.webmanifest` is already linked. A service worker / offline cache will be added in a later phase without changing the static deploy model.

## Repo layout

```text
retrooasis/          ← this app (static SPA)
  public/player.html ← EmulatorJS play host
  public/catalog/    ← sample library JSON
data/                ← EmulatorJS (sibling, unchanged)
roms/                ← your ROMs (gitignored)
docs/plans/          ← product plan
```
