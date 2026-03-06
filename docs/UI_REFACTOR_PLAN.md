# RetroVault — UI Refactor Plan

> Roadmap for evolving the UI layer from a monolithic DOM-building module into a cleaner, more modular architecture.

---

## Current State

`src/ui.ts` (~3 800 lines) is a monolithic module that handles:

- DOM scaffolding (`buildDOM`)
- Event wiring (`initUI`)
- Library rendering (`renderLibrary`)
- All settings tabs (Performance, Display, Library, BIOS, Multiplayer, Debug, About)
- Save state gallery
- FPS overlay
- Developer debug overlay
- Toast notifications
- Confirmation dialogs
- Cloud save UI

This is a **flat function architecture** — there are no classes, no components, and no abstraction boundary between layout, data fetching, and event handling.

---

## Target Architecture

```
src/ui/
├── UIManager.ts          — top-level coordinator (replaces initUI)
├── UIStateMachine.ts     — view transitions (landing ↔ emulator ↔ settings)
├── UILayoutSystem.ts     — layout helpers (make(), el(), dirty flags)
├── UIThemeSystem.ts      — CSS custom property management, colorblind modes
│
├── widgets/
│   ├── Button.ts
│   ├── Panel.ts
│   ├── Toggle.ts
│   ├── Slider.ts
│   ├── VirtualList.ts    — windowed rendering for large lists
│   └── Toast.ts
│
├── screens/
│   ├── LandingScreen.ts  — library grid + drop zone
│   ├── EmulatorScreen.ts — game canvas + FPS/dev overlays + in-game header
│   ├── SettingsScreen.ts — tabbed settings panel (orchestrator)
│   └── SaveGallery.ts    — save state slot gallery
│
└── tabs/
    ├── PerformanceTab.ts
    ├── DisplayTab.ts
    ├── LibraryTab.ts
    ├── BiosTab.ts
    ├── MultiplayerTab.ts
    ├── DebugTab.ts
    └── AboutTab.ts
```

---

## Completed Work

### ✅ Phase 11 — Developer Debug Overlay (F3)

A toggleable developer overlay is now available at `F3`:

- **FPS** — instantaneous frames per second
- **Frame time** — estimated ms per frame (1000 / FPS)
- **P95** — 95th-percentile frame time from `FPSSnapshot.p95FrameTimeMs`
- **Dropped** — total dropped frames in the sampling window
- **Memory** — JS heap usage (MB) from `performance.memory` where available
- **State** — current emulator state (idle / loading / running / paused / error)
- **Frame-time graph** — 60-sample mini bar chart rendered on a `<canvas>`

The overlay is positioned top-right over the game canvas and has no pointer interaction (touch/click falls through to EmulatorJS).

### ✅ Phase 4 (partial) — UI Dirty Flag System

`UIDirtyTracker` and `UIDirtyFlags` are exported from `performance.ts`:

```typescript
import { UIDirtyFlags, UIDirtyTracker } from "./performance.js";

const dirty = new UIDirtyTracker();
dirty.mark(UIDirtyFlags.FPS_OVERLAY);

// In render loop:
if (dirty.consume(UIDirtyFlags.FPS_OVERLAY)) updateFPSOverlay();
if (dirty.consume(UIDirtyFlags.LIBRARY))     renderLibrary();
```

The dev overlay uses `UIDirtyTracker` internally to skip DOM mutations in frames where no new data arrived.

---

## Planned Work

### Phase 4 — Complete UI Dirty Flag Integration

Wire `UIDirtyTracker` into all UI update paths:

- [ ] `renderLibrary` — mark `LIBRARY` dirty on filter/sort change; skip rebuild if clean
- [ ] `updateStatusDot` — mark `HEADER_STATUS` dirty on state change
- [ ] `setStatusTier` — mark `HEADER_STATUS` dirty on tier change

### Phase 8 — Input System Refactor

Replace the raw `document.addEventListener("keydown", ...)` in `initUI` with a centralized `InputRouter`:

```typescript
class InputRouter {
  private _uiShortcuts: Map<string, () => void>;
  private _gameShortcuts: Map<string, () => void>;

  handleKey(e: KeyboardEvent): void {
    if (this._uiShortcuts.has(e.key)) {
      this._uiShortcuts.get(e.key)!();
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    // Game shortcuts only when emulator is running
    if (emulator.state === "running" && this._gameShortcuts.has(e.key)) {
      this._gameShortcuts.get(e.key)!();
      e.preventDefault();
      e.stopPropagation();
    }
  }
}
```

Benefits:
- Single listener (no accumulation across reinitializations)
- Explicit routing table (easier to document and extend)
- Prevents duplicate listeners in test environments

### Phase 9 — Library Virtualization

For libraries with many games, replace the flat card grid with a virtualized list that only renders visible cards:

```typescript
class VirtualList<T> {
  constructor(
    container: HTMLElement,
    items: T[],
    renderItem: (item: T) => HTMLElement,
    itemHeight: number
  );
  scrollTo(index: number): void;
  update(items: T[]): void;
}
```

Threshold: Enable virtualization when library exceeds 100 games. Below this threshold, the full grid renders without virtualization overhead.

### Phase 12 — UX Improvements

- [ ] Controller/gamepad navigation in settings and library
- [ ] Menu open/close transitions (CSS `@starting-style` or `animation`)
- [ ] UI scale slider (affects `--ui-scale` CSS custom property)
- [ ] High-contrast mode toggle
- [ ] Font size preference (maps to `--font-scale`)

### Phase 2 (extended) — UI Render Timing

Add `performance.mark` calls around UI update functions:

```typescript
function updateFPSOverlay(snapshot, emulator) {
  performance.mark("rv:ui-fps-start");
  // ... DOM mutations ...
  performance.measure("rv:ui-fps", "rv:ui-fps-start");
}
```

This surfaces UI cost in the DevTools Performance panel alongside the existing launch/ready/game-start marks.

---

## Migration Strategy

The refactor should be **incremental** to avoid regressions:

1. Extract utility types and helpers (`make`, `el`, `UIDirtyTracker`) into `src/ui/UILayoutSystem.ts`
2. Move each settings tab to its own file in `src/ui/tabs/`
3. Move each screen to `src/ui/screens/`
4. Move widgets to `src/ui/widgets/`
5. Replace `initUI` with `UIManager.init()` as the final step

Each step is independently testable. Existing tests in `src/ui.test.ts` remain valid throughout — they test behaviour, not file structure.

---

## Principles

| Principle | Description |
|---|---|
| **Data-driven** | UI state is derived from data (settings, library, emulator state) — not from imperative mutations scattered through callback hell |
| **Event-driven** | Components communicate via events (`CustomEvent` or a simple `EventBus`), not by calling each other's methods directly |
| **Dirty-flag rendering** | DOM mutations only happen when the corresponding dirty bit is set |
| **No game logic in UI** | UI components call orchestration functions; they never read emulator internals directly |
| **Independent testability** | Each tab and screen is a pure function or class that can be unit-tested without building the full DOM |
