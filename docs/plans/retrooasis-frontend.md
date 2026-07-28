# RetroOasis Frontend Plan

Lightweight, stylish web frontend for browsing a ROM library and launching games through EmulatorJS. Visual direction: old-school PlayStation / Sega arcade UI crossed with an XMB-style home shell. Product name: **RetroOasis**.

RomM is the functional reference for library UX. EmulatorJS (this repo) remains the play engine. RetroOasis does **not** aim to clone RomM’s backend, metadata scrapers, multi-user auth, or admin tooling.

**Status:** The static SPA path described here is implemented in `retrooasis/` (Vite + TypeScript). Phases 0–4 below are complete unless marked optional/later.

---

## 1. Goals

| Goal | Detail | Status |
| ---- | ------ | ------ |
| Lightweight | Static SPA. No MariaDB/Redis stack. Browser storage + catalog files. | Done |
| Stylish | PS1 / Sega arcade identity with XMB home cross-menu. | Done |
| Library first | Browse platforms → games → detail → play. Upload/drag-drop as power path. | Done |
| Play via EmulatorJS | Launch into `player.html` using `EJS_*` globals + `data/loader.js`. | Done |
| Controller friendly | Keyboard + gamepad spatial nav on library, settings, and XMB. | Done |
| Self-hosted | Drop ROMs into a folder (or upload), open RetroOasis in a browser. | Done |
| Static hostable | Ship as static files (CDN, GitHub Pages, S3, nginx). | Done |
| PWA | Installable app shell, service worker, standalone chrome. | Done |

### Non-goals (still out of scope)

- Full metadata scraping (IGDB, ScreenScraper, etc.) — optional offline sidecars only
- Multi-user / OIDC / permissions
- Server-side ROM scanning jobs (CLI scan exists; no always-on server)
- Smart collections beyond Recent / Favorites / All
- Companion apps, device sync, soundtrack player
- Replacing EmulatorJS core UI chrome during gameplay

---

## 2. What we borrowed from RomM

| RomM concept | RetroOasis adaptation | Status |
| ------------ | --------------------- | ------ |
| Home → platform grid | XMB home: systems + Recent / Favorites / shortcuts | Done |
| Platform gallery / GamesList | Boxart grid with search + sort + collections rail | Done |
| ROM detail hero | Game card with cover, system badge, Play CTA | Done |
| `/rom/:id/ejs` player | `player.html` EmulatorJS host (SPA-safe) | Done |
| Continue playing | Recent games in `localStorage` + XMB category | Done |
| Favorites | Starred list in `localStorage` | Done |
| Console / TV mode | Settings → Layout → TV | Done |
| Design tokens | CSS variables in `src/styles/tokens.css` | Done |
| Universal input | Focus zones + modality (key/pad vs mouse/touch) | Done |
| CRT shader mode | CRT overlay on shell (not in-core) | Done |

---

## 3. Architecture (as built)

```text
┌──────────────────────────────────────────────────────────┐
│                     RetroOasis SPA                        │
│  XMB Home · Library · Detail · Add ROM · Settings · Play │
├──────────────────────────────────────────────────────────┤
│  Catalog layer (JSON / IndexedDB / File System Access)   │
│  platforms.json · games.json · roms/manifest.json        │
├──────────────────────────────────────────────────────────┤
│  EmulatorJS (existing data/, loader.js, cores)           │
│  player.html sets EJS_* globals                          │
└──────────────────────────────────────────────────────────┘
```

### Repo layout

```text
retrooasis/
  index.html
  src/
    main.ts                 # boot, shell, router dispatch
    lib/
      router.ts             # hash routes
      catalog.ts            # merge demo + manifest + uploads + folder
      store.ts              # recents, favorites, prefs (localStorage)
      focus.ts / xmbFocus.ts
      pwa.ts / gamepad.ts / inputModality.ts
      play.ts / romBridge.ts
    views/
      xmb.ts                # home cross-menu
      library.ts            # grid + collections rail
      detail.ts / upload.ts / settings.ts
    styles/
      tokens.css / base.css / motion.css / xmb.css
  public/
    player.html             # EmulatorJS play host
    catalog/                # seed platforms.json + games.json
    manifest.webmanifest
    sw.js                   # production app-shell cache
    _headers                # COOP/COEP for Netlify-like hosts
data/                       # EmulatorJS (sibling, unchanged)
roms/                       # hosted ROMs + manifest (gitignored)
dist/                       # production build (synced from retrooasis/dist/)
docs/plans/
  retrooasis-frontend.md    # this document
```

**Stack:** Vite 8 + TypeScript (vanilla DOM, no React/Vue). Hash router for zero-config static hosts.

**Play constraint:** EmulatorJS loads in `player.html`, not inline in the SPA DOM.

---

## 4. Visual design

### Brand

- Lockup: **RETRO OASIS** in top bar and XMB chrome
- Tagline tone: arcade shelf / “select game · press start”
- Accent toggle: Sega cyan (default) or PlayStation amber (Settings)

### Key surfaces

- **XMB home** (`#/`) — wave backdrop, glass category icons, horizontal cross-menu, distance fade on neighbors
- **Library** — systems rail + Recent / Favorites / All collections, cover grid, onboard hint when only demos show
- **Settings** — console-style row menu with gamepad/keyboard row focus
- **Play** — full-viewport `player.html`; shell chrome hidden during play

### Motion & sound

- Wave animation on home (respects `prefers-reduced-motion`)
- UI sounds: Soft / XMB / Arcade packs (off by default)
- CRT overlay optional on shell

---

## 5. Information architecture & routes

```text
#/                      XMB home (systems, recents, favorites, actions)
#/library               All games (alias for @all)
#/library/@recent       Recently played
#/library/@favorites    Favorites
#/library/@all          Full shelf
#/library/:platform     One system (e.g. snes)
#/game/:id              Detail + Play
#/upload                Add ROM (IndexedDB)
#/settings              Look, sound, emulator, library, data
```

Invalid hashes show a friendly 404 view with Home / Library links.

### Game detail

- Cover, platform badge, metadata (sidecar + local overrides)
- CTAs: Play, Favorite, Edit metadata, Remove (uploads)
- Play → `player.html?game=…` with durable `library:` refs for uploads

---

## 6. Catalog & data model

```json
{
  "id": "chrono-trigger-snes",
  "title": "Chrono Trigger",
  "platform": "snes",
  "core": "snes",
  "file": "roms/snes/chrono-trigger.zip",
  "cover": "covers/snes/chrono-trigger.jpg",
  "bios": null,
  "tags": ["rpg"]
}
```

**Merge order:** demo `catalog/games.json` → `roms/manifest.json` → IndexedDB uploads → linked local folder (folder wins on id clash).

**CLI helpers:** `npm run oasis:manifest`, `npm run oasis:scan` (optional `--covers` for Libretro thumbnails).

**Browser storage:**

- `localStorage` — recents, favorites, accent, CRT, layout, sounds, Libretro covers toggle, EJS channel, hide demos
- `IndexedDB` — uploaded ROM bytes, local folder handles, staged play payloads

---

## 7. EmulatorJS integration

```text
Detail → Play
  1. Resolve game record (file URL, core, bios)
  2. Stage upload/folder bytes in IndexedDB if needed
  3. Navigate to player.html?…
  4. player.html sets EJS_* and loads data/loader.js (or CDN channel)
  5. On back: recent entry already written at launch
```

**EJS channel** (Settings): `stable` | `nightly` | `latest` | `local`. PSP / 3DS / DOS force nightly unless local. Threaded cores need COOP/COEP (`SharedArrayBuffer`).

---

## 8. Input model

- Arrow keys / D-pad move focus across XMB, library grids, and settings rows
- Enter / South = confirm; Escape / East / B = back
- `:focus-visible` rings for keyboard/gamepad; mouse/touch without sticky rings
- Skip link (“Skip to shelf”) on XMB and Library
- TV layout enlarges targets for couch play

---

## 9. Delivery phases

### Phase 0 — Foundation ✅

- `retrooasis/` Vite + TS scaffold, tokens, router, shell

### Phase 1 — Library + Play ✅

- Platform list + game gallery from catalog
- Detail + `player.html` play path
- Recents + favorites

### Phase 2 — Local library UX ✅

- Folder picker / `roms/` convention (File System Access + IndexedDB)
- Cover placeholders + sidecar / `covers/<platform>/`
- Settings: CRT, accent, hide demos, clear recents/favorites
- Gamepad + keyboard focus on grids

### Phase 3 — Polish ✅

- PWA (`sw.js`, `manifest.webmanifest`, install prompt UX)
- Console/TV layout mode
- Static `roms/manifest.json` + generate/scan scripts
- Upload drag-drop + core auto-detect
- UI sounds (soft / XMB / arcade)
- Metadata sidecars + local overrides + export
- Collections rail (Recent / Favorites / All)
- XMB home shell as primary entry

### Phase 4 — Depth (static-friendly) ✅

- Libretro cover enrichment (runtime + scan `--covers`)
- Permanent browser ROM library (IndexedDB uploads)
- Settings console-style row menu
- Standalone PWA chrome (safe areas, theme-color sync)
- Accessibility pass (skip link, onboard, 404 routes, resize hardening)

### Optional later

- Credentialed scrapers (IGDB / ScreenScraper) writing sidecars offline
- Thin always-on scan API (most self-hosters use CLI + manifest)
- In-core theming beyond shell chrome

---

## 10. Quality bar

- Desktop + mobile layouts for XMB, Library, and Detail
- Keyboard path: Home → Library → Game → Play → Back
- Fast first paint; covers lazy-loaded
- Do not regress EmulatorJS minify/build (`npm run build:emulatorjs`, `minify/`)
- Legal: users supply ROMs; ship no copyrighted binaries

---

## 11. Success criteria (met)

1. Opening RetroOasis feels like a 90s console menu, not a file picker.
2. A sample catalog can be browsed and a game launched in EmulatorJS in under three clicks / button presses.
3. Recents return you to the last game from XMB / Library.
4. Shell bundle stays small (app JS gzipped, excluding cores/ROMs).
5. Visual identity reads as RetroOasis with the nav stripped.

---

## 12. Resolved decisions

| Decision | Choice |
| -------- | ------ |
| Shell framework | **Vite + vanilla TypeScript** in `retrooasis/` |
| Catalog source | JSON + manifest + FS Access + IndexedDB uploads |
| Covers | Placeholders, local paths, Libretro runtime, scan `--covers` |
| Root entry | App in `retrooasis/`; build → `dist/`; EmulatorJS `data/` sibling |
| Theming accents | User toggle: Sega cyan / PS amber |
| Routing | **Hash** for zero-config static hosts |
| PWA | **Shipped** — manifest, SW, install UX, standalone chrome |
| Home shell | **XMB cross-menu** (not static lobby hero) |

---

## 13. Developer quick start

```sh
npm run oasis:dev          # from repo root
npm run typecheck          # in retrooasis/
npm run oasis:build        # → retrooasis/dist/
npm run build              # + sync to repo-root dist/
```

See [`retrooasis/README.md`](../../retrooasis/README.md) and [`AGENTS.md`](../../AGENTS.md) for agent/CI notes.

This document remains the product north star; implementation details live in source and the RetroOasis README.
