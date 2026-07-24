# AGENTS.md

## Cursor Cloud specific instructions

This repo is **EmulatorJS** (a static JS emulation library) plus a fork app **RetroOasis** in `retrooasis/` (a Vite + TypeScript static SPA for browsing a ROM library and launching EmulatorJS). RetroOasis is the active product on this branch.

Dependencies for both the repo root and `retrooasis/` are installed by the startup update script, so you do not need to run installs manually.

### Services / commands

- RetroOasis dev server: `npm run oasis:dev` (from repo root) or `npm run dev` in `retrooasis/`. Serves the SPA on `http://localhost:5173/`. Its Vite config proxies repo-root `data/` (EmulatorJS) and `roms/` so the player can load; no separate server is needed for RetroOasis itself.
- EmulatorJS demo: `npm run start` (repo root) runs `http-server` on `http://localhost:8080/` and serves `index.html` (the classic EmulatorJS demo). This is separate from RetroOasis.
- Lint: `npx eslint .` (repo root). Note eslint config only defines `warn`-level rules, so lint passes (exit 0) even though the bundled/minified `data/` files emit ~1600 warnings — that's expected, not a failure.
- RetroOasis build/typecheck: `npm run build` in `retrooasis/` (runs `tsc` then `vite build`); `npm run typecheck` for types only.

### Non-obvious notes

- The `retrooasis/public/catalog/games.json` demo entries point at ROM files under `roms/` that are **not committed** (gitignored) and do not exist. Clicking "Play" navigates to `player.html`, but the demo ROM will 404 — real play requires hosting real ROMs or using the Upload view. Core SPA flows (browse library, game detail, favorite, accent/theme in Settings, all persisted to localStorage) work fully without any ROMs.
- Two independent npm projects: repo root (`package.json`) and `retrooasis/` (`retrooasis/package.json`). Each has its own lockfile and `node_modules`.
