# RetroOasis Frontend Plan

Lightweight, stylish web frontend for browsing a ROM library and launching games through EmulatorJS. Visual direction: old-school PlayStation / Sega arcade UI. Product name: **RetroOasis**.

RomM is the functional reference for library UX. EmulatorJS (this repo) remains the play engine. RetroOasis does **not** aim to clone RomM’s backend, metadata scrapers, multi-user auth, or admin tooling in v1.

---

## 1. Goals

| Goal | Detail |
| ---- | ------ |
| Lightweight | Static (or thin) SPA. No MariaDB/Redis stack required for MVP. Prefer browser storage + simple catalog files. |
| Stylish | Distinct PS1 / Sega arcade identity. Brand-first hero surfaces. Not a generic dark dashboard. |
| Library first | Browse platforms → games → detail → play. Upload/drag-drop remains available as a power path. |
| Play via EmulatorJS | Launch into an iframe player using `EJS_player`, `EJS_core`, `EJS_gameUrl`, `EJS_pathtodata`. |
| Controller friendly | Keyboard + gamepad spatial nav on library screens (RomM v2 pattern, simplified). |
| Self-hosted | Drop ROMs into a folder (or upload), open RetroOasis in a browser. |
| Static hostable | Ship as static files (CDN, GitHub Pages, S3, nginx). No server required for MVP. |
| PWA-ready | Structure for a later service worker / installable app (Phase 3+). |

### Non-goals (MVP)

- Full metadata scraping (IGDB, ScreenScraper, etc.)
- Multi-user / OIDC / permissions
- Server-side ROM scanning jobs
- Smart collections / virtual collections
- Companion apps, device sync, soundtrack player
- Replacing EmulatorJS core UI chrome during gameplay (theme the shell; keep play reliable)

---

## 2. What to borrow from RomM

Take the **information architecture and interaction model**, not the stack weight.

| RomM concept | RetroOasis MVP adaptation |
| ------------ | ------------------------- |
| Home → platform grid | Oasis Lobby: platform tiles with era-correct icons |
| Platform gallery / GamesList | Boxart (or placeholder) grid with search + sort |
| ROM detail hero | Game card with cover, system badge, Play CTA |
| `/rom/:id/ejs` player | Full-bleed play view (iframe → EmulatorJS) |
| Continue playing | Recent games from `localStorage` / IndexedDB |
| Favorites | Starred list in local storage |
| Gallery view modes | Grid only at first; list optional later |
| Console / TV mode | Phase 2: big-focus gamepad layout |
| Design tokens | CSS variables only; zero scattered hex in components |
| Universal input | Simplified focus zones for D-pad / arrows |
| CRT shader mode | Optional CSS overlay / EmulatorJS shader toggle later |

Skip for MVP: scan UI, library management admin, real-time logs, 3D boxart, Socket.IO, Pinia-scale store count, Vuetify.

---

## 3. Architecture

```text
┌──────────────────────────────────────────────────────────┐
│                     RetroOasis SPA                        │
│  Lobby · Platforms · Gallery · Detail · Settings · Play  │
├──────────────────────────────────────────────────────────┤
│  Catalog layer (JSON / IndexedDB / File System Access)   │
│  platforms.json · games index · covers · recents         │
├──────────────────────────────────────────────────────────┤
│  EmulatorJS (existing data/, loader.js, cores)           │
│  Play view mounts iframe → EJS_* globals                 │
└──────────────────────────────────────────────────────────┘
```

### Recommended layout in this repo

Keep EmulatorJS sources intact. Add a sibling app shell:

```text
retrooasis/                 # new frontend app (MVP)
  index.html
  styles/
    tokens.css              # PS1/Sega palette + type scale
    base.css
    motion.css
  js/
    app.js                  # router + boot
    catalog.js              # load/normalize library
    store.js                # recents, favorites, prefs
    focus.js                # keyboard/gamepad nav helpers
    play.js                 # build EmulatorJS iframe session
  assets/
    logo.svg
    platforms/              # platform glyphs
    ui/                     # scanlines, patterns
  catalog/
    platforms.json          # seed catalog schema
    games.sample.json
docs/plans/
  retrooasis-frontend.md    # this plan
```

MVP stack choice (keep it light):

- **Vanilla JS + CSS modules/files** or a single Vite + vanilla/TS build
- No Vue/React required for v1 unless we already want component structure
- Hash or History router with 5–6 views
- Optional later: Vue 3 + Vite if the shell grows past ~2k LOC

Play constraint (from EmulatorJS docs): SPA hosts must load EmulatorJS in an **iframe**, not inline in the SPA DOM.

---

## 4. Visual design: “PS1 / Sega arcade”

### Brand

- Name lockup: **RETRO OASIS** as hero-level signal on Lobby
- Tagline (one line): e.g. `SELECT GAME · PRESS START`
- Avoid purple-gradient / cream-serif / newspaper defaults

### Palette (CSS tokens)

| Token | Role | Direction |
| ----- | ---- | --------- |
| `--ro-bg-void` | Deep stage black-blue | CRT room, not flat `#000` only |
| `--ro-bg-panel` | Translucent navy / graphite panels | PS1 menu panels |
| `--ro-accent-sega` | Electric cyan / teal | Sega highlight / cursor |
| `--ro-accent-ps` | Warm amber / gold | PlayStation confirm / START |
| `--ro-danger` | Hot magenta / red | Exit / delete |
| `--ro-text` | Off-white | Primary copy |
| `--ro-text-dim` | Cool gray | Meta, paths, counts |
| `--ro-scanline` | Subtle horizontal lines | Atmosphere, low opacity |
| `--ro-grid` | Perspective floor grid (Lobby only) | Arcade attract mode |

### Typography

- Display: chunky geometric / arcade display (e.g. **Press Start 2P** or similar licensed/open font) for brand + section titles
- UI body: readable monospace-adjacent or condensed sans (e.g. **Chakra Petch**, **Share Tech Mono**) — not Inter/Roboto/Arial
- ALL CAPS sparingly for nav labels; sentence case for game titles

### Surfaces & composition

- Lobby first viewport = one composition: brand, one headline, one CTA (`BROWSE LIBRARY` / `CONTINUE`), full-bleed attract visual (CRT stage / perspective grid / cartridge shelf photo). No stats strip, no card grid in the hero.
- Library screens: shelf metaphor, not dashboard cards. Prefer open grids of covers with focus rings over bordered cards.
- Focus ring: Sega cyan outline + soft amber fill on selected tile (controller-visible).
- Motion (2–3 intentional pieces):
  1. Lobby attract idle (slow grid drift / scanline pulse)
  2. Platform / game focus scale + glow
  3. View transition wipe or PS1-style fade when entering Play
- Respect `prefers-reduced-motion`

### Sound (optional, Phase 2)

- Soft UI blip on move / confirm (user-toggleable, off by default for politeness)

---

## 5. Information architecture & screens

```text
/                     Lobby (brand + Continue + Browse)
/library              All platforms
/library/:platform    Game gallery for one system
/game/:id             Detail + Play
/play/:id             Full-bleed EmulatorJS iframe
/upload               Drag-drop ROM (existing demo flow, restyled)
/settings             Paths, theme accents, CRT overlay, cache
```

### Lobby

- Hero brand **RetroOasis**
- Primary: `PRESS START` → last played or library
- Secondary: `BROWSE SYSTEMS`
- Background: full-bleed arcade atmosphere (pattern/image), not inset media cards

### Platform library

- Horizontal or grid of systems with ROM counts
- Systems map to EmulatorJS cores (`nes`, `snes`, `psx`, `segaMD`, …) using the same extension → core logic already in `index.html`

### Game gallery

- Cover grid (placeholder art when missing)
- Search by title
- Sort: name, recently added, recently played
- Filters: favorites only (MVP)

### Game detail

- Cover as dominant visual plane
- Title, platform badge, file name
- CTAs: `PLAY`, `FAVORITE`, optional `UPLOAD BIOS` when required
- No secondary promo clutter

### Play

- Full viewport iframe
- Exit / Back to Oasis control outside or overlaid chrome (does not break EmulatorJS)
- Persist last-played on successful launch

---

## 6. Catalog & data model (MVP)

Lightweight, file-first:

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

Sources (in order of ambition):

1. **Seed JSON** in `retrooasis/catalog/` for demos
2. **Local folder convention**: `roms/<platform>/*` + optional `covers/<platform>/*`
3. **Browser File System Access API** (Chrome) to grant a library folder without a backend
4. **IndexedDB** for recents, favorites, user overrides, cached covers
5. Later: optional thin Node/Python scan API if self-hosters want auto-index

Reuse existing EmulatorJS pieces:

- Core detection from file extension (`index.html` / consts)
- `EJS_cacheConfig` / IndexedDB cache docs in `docs/CACHING.md`
- Localization hooks later via `data/localization/`

---

## 7. EmulatorJS integration

```text
Detail → Play
  1. Resolve game record (file URL, core, bios)
  2. Navigate to /play/:id
  3. Mount <iframe src="player.html?...">
  4. player.html sets EJS_* and loads data/loader.js
  5. On unload / back: write recent entry
```

`player.html` stays minimal (close to current demo runner) so EmulatorJS isolation stays intact. RetroOasis chrome wraps around it; it does not rewrite `data/src/emulator.js` for MVP theming.

---

## 8. Input model (simplified RomM v2)

- Arrow keys / D-pad move focus across platform and game grids
- Enter / South face button = confirm
- Escape / East = back
- Visible focus only when input modality is keyboard/gamepad
- Mouse/touch: hover and tap without sticky focus rings
- One focus zone per view (Lobby CTAs, platform grid, game grid)

---

## 9. Delivery phases

### Phase 0 — Foundation

- Scaffold `retrooasis/` app shell
- Tokens, fonts, Lobby composition, basic router
- Rename demo entry branding toward RetroOasis without breaking EmulatorJS package use

### Phase 1 — Library + Play

- Platform list + game gallery from sample catalog
- Detail + Play iframe path
- Recents + favorites in IndexedDB
- Restyle upload fallback page in the same visual language

### Phase 2 — Local library UX

- [x] Folder picker / `roms/` convention indexing (File System Access + IndexedDB handle)
- [x] Cover placeholders + sidecar / `covers/<platform>/` images when linking a folder
- [x] Settings: CRT overlay, accent, hide demos, clear recents/favorites
- [x] Gamepad + keyboard focus on library grids
- [x] Lobby recently-played shelf (below hero)

### Phase 3 — Polish & optional depth

- [x] PWA app-shell service worker (`sw.js`, production only)
- [x] PWA install prompt UX (top bar + Settings)
- [x] Console/TV layout mode
- [x] Static `roms/manifest.json` + generate script (Safari/Firefox/CDN)
- [x] Upload drag-drop + core auto-detect
- Soft UI sounds
- Optional metadata sidecar files (`game.json` next to ROM)
- Only if needed: thin scan backend (still far lighter than RomM)

---

## 10. Quality bar

- Desktop + mobile layouts for Lobby and Gallery
- Keyboard path through Lobby → Platform → Game → Play → Back
- No layout `@media` sprawl without a small breakpoint helper (RomM lesson: one breakpoint source)
- Lighthouse-ish: fast first paint; covers lazy-loaded
- Do not regress EmulatorJS minify/build (`npm run build` / existing workflows)
- Legal: users supply their own ROMs; ship no copyrighted game binaries

---

## 11. Success criteria (MVP)

1. Opening RetroOasis feels like a 90s console menu, not a file picker.
2. A sample catalog can be browsed and a game launched in EmulatorJS in under three clicks / button presses.
3. Recents return you to the last game from Lobby.
4. Bundle for the shell stays small (target: tens of KB of app JS gzipped, excluding cores/ROMs).
5. Visual identity still reads as RetroOasis with the nav stripped (brand test).

---

## 12. Open decisions

| Decision | Options | Recommendation |
| -------- | ------- | -------------- |
| Shell framework | Vanilla / Vite vanilla / Vue | **Done:** Vite + vanilla TS in `retrooasis/` |
| Catalog source | JSON only / FS Access / small API | JSON now; FS Access later |
| Covers | Manual / hashed filenames / scrapers | Placeholder covers now; manual paths later |
| Root entry | Replace `index.html` vs `/retrooasis/` | App lives in `retrooasis/` (build → `dist/`); EmulatorJS `data/` stays sibling |
| Theming accents | Fixed dual / user toggle | User toggle: Sega cyan default, PS amber alternate |
| Routing | History vs hash | **Hash** for zero-config static hosts |
| PWA | Later | Manifest linked; service worker in a follow-up phase |

---

## 13. First implementation slice

When implementation starts, ship in this order:

1. `retrooasis/` Vite scaffold + tokens + Lobby
2. Sample `platforms.json` + gallery
3. Detail → `player.html` EmulatorJS iframe
4. Recents / favorites store
5. Wire root README “RetroOasis” getting-started section

This plan is the north star for that work.
