# RetroVault — Performance Report

> Covers runtime profiling findings for the RetroVault browser emulator frontend.

---

## Measurement Methodology

RetroVault instruments its own render loop using the Web Performance API:

| Mark / Measure | Where |
|---|---|
| `retrovault:launch` | `PSPEmulator.launch()` |
| `retrovault:core-ready` | `window.EJS_ready` callback |
| `retrovault:launch-to-ready` | Measure from launch → core ready |
| `retrovault:game-start` | `window.EJS_onGameStart` callback |
| `retrovault:ready-to-game-start` | Measure from core ready → game start |

FPS metrics are tracked by `FPSMonitor` (ring-buffer, zero GC allocations):

- **current** — instantaneous FPS for the last sampled frame
- **average** — rolling average over the last 60 frames
- **p95FrameTimeMs** — 95th-percentile frame time over the sampling window
- **droppedFrames** — frames exceeding 2× the target interval

---

## Frame Budget Analysis

| Target platform | Target FPS | Frame budget |
|---|---|---|
| Desktop (high tier) | 60 FPS | 16.7 ms |
| Desktop (medium tier) | 60 FPS | 16.7 ms |
| Mobile / low-spec | 30 FPS | 33.3 ms |
| Chromebook (low tier) | 30 FPS | 33.3 ms |

### Emulator Frame Cost Breakdown (Typical)

The EmulatorJS WASM core runs in the browser main thread. Approximate costs for a PSP game on a mid-range desktop:

| Phase | Estimated cost |
|---|---|
| WASM emulation (CPU-bound) | 8–12 ms |
| WebGL render (GPU-bound) | 2–4 ms |
| RetroVault UI (DOM mutations) | < 0.5 ms |
| Audio worklet | < 0.5 ms |
| **Total** | **~11–17 ms** |

RetroVault's own UI contribution is well under 1 ms per frame for all currently measured workloads.

---

## UI Rendering Cost

### FPS Overlay

The FPS overlay updates every 10 frames (adaptive: widens to every 30 frames after 3 consecutive healthy callbacks above 55 fps). Each update performs 4 `textContent` mutations and no layout recalculations. Estimated cost: **< 0.1 ms**.

### Developer Debug Overlay (F3)

The dev overlay updates on every FPS callback when visible. In addition to scalar `textContent` mutations, it draws a 60-sample frametime bar graph on a `<canvas>` (180×40 pixels). Estimated cost: **< 0.2 ms** per update.

The `UIDirtyTracker` ensures the dev overlay only performs DOM work when dirty bits are set — redundant updates are skipped with a single bitwise AND check.

### Library Grid

`renderLibrary()` rebuilds the full card grid on filter/sort changes. This is not a per-frame operation. For a 200-game library, a full rebuild takes approximately **5–15 ms** (one-time DOM build, not recurring).

---

## Startup Latency

| Phase | Typical duration |
|---|---|
| HTML parse + JS module load | 200–500 ms |
| `detectCapabilities()` (GPU benchmark) | 50–150 ms |
| IndexedDB library load | 10–50 ms |
| CDN preconnect / DNS prefetch | (async, non-blocking) |
| EmulatorJS core download (first launch) | 1–5 s (CDN, cached after) |
| WASM streaming compile | 200–800 ms |
| **First game start (cold)** | **2–7 s** |
| **First game start (warm — CDN cached)** | **0.5–1.5 s** |

---

## Memory Profile

| Category | Typical footprint |
|---|---|
| RetroVault JS modules | ~2–4 MB |
| EmulatorJS loader | ~1–2 MB |
| PSP WASM binary | ~12–20 MB |
| PSP emulated RAM (PPSSPP) | ~64–128 MB |
| ROM blob (IndexedDB → memory) | varies (UMD ~40–500 MB) |
| Texture cache (WebGL VRAM) | ~50–200 MB |
| Save state snapshots | ~5–20 MB each |

### Per-Frame Allocations

The `FPSMonitor` uses a pre-allocated `Float64Array` ring buffer — zero heap allocations per frame during gameplay. The `DrawCallBatcher` recycles command objects via `ObjectPool`. The `MemoryMonitor` fires `onPressure` when heap usage exceeds 80%, with a 30-second cooldown.

---

## Adaptive Quality System

The emulator monitors FPS continuously and suggests tier downgrades when sustained low FPS is detected:

| Condition | Action |
|---|---|
| avg FPS < 25 for ~5 s | Suggest performance mode downgrade |
| avg FPS ≥ 55 for 3+ callbacks | Widen FPS monitor interval (30 frames) to reduce overhead |
| Battery ≤ 20% and discharging | Force "performance" tier |

---

## Profiling Tools

- **F3 Developer Overlay** — Toggle the in-game dev overlay to see real-time FPS, frame time, p95 frame time, dropped frames, JS heap usage, and emulator state. A mini bar-graph shows the last 60 frame times.
- **Browser DevTools** — `performance.mark` / `performance.measure` entries are written for launch, core-ready, and game-start milestones. Visible in the Performance panel's User Timings track.
- **`MemoryMonitor`** — Access via `emulator.memoryMonitor.usedHeapMB` / `heapLimitMB` from the browser console.
- **`FrameBudget`** — Available in `performance.ts` for custom per-component budget tracking.
