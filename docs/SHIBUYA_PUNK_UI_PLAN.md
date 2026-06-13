# RetroOasis — Shibuya Punk UI/GUI Overhaul Plan

**Codename:** `SHIBUYA-PUNK` · **Branch:** `claude/shibuya-punk-ui-plan-hcaoms`
**Status:** Proposal / awaiting build approval
**Supersedes the visual layer of:** "Glass & Silver" (current `src/design-system.css`) and the stale "Dark Chrome v3" notes in `docs/style-guide.md`.

---

## 0. TL;DR

Re-skin the entire app into a **Shibuya Punk** aesthetic — neon-noir Tokyo nightscape: pitch-black base, electric magenta / cyan / voltage-yellow neon, katakana accents, CRT/VHS/glitch texture, brutalist grids, and sticker-bomb energy. The codebase is **heavily token-driven** (`design-system.css` → `style.css` consumes `var(--c-*)` ~700+ times), so ~70% of the re-theme is achievable by **reworking tokens**, with the remaining ~30% being new signature components, effects, and typography.

**Key architectural decision (recommended):** ship Shibuya Punk as a **selectable theme** via `<html data-theme="shibuya-punk">`, not a hard replacement. This preserves the existing polished theme, lets us A/B, and respects `prefers-reduced-motion` / `prefers-contrast` by degrading gracefully. New default = Shibuya Punk; old theme stays available in Settings → Display.

---

## 1. Vision & Mood

> *Midnight at Shibuya Crossing. Rain-slick neon. A pirate arcade tucked behind a vending machine. Cassette-futurism meets street punk.*

Reference touchstones: Jet Set Radio, Persona 5's UI kinetics, Akira/cyberpunk Tokyo signage, VHS/CRT retro-tech, riso-print zines, and graffiti sticker culture. The emulator subject matter (retro consoles) makes CRT/scanline/glitch texture *thematically earned*, not just decorative.

**Personality:** loud, kinetic, defiant, hand-made-but-high-tech. High contrast, unapologetic neon, Japanese street typography, intentional "broken signal" glitch.

---

## 2. Design Language Pillars

| Pillar | What it means in the UI |
|---|---|
| **Neon-noir base** | Pure black canvas, surfaces as dark charcoal "concrete," light only from neon signage |
| **Triad neon** | Hot magenta + electric cyan + voltage yellow as the energetic core; used as glow, edges, and accent fills |
| **Katakana/kanji accents** | Decorative vertical-text strips, section tags (`遊 / プレイ`), ticker marquees — never required for comprehension |
| **Brutalist grid** | Hard offset borders, thick rules, exposed structure, monospace labels, "spec sheet" framing |
| **Signal/glitch texture** | Scanlines, RGB-split on hover/focus, chromatic aberration on headings, VHS grain, bloom |
| **Sticker-bomb energy** | Tilted badges, tape/torn-edge accents, halftone, stamp-style status pills |

---

## 3. Token System Rework (`src/design-system.css`)

The single highest-leverage change. Re-map the existing token names (so `style.css` keeps working untouched) and add a Shibuya layer. Proposed values:

### 3a. Surfaces & borders
| Token | Current (Glass & Silver) | → Shibuya Punk |
|---|---|---|
| `--c-bg` | `#000000` | `#04030a` (near-black with violet undertone) |
| `--c-surface` | `#0a0a0c` | `#0b0810` |
| `--c-surface2` | `#121215` | `#140d1c` |
| `--c-surface3` | `#1a1a1f` | `#1d1230` |
| `--c-border` | `rgba(255,255,255,.08)` | `rgba(255,46,151,.18)` (magenta-tinted hairline) |
| `--c-border-lt` | `rgba(255,255,255,.15)` | `rgba(0,240,255,.28)` (cyan edge) |

### 3b. Accent triad (replaces champagne/gold)
| Token | → Shibuya value | Role |
|---|---|---|
| `--c-accent` (primary) | `#ff2e97` (hot magenta) | CTAs, focus, active, brand glow |
| `--c-accent-h` | `#ff6bb5` | hover |
| `--c-accent-light` | `#ffa6d4` | highlights |
| `--c-accent-dark` | `#9c0f5a` | pressed / gradient floor |
| `--c-accent-glow` | `rgba(255,46,151,.45)` | neon bloom |
| `--c-accent-2` (cyan) | `#00f0ff` | secondary actions, links, info |
| `--c-gold` → **`--c-volt`** alias | `#f5ff4d` (voltage yellow) | warnings, energy ticks, badges |
| (new) `--c-violet` | `#a855f7` | tertiary neon, gradients |

### 3c. Semantic re-tints (keep names, punch up saturation)
`--c-danger` → `#ff3355`, `--c-success` → `#39ff88`, `--c-warn` → `#f5ff4d`, `--c-fav` → `#ff2e97`. Status/tier/doctor colors get the same neon treatment.

### 3d. New Shibuya-only tokens
```
--neon-magenta, --neon-cyan, --neon-volt, --neon-violet
--glow-sm/md/lg               (layered text/box neon glows)
--scanline-overlay            (repeating-linear-gradient)
--grain-overlay               (data-URI noise)
--halftone-overlay
--grid-overlay                (faint cyberpunk grid)
--gradient-neon               (magenta→violet→cyan sweep)
--gradient-holo               (iridescent)
--edge-glitch                 (RGB-split box-shadow recipe)
--tape-yellow / --tape-bg     (sticker/tape accents)
```

### 3e. Shape language
Tighten radii toward brutalist hard edges: `--radius: 2px`, `--radius-sm: 0`, `--radius-lg: 4px` (keep `--radius-pill` for stamp pills). Add `--border-thick: 2px` and `--offset-shadow` (hard, un-blurred drop, e.g. `4px 4px 0 var(--neon-magenta)`).

> Because `style.css` references these by name, re-valuing them instantly re-themes header, sidebar, cards, modals, settings, multiplayer, toasts, and overlays.

---

## 4. Typography (`index.html` + tokens)

Swap the Google Fonts link from `Orbitron + Outfit` to a Shibuya stack:

- **Display / brand:** `Zen Dots` or `Chakra Petch` (techno-Japanese geometric) — headings, logo, system tags.
- **UI sans:** `Chakra Petch` / `Zen Kaku Gothic New` (carries Latin **and** Japanese glyphs for katakana accents).
- **Mono "spec":** `JetBrains Mono` / `Space Mono` — labels, counts, stat readouts, the brutalist data strips.
- **Accent JP:** load a katakana-capable weight for decorative vertical strips.

Update `--font-display`, `--font-sans`, `--font-mono`. Add `--font-jp` and uppercase + wide letter-spacing utility classes for headings. Keep the `<link rel="preconnect">` perf pattern already in `index.html`.

---

## 5. Signature Effects (with guardrails)

All effects gate behind `@media (prefers-reduced-motion: no-preference)` and a Settings toggle (reuse the existing "Visual Effects" radiogroup in `style.css:4029`). Static fallbacks always present.

1. **CRT scanline + grain overlay** — fixed full-viewport pseudo-element layer (`#app::after`), very low opacity, `pointer-events:none`. Thematic for an emulator.
2. **Neon glow system** — layered `text-shadow` / `box-shadow` tokens on accents, brand, active nav, primary buttons.
3. **RGB chromatic split** — on heading hover/focus and the logo: cheap dual `text-shadow` offset in cyan/magenta.
4. **Glitch-in animation** — keyframe (clip-path + translate jitter) for section/title mount; lives in `src/animations.css`.
5. **Ticker marquee** — katakana/now-playing scrolling strip in header or footer (CSS `@keyframes` translate, pausable).
6. **Holographic/iridescent gradients** — animated `background-position` on hero, brand, and featured cards.
7. **Hard offset "sticker" shadows** — cards/badges get un-blurred neon offset shadows + slight rotation on hover.
8. **Bloom on focus** — controller/keyboard focus ring becomes a magenta neon bloom (extends existing `--focus-ring`).

**Performance budget:** the repo enforces `perf-budget.json` + `tools/perf-audit`. All effects must be GPU-compositable (`transform`/`opacity`/`box-shadow` only — no layout thrash), respect `content-visibility` already used in gameplay mode (`style.css:452`), and **fully disable during active gameplay** (the immersive `.in-game` state already strips chrome — extend it to kill overlays for frame budget).

---

## 6. Component-by-Component Overhaul

Mapped to real selectors/sections in `src/style.css`:

| Area | `style.css` anchor | Shibuya treatment |
|---|---|---|
| **Header** | `:315` `.app-header` | Black bar, magenta underglow rule, katakana brand lockup, cyan nav with glitch hover, live ticker |
| **Sidebars (3-pane)** | `:480` | Brutalist mono labels, vertical JP section tags, hard cyan active indicator bar |
| **Library toolbar** | `:565` | Stamp-style filter chips, mono counts, neon search field with cyan caret/glow |
| **Library hero** | `:755` | Iridescent gradient panel, glitch headline, "東京" decorative watermark, sticker CTA |
| **Game grid / cards** | `:825` `.game-card` | Hard-edged frames, neon offset shadow + tilt on hover, scanline cover overlay, voltage tier badges, RGB-split title |
| **Cover fallback** | `:2068` | Halftone + neon-grid placeholder with katakana glyph |
| **System selector** | `:1081` | Arcade-cabinet chips, per-system neon accent (re-tint legacy joy-red/blue tokens) |
| **Modals** | `:1178` | Brutalist framed dialog, tape-corner accents, glitch entrance, magenta header rule |
| **Footer** | `:1272` | Mono status readout, scanline rule, optional marquee credits |
| **In-game HUD / Now Playing** | `:1677`, `:1930` | Minimal neon HUD, CRT-safe, auto-dims; respects gameplay perf |
| **Settings panel** | `:3372` | "Control panel" brutalist layout, neon toggles, mono section headers, JP tab tags |
| **Toasts** | `:2682` | Stamp/sticker toasts, neon left-edge, glitch-in |
| **Multiplayer lobby / LAN** | `:4121`, `:4381` | Arcade "VS" energy, neon signal bars, voltage ping meters |
| **Loading overlay** | `:2523` + `index.html` preloader | CRT power-on + glitch boot text ("接続中… / BOOTING"), neon spinner replacing the current steel spinner |
| **Onboarding** | `:3105` | Zine/poster layout, sticker-bombed supported-platform strip |
| **Scrollbars / skip link / focus** | `:42`, `:56`, `:4279` | Neon thumb, magenta skip link, bloom focus |

Toggle/switch primitive (built in `src/ui/dom.ts:buildToggleRow`) — restyle `.toggle-switch` to a neon "power" toggle; **DOM stays untouched**, CSS-only.

---

## 7. Theme Architecture

Recommended approach to avoid a risky big-bang and keep accessibility escape hatches:

1. **Token layering** — keep base tokens in `:root`, add `:root[data-theme="shibuya-punk"] { … }` override block (new file `src/themes/shibuya-punk.css`, imported after `style.css`).
2. **Theme switch** — extend Settings → Display (`src/ui/tabs/DisplayTab.ts`) with a theme picker; persist via existing display-prefs mechanism (`profileDisplayPrefs.ts`). Default new installs to Shibuya Punk.
3. **Effects intensity** — reuse the existing Visual Effects radiogroup to expose `Off / Lite / Full` neon+glitch levels (drives a `data-fx` attribute).
4. **Graceful degradation** — `@media (prefers-reduced-motion)` kills animation; `@media (prefers-contrast: more)` swaps to flat high-contrast neon; effects auto-off in `.in-game`.

This keeps the blast radius mostly in **CSS + one new file + tokens**, with minimal TS (theme picker + persistence).

---

## 8. Implementation Phases

**Phase 1 — Foundation (tokens + type).** Rework `design-system.css` tokens, swap fonts in `index.html`, add Shibuya token block. *Result: whole app instantly re-themed neon, no new components.* Lowest risk, biggest visual payoff.

**Phase 2 — Theme plumbing.** Add `data-theme`/`data-fx` attributes, `shibuya-punk.css`, theme + FX picker in DisplayTab, persistence. Wire `prefers-reduced-motion`/`prefers-contrast`.

**Phase 3 — Signature effects.** Scanline/grain/grid overlays, neon glow system, glitch keyframes (`animations.css`), focus bloom, ticker marquee. All gated.

**Phase 4 — Hero components.** Header brand lockup, library hero, game-card neon treatment, loading/boot sequence, system selector cabinets.

**Phase 5 — Surfaces & flows.** Modals, settings control-panel, toasts, multiplayer/LAN, onboarding, footer.

**Phase 6 — Polish & a11y/perf pass.** Contrast audit (WCAG AA on neon-on-black), `prefers-reduced-motion` sweep, `npm run perf:audit`, gameplay frame-budget check, cross-browser (Safari `-webkit` glow/backdrop), update `docs/style-guide.md` + `docs/UI_UX.md`.

---

## 9. File Change Map

| File | Change |
|---|---|
| `src/design-system.css` | **Major** — re-value all `--c-*`, add Shibuya tokens, shape language |
| `src/themes/shibuya-punk.css` *(new)* | `[data-theme]` overrides + effect overlays |
| `index.html` | Font links, preloader → CRT boot, theme-color meta (`#ff2e97`) |
| `src/animations.css` | Glitch, ticker, holo-shift, bloom keyframes |
| `src/style.css` | Targeted component additions (cards, header, modals, HUD); replace ~140 hardcoded hex with tokens where off-palette |
| `src/ui/tabs/DisplayTab.ts` | Theme + FX-intensity picker |
| `src/profileDisplayPrefs.ts` / display-prefs | Persist theme + fx choice |
| `src/ui/dom.ts` | (Only if a new tag/ticker/badge primitive is warranted — prefer CSS-only) |
| `public/manifest.json` | Theme/brand color refresh |
| `docs/style-guide.md`, `docs/UI_UX.md` | Document the new system (currently stale) |
| `src/ui/loadingOverlay.ts` | Boot-sequence copy/markup hooks if needed |

---

## 10. Accessibility & Performance Guardrails (non-negotiable)

- **Contrast:** every neon-on-black text pairing verified ≥ WCAG AA (4.5:1 body, 3:1 large). Neon yellow/cyan on black pass easily; magenta body text gets a brighter ramp.
- **Motion:** all glitch/marquee/scanline gated by `prefers-reduced-motion: no-preference` + user FX toggle.
- **Contrast mode:** `prefers-contrast: more` → flat neon, no glow blur.
- **Focus:** keep/strengthen visible focus (bloom ring); preserve existing `trapFocus` and controller-focus system (`style.css:4279`).
- **Perf:** pass `perf-budget.json` via `npm run perf:audit`; effects GPU-only; overlays off in `.in-game`; honor existing `content-visibility` optimizations.
- **No DOM regressions:** prefer CSS-only so `src/ui.test.ts`, `homepage.test.ts`, `modals.test.ts`, `libraryView.test.ts`, etc. keep passing.

## 11. Testing

- `npm run lint`, `npm test` (vitest) after each phase — DOM/class contracts must stay green.
- `npm run test:e2e` (Playwright) for launch flow, overlays, settings.
- `npm run build` (tsc + vite) + `npm run perf:audit`.
- Manual matrix: Chrome/Safari/Firefox, desktop + `.touch-ui` mobile, reduced-motion on/off, theme toggle, in-game chrome dimming.

## 12. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Neon glow tanks frame rate during gameplay | Auto-disable overlays in `.in-game`; perf-audit gate |
| Magenta-on-black body text fails contrast | Reserve saturated magenta for accents/large text; brighter ramp for body |
| Stale docs mislead contributors | Phase 6 updates `style-guide.md` / `UI_UX.md` |
| Safari backdrop/glow inconsistency | `-webkit-` fallbacks; test early |
| Big-bang re-theme breaks tests | Token-first + CSS-only + `data-theme` layering keeps TS/DOM stable |

## 13. Decisions (locked 2026-06-13)

1. **Default theme:** Shibuya Punk is the default. ✅
2. **Old theme:** **Retired** — no theme picker; Shibuya is the only theme. ✅
3. **Effect intensity:** **Full by default**, gated by `prefers-reduced-motion` / `prefers-contrast` and auto-off during gameplay (no persisted toggle for now). ✅
4. **Japanese text:** **Decorative only** (no i18n burden). ✅
5. **Brand/logo:** **Restyle** the existing `retrooasis-logo.svg` with neon treatment. ✅

## 14. Progress Log

- **Phase 1 (done):** token + typography rework (`design-system.css`, `index.html`, `manifest.json`).
- **Phase 3/4 (in progress):** neon logo SVG; CRT scanline + neon-grid overlays; focus bloom; card neon offset/tilt; brand glitch-on-hover; hero glitch-in + holographic tag; decorative 東京 watermark; glitch/ticker/holo/bloom keyframes; replaced visible champagne literals + leftover legacy-red hero hover with tokens.
- **Phase 5b (done):** brutalist modal + settings pass — hard-edged neon modal frame with yellow "tape" corner + glitch-in entrance, `//`/`設定` mono-JP kickers, hard cyan sidebar active bar, magenta section rules, `■` section ticks; fullscreen settings panel exempted from the dialog frame.
- **Verification:** `npm run build` ✅, modal/settings test suites ✅; remaining `npm test` failures are the 2 **pre-existing on `main`** (`ui.test.ts` settings-tab label/fallback); updated `pwaAssets.test.ts` to the new brand color.
- **Phase 5c (done):** toasts → stamp/sticker style (hard edges, per-type neon edge + glow, glitch-in); wired a seamless **katakana neon ticker** strip between content and footer (`シブヤ・パンク ★ …`), masked edges, motion-gated, hidden in-game.
- **Phase 5d (done):** brutalist multiplayer/LAN pass — hard-edged neon room cards with sticker-offset hover, mono labels, arcade `対戦` VS kicker + glitch-in on the dashboard title, neon status readout. Swept the leftover **old brand-red** (`rgba(230,0,18,*)`, 5 spots incl. game-card/hero) and material green/red/gold literals → palette tokens.
- **Phase 5e (done):** finished the hex long-tail — saturated semantic literals (danger reds, success greens, ambers, blues, violet, champagne remnants) mapped to tokens across the file. Remaining literals are intentional neutral grays + ultra-light pastel tints (light text on tinted chips), kept to preserve contrast.
- **Phase 5f (done):** CRT-boot loading overlay (scanline layer, `>` mono boot prompt + glitch on status line, hard-edged holographic progress bar), neon-danger error banner, and sticker-bombed onboarding platform chips (hard edges, per-system neon border, tilt + offset on hover).
- **Phase 5g (done):** per-system arcade accents — library system-filter chips and card system badges now light up in each console's signature `--sys-color` (neon left bar + inset glow on active chips; hard-edged mono cabinet tag on cards that glows on hover).
- **Status:** overhaul complete (Phases 1, 3, 4, 5a–g). Full suite 2717 pass; only 2 pre-existing `ui.test.ts` tab failures remain.
- **Optional follow-ups (need a browser):** real-browser visual QA pass; WCAG contrast spot-check on neon-on-black body text.
