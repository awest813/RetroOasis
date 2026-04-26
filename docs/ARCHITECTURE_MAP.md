# RetroOasis — Architecture Map

> Generated as part of the Phase 1 deep codebase audit.

---

## Engine Core

| File | Role |
|---|---|
| `src/main.ts` | Application bootstrap, settings persistence, launch orchestration |
| `src/emulator.ts` | Multi-system EmulatorJS wrapper (`PSPEmulator`), FPS monitor, WebGPU integration |
| `src/systems.ts` | System definitions (50+ consoles), tier-aware core config, extension registry |
| `src/performance.ts` | Device capability detection, GPU benchmark, tier resolution, `UIDirtyTracker`, `ObjectPool`, `FrameBudget`, `DrawCallBatcher` |

---

## Rendering System

| File | Role |
|---|---|
| `src/webgpuPostProcess.ts` | WebGPU post-processing pipeline (CRT, sharpen, LCD, bloom, FXAA) |
| `src/shaderCache.ts` | WGSL shader caching keyed by effect type |
| EmulatorJS (CDN) | Game canvas rendering via WebGL 1/2 inside the iframe-equivalent player element |

### Render Pipeline

```
Game ROM
  └─► EmulatorJS WASM core
        └─► WebGL canvas (hardware-accelerated)
              └─► WebGPUPostProcessor (optional post-effects)
                    └─► Display
```

The EmulatorJS render loop is opaque — it runs inside the CDN-loaded script. RetroOasis hooks into it via `window.EJS_*` callbacks and the game canvas reference.

---

## UI Layer

| File | Role |
|---|---|
| `src/ui.ts` | DOM build, settings panels, library rendering, FPS overlay, **F3 dev overlay** |
| `src/touchControls.ts` | Virtual gamepad overlay (drag-to-reposition, portrait/landscape layouts) |
| `src/style.css` | Full stylesheet (CSS custom properties, responsive, dark theme) |

### UI Regions and Dirty Flags

The `UIDirtyTracker` in `performance.ts` tracks which regions need re-rendering:

| Flag | Region |
|---|---|
| `LIBRARY` | Game library card grid |
| `FPS_OVERLAY` | FPS counter overlay (top-left, in-game) |
| `DEV_OVERLAY` | Developer debug overlay (top-right, F3 toggle) |
| `HEADER_STATUS` | Status dot and tier badge in the app header |
| `SETTINGS` | Settings panel content |
| `TOUCH_CONTROLS` | Touch gamepad overlay layout |

### Known Architecture Notes

- **UI is tightly coupled to DOM**: All UI is rendered directly into the document. There is no virtual DOM or component abstraction layer.
- **Library re-render**: `renderLibrary()` rebuilds the entire card grid on every sort/filter change. For large libraries this is acceptable but could benefit from incremental diffing.
- **Settings panel**: Rebuilt from scratch on every open. Suitable for current panel complexity.

---

## Input System

| File / Location | Role |
|---|---|
| `src/ui.ts` — `initUI()` | Global keyboard shortcuts (F1/F3/F5/F7/F9/Esc) via capture-phase listener |
| `src/touchControls.ts` | Touch event routing to the virtual gamepad |
| EmulatorJS (CDN) | Game controller input (keyboard, gamepad API) |

### Input Routing

```
KeyboardEvent
  └─► document (capture phase) — RetroOasis shortcuts (F1/F3/F5/F7/F9/Esc)
        └─► (if not consumed) EmulatorJS keydown handler — game controls

TouchEvent
  └─► TouchControlsOverlay — synthetic keyboard events to EmulatorJS

GamepadEvent
  └─► EmulatorJS (handled internally)
```

---

## Game Logic / State Management

| File | Role |
|---|---|
| `src/emulator.ts` | Emulator lifecycle state machine: `idle → loading → running → paused → error` |
| `src/saves.ts` | Save state CRUD (IndexedDB), checksum/compression, auto-save slot |
| `src/autoRestore.ts` | Detects and prompts for auto-save restore on game launch |
| `src/patcher.ts` | ROM patching (IPS/BPS/UPS format application before launch) |
| `src/multiplayer.ts` | Netplay (WebRTC signalling, ICE servers, PSP/NDS/N64 support) |

---

## Asset Management

| File | Role |
|---|---|
| `src/library.ts` | Game library (IndexedDB), ROM blob management, metadata, duplicate detection |
| `src/bios.ts` | BIOS file storage and validation per-system |
| `src/archive.ts` | ZIP/7z extraction for compressed ROM files |
| `src/cloudSave.ts` | Cloud save sync (WebDAV provider, conflict resolution) |

### Asset Loading Flow

```
User drops/picks file
  └─► archive.ts — extract if ZIP/7z
        └─► patcher.ts — apply patch if .ips/.bps/.ups sidecar
              └─► library.ts — store ROM blob in IndexedDB
                    └─► emulator.ts — load from IndexedDB on launch
                          └─► WASM streaming compile (async)
```

---

## Networking

| File | Role |
|---|---|
| `src/multiplayer.ts` | WebRTC netplay via signalling server; supports PSP, NDS, N64 |
| `src/cloudSave.ts` | WebDAV-based cloud sync for save states |

---

## Architecture Problems Identified

| Problem | Location | Severity |
|---|---|---|
| No incremental library diff | `ui.ts:renderLibrary()` | Medium — full grid rebuild on filter/sort |
| No `UIDirtyTracker` integration on FPS overlay | `ui.ts:updateFPSOverlay()` | Low — overlay only updates on FPS callback (already throttled) |
| Keyboard listeners accumulate on `initUI` re-calls | `ui.ts:initUI()` | Low — not an issue in production (single init), affects test isolation |
| No input manager abstraction | `ui.ts`, EmulatorJS | Low — single capture listener works correctly for current use cases |
| Synchronous library metadata reads in grid render | `ui.ts:renderLibrary()` | Low — library metadata is small; no measurable impact |
