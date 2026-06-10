# Extreme Frontend Lightweight Audit

Tracked checklist for making RetroOasis as lightweight as functional allows.

## Tooling

| Command | Purpose |
|---|---|
| `npm run build` | Production build |
| `npm run build:analyze` | Build + interactive bundle treemap (`dist/bundle-stats.html`) |
| `npm run perf:audit` | Build + enforce `perf-budget.json` limits |
| `npm run perf:baseline` | Regenerate `docs/PERF_BASELINE.md` from `dist/` |

## Phase 0 — Instrumentation

- [x] `rollup-plugin-visualizer` treemap (`npm run build:analyze`)
- [x] `perf-budget.json` size gates
- [x] `tools/perf-audit/check-budget.js` CI script
- [x] `tools/perf-audit/collect-baseline.js` baseline reporter
- [x] `docs/PERF_BASELINE.md` snapshot
- [ ] Lighthouse CI script (mobile + desktop profiles)
- [ ] Feature matrix spreadsheet (flow → required modules)

## Phase 1 — Critical Path

- [x] Lazy-load `showConflictDialog` from `main.ts` (keeps `modals` chunk off cold path)
- [x] Remove Google Fonts network dependency (system UI stack)
- [x] Consolidate orphan `Exo 2` references to design tokens
- [x] Extract `performancePrimitives.ts` (test-only pools/batchers off main chunk)
- [x] Lazy-load `compatibility.ts` on game launch (`compatibility` chunk)
- [ ] Split `performance.ts` boot probe vs heavy GPU benchmark / monitors
- [ ] Audit eager `main.ts` imports with import graph

## Phase 2 — Chunk Hygiene

- [ ] Verify `saves` chunk only loads on save/sync flows
- [ ] Sub-split `settingsTabs` (Debug / Cloud / Multiplayer)
- [ ] Trim PWA precache to shell + essential data
- [ ] `metadata` chunk for IGDB / ScreenScraper / SteamGridDB

## Phase 3 — CSS Diet

- [ ] Playwright CSS coverage pass on main flows
- [ ] Purge unused rules in `style.css` (~9k lines)
- [ ] Deduplicate `data/emulator.css` vs app CSS

## Phase 4 — DOM & Renders

- [ ] Wire `UIDirtyTracker` through library + header paths
- [ ] Incremental `renderLibrary()` for large libraries
- [ ] `IntersectionObserver` thumbnail decode gating

## Phase 5 — Runtime Memory

- [ ] Heap snapshot diff over 10 s gameplay
- [ ] Launch/stop cycle leak test (10×)

## Phase 6 — PWA & Network

- [x] Precache budget enforcement in CI
- [x] Shell-only precache (9 URLs, ~697 KB raw — down from 34 URLs / ~4.8 MB)
- [x] Lazy vs precache policy for compression WASM and cores

## Phase 7 — Legacy `data/`

- [ ] Conditional `nipplejs` / `socket.io` injection
- [ ] Compression JS only on import

## Phase 9 — Regression Matrix

Must pass after each phase:

```bash
npm run doctor
npm run lint
npm run build
npm run perf:audit
npm test
npm run test:e2e
```

## Success Targets

| Metric | Target |
|---|---|
| Main JS gzip | ≤ 150 KB (stretch: ≤ 120 KB) |
| Main CSS gzip | ≤ 32 KB (stretch: ≤ 20 KB) |
| PWA precache raw | ≤ 2.5 MB shell-focused |
| In-game JS alloc/frame | 0 KB (see `docs/MEMORY_REPORT.md`) |
