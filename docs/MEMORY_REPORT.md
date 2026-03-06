# RetroVault — Memory Report

> Analysis of per-frame allocations, heap pressure sources, and mitigation strategies.

---

## Summary

RetroVault's own JavaScript code produces **near-zero per-frame heap allocations** during active gameplay. The dominant memory consumers are the EmulatorJS WASM core and its emulated system RAM, which are allocated once at launch and held for the session.

---

## Allocation Hotspots

### FPSMonitor (emulator.ts)

**Before**: Early prototype used `Array.prototype.shift()` on a growing buffer — one allocation and one deallocation per frame.

**After**: Pre-allocated `Float64Array` ring buffer. Zero per-frame allocations. A separate `Float64Array` scratch buffer (`_sortedScratch`) is reused for p95 calculation on each callback.

### DrawCallBatcher (performance.ts)

`DrawCallBatcher` uses an `ObjectPool<DrawCommand>` to recycle `DrawCommand` instances between frames. Commands dispatched in frame N are returned to the pool at the start of frame N+1's `flush()` call. Zero net allocations in steady state.

### AudioVisualiser (ui.ts)

`AudioVisualiser` holds a single pre-allocated `Uint8Array` (`_buffer`) for frequency data. The canvas 2D context uses `fillRect` for each bar — no intermediate arrays created per frame.

### UIDirtyTracker (performance.ts)

`UIDirtyTracker` stores a single integer (`_flags`). All operations (`mark`, `consume`, `peek`, `reset`) are bitwise — no heap involvement.

---

## Per-Session Allocations (One-Time)

| Allocation | When | Freed |
|---|---|---|
| WASM linear memory | `PSPEmulator.launch()` | `PSPEmulator.stop()` |
| ROM blob (ArrayBuffer) | Library `getFile()` | After WASM load or on stop |
| EmulatorJS CDN scripts | First launch | Never (cached in browser) |
| IndexedDB connection | App startup | App unload |
| WebGPU device + buffers | First WebGPU init | `PSPEmulator.stop()` |
| Touch control buttons | `TouchControlsOverlay` constructor | `overlay.destroy()` |

---

## Heap Pressure Monitoring

The `MemoryMonitor` class polls `performance.memory.usedJSHeapSize` every 10 seconds while the emulator is running. It fires `onPressure(usedMB, limitMB)` when heap usage exceeds 80% of the browser-reported JS heap limit, with a 30-second cooldown between callbacks.

```typescript
emulator.memoryMonitor.onPressure = (usedMB, limitMB) => {
  console.warn(`Heap at ${usedMB}/${limitMB} MB — consider lowering quality`);
};
```

The emulator wires this automatically and logs a warning to the console. The memory value is also displayed in the F3 developer debug overlay.

---

## Known Memory Leak Risks

| Risk | Status | Mitigation |
|---|---|---|
| `keydown` listeners not removed on `initUI` re-call | Acceptable in production (single init) | Tests use `document.body.innerHTML=""` per test |
| ROM blobs retained in IndexedDB after delete | IndexedDB handles lifetime | `library.removeGame()` calls `IDBObjectStore.delete` |
| WebGPU resources on pipeline rebuild | Managed | `_destroySourceTexture()` and uniform buffer cleanup in `_rebuildPipeline()` |
| Audio worklet AudioContext not closed on stop | Managed | `setupAudioWorklet` guard prevents double-init; context closed on `PSPEmulator.stop()` |
| Save state screenshot thumbnails | Managed | Thumbnails are stored as compressed blobs, not held in JS memory |

---

## Object Pooling Usage

The `ObjectPool<T, A>` class in `performance.ts` provides a generic object pool:

```typescript
const pool = new ObjectPool(
  () => new DrawCommand(),  // factory
  (cmd) => cmd.reset(),     // reset on release
  64                         // initial capacity
);
const cmd = pool.acquire();
// ... use cmd ...
pool.release(cmd);
```

Currently used by:
- `DrawCallBatcher` — pools `DrawCommand` instances

Available for extension to other hot-path objects (e.g., event objects, animation frames).

---

## Recommendations

1. **Library thumbnails** — If the library exceeds 500 games, consider lazy-loading thumbnail `<img>` `src` attributes using `IntersectionObserver` to avoid decoding off-screen images.
2. **Save state blobs** — Large save states (PSP: up to 20 MB) are loaded into memory on `quickLoad`. Streaming state loads are not currently supported by EmulatorJS.
3. **WebGPU uniform buffers** — Post-process uniforms are written every frame via `device.queue.writeBuffer()`. This is a mapped write with no JS allocation — acceptable.
4. **String concatenation in diagnosticLog** — `PSPEmulator.logDiagnostic()` appends to an array with a template literal per event. This is a diagnostics path (not per-frame) so the allocation cost is negligible.
