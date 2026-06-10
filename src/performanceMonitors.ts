/**
 * performanceMonitors.ts — Runtime monitors loaded with the emulator (lazy chunk).
 *
 * MemoryMonitor, ThermalMonitor, StartupProfiler, and FpsPrediction are not
 * needed for the library shell — only once a game session starts.
 */

// ── Memory pressure monitoring ────────────────────────────────────────────────

/**
 * Monitors JS heap usage and fires a callback when the heap approaches its
 * browser-imposed limit.
 *
 * Uses the non-standard (Chrome-only) `performance.memory` API. On browsers
 * that do not expose this API the monitor is a no-op — `usedHeapMB` and
 * `heapLimitMB` return `null` and the pressure callback never fires.
 *
 * Usage:
 * ```typescript
 * const monitor = new MemoryMonitor();
 * monitor.onPressure = (usedMB, limitMB) => {
 *   console.warn(`Heap at ${usedMB} / ${limitMB} MB — consider reducing quality`);
 * };
 * monitor.start();          // begin polling every 10 s
 * // … later …
 * monitor.stop();
 * ```
 */
export class MemoryMonitor {
  private _intervalId: ReturnType<typeof setInterval> | null = null;
  private _onPressure?: (usedMB: number, limitMB: number) => void;
  private _lastPressureTime = 0;

  /** Minimum gap between successive `onPressure` callbacks (30 seconds). */
  private static readonly _PRESSURE_COOLDOWN_MS = 30_000;
  /**
   * Heap usage fraction (0–1) above which pressure is reported.
   * 0.80 = 80 % of the reported JS heap limit.
   */
  private static readonly _PRESSURE_THRESHOLD = 0.80;

  /**
   * Callback fired when JS heap usage exceeds 80 % of the browser-reported
   * limit. Rate-limited to at most once per 30 seconds.
   */
  set onPressure(cb: (usedMB: number, limitMB: number) => void) {
    this._onPressure = cb;
  }

  /** Current used JS heap in MB, or null when the API is unavailable. */
  get usedHeapMB(): number | null {
    return MemoryMonitor._getUsedHeapMB();
  }

  /** JS heap size limit in MB, or null when the API is unavailable. */
  get heapLimitMB(): number | null {
    return MemoryMonitor._getHeapLimitMB();
  }

  private static _getUsedHeapMB(): number | null {
    try {
      const perf = performance as Performance & {
        memory?: { usedJSHeapSize?: number };
      };
      const used = perf.memory?.usedJSHeapSize;
      return used != null ? Math.round(used / (1024 * 1024)) : null;
    } catch {
      return null;
    }
  }

  private static _getHeapLimitMB(): number | null {
    try {
      const perf = performance as Performance & {
        memory?: { jsHeapSizeLimit?: number };
      };
      const limit = perf.memory?.jsHeapSizeLimit;
      return limit != null ? Math.round(limit / (1024 * 1024)) : null;
    } catch {
      return null;
    }
  }

  /**
   * Begin polling JS heap usage at the given interval.
   *
   * @param intervalMs  How often to sample the heap (default 10 000 ms).
   *                    Shorter intervals increase the chance of catching
   *                    a short-lived spike but add minor CPU overhead.
   */
  start(intervalMs = 10_000): void {
    if (this._intervalId !== null) return; // already running
    this._intervalId = setInterval(() => { this._check(); }, intervalMs);
  }

  /** Stop the polling interval. */
  stop(): void {
    if (this._intervalId !== null) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }
  }

  private _check(): void {
    const usedMB  = MemoryMonitor._getUsedHeapMB();
    const limitMB = MemoryMonitor._getHeapLimitMB();
    if (usedMB === null || limitMB === null || limitMB === 0) return;

    const ratio = usedMB / limitMB;
    if (ratio >= MemoryMonitor._PRESSURE_THRESHOLD) {
      const now = Date.now();
      if (now - this._lastPressureTime > MemoryMonitor._PRESSURE_COOLDOWN_MS) {
        this._lastPressureTime = now;
        this._onPressure?.(usedMB, limitMB);
      }
    }
  }
}

// ── Thermal monitor (Compute Pressure API) ────────────────────────────────────

/**
 * Thermal/compute pressure state observed via the Compute Pressure API.
 *
 * - "nominal"  — Device is running cool; no throttling expected.
 * - "fair"     — Minor thermal load; brief throttling bursts possible.
 * - "serious"  — Sustained high thermal load; performance is impacted.
 * - "critical" — Device is overheating; OS-level throttling is active.
 * - "unknown"  — Compute Pressure API is unavailable in this browser.
 */
export type ThermalPressureState = "nominal" | "fair" | "serious" | "critical" | "unknown";

/**
 * Monitors CPU/thermal pressure using the Compute Pressure API (Chrome 125+).
 *
 * When the API is unavailable the monitor enters "unknown" state and no
 * callbacks are fired. Callers should treat "unknown" as "nominal" for
 * decision-making purposes.
 *
 * ### Usage
 * ```typescript
 * const monitor = new ThermalMonitor();
 * monitor.onPressureChange = (state, prev) => {
 *   if (state === "serious" || state === "critical") {
 *     emulator.suggestTierDowngrade();
 *   }
 * };
 * await monitor.start();
 * // … later …
 * monitor.stop();
 * ```
 */
export class ThermalMonitor {
  private _state: ThermalPressureState = "unknown";
  private _observer: unknown = null;   // PressureObserver (typed as unknown for API compat)
  private _running = false;

  /**
   * Fired when the compute pressure state transitions to a new value.
   * The second argument is the previous state.
   */
  onPressureChange?: (state: ThermalPressureState, prev: ThermalPressureState) => void;

  /** Current pressure state. "unknown" when the API is unavailable. */
  get state(): ThermalPressureState { return this._state; }

  /** Whether the Compute Pressure API is available in this browser. */
  static isSupported(): boolean {
    return typeof (globalThis as Record<string, unknown>)["PressureObserver"] === "function";
  }

  /**
   * Start observing CPU pressure.
   *
   * Resolves immediately when the Compute Pressure API is unavailable —
   * the instance remains in "unknown" state but is otherwise harmless.
   *
   * @returns Promise that resolves once observation has started (or been
   *          determined to be unsupported).
   */
  async start(): Promise<void> {
    if (this._running) return;
    const PO = (globalThis as Record<string, unknown>)["PressureObserver"] as
      | { new(cb: (records: Array<{ state: string }>) => void): { observe(source: string): Promise<void>; unobserve(source: string): void } }
      | undefined;
    if (!PO) return;

    this._running = true;
    this._observer = new PO((records: Array<{ state: string }>) => {
      const last = records[records.length - 1];
      if (!last) return;
      const next = this._mapState(last.state);
      if (next !== this._state) {
        const prev = this._state;
        this._state = next;
        this.onPressureChange?.(next, prev);
      }
    });
    try {
      await (this._observer as { observe(source: string): Promise<void> }).observe("cpu");
    } catch {
      // Observation start failed (e.g. permissions policy) — stay in "unknown"
      this._running = false;
      this._observer = null;
    }
  }

  /** Stop observing CPU pressure. */
  stop(): void {
    if (!this._running || !this._observer) return;
    try {
      (this._observer as { unobserve(source: string): void }).unobserve("cpu");
    } catch { /* ignore */ }
    this._running = false;
    this._observer = null;
    this._state = "unknown";
  }

  private _mapState(raw: string): ThermalPressureState {
    if (raw === "nominal" || raw === "fair" || raw === "serious" || raw === "critical") {
      return raw as ThermalPressureState;
    }
    return "unknown";
  }
}

// ── Startup profiler ──────────────────────────────────────────────────────────

/**
 * A named phase in the emulator launch pipeline.
 *
 * - "core_download" — Time from launch until the WASM core is initialized and the
 *                     Emscripten VFS is mounted (`saveDatabaseLoaded`).
 * - "wasm_compile"  — Reserved for WASM compile timing (not yet instrumented).
 * - "bios_load"     — Reserved for BIOS fetch timing (not yet instrumented).
 * - "first_frame"   — Time from core init until `EJS_onGameStart` (ROM load + boot).
 */
export type LaunchPhase = "core_download" | "wasm_compile" | "bios_load" | "first_frame";

/** A completed launch phase with start and end timestamps (performance.now). */
export interface LaunchPhaseRecord {
  phase:      LaunchPhase;
  startMs:    number;
  endMs:      number;
  durationMs: number;
}

/**
 * High-resolution launch phase profiler.
 *
 * Records how long each phase of the emulator startup takes.  The slowest
 * phase is surfaced so the caller can display a targeted optimisation hint
 * (e.g. "Slow core download — check your connection").
 *
 * ### Usage
 * ```typescript
 * const profiler = new StartupProfiler();
 * profiler.begin("core_download");
 * // … fetch core files …
 * profiler.end("core_download");
 * profiler.begin("first_frame");
 * // … wait for EJS_onGameStart …
 * profiler.end("first_frame");
 *
 * const summary = profiler.summary();
 * console.log(`Total: ${summary.totalMs.toFixed(0)} ms`);
 * console.log(`Slowest: ${summary.slowest?.phase} (${summary.slowest?.durationMs.toFixed(0)} ms)`);
 * ```
 */
export class StartupProfiler {
  private _phases: Map<LaunchPhase, { startMs: number; endMs?: number }> = new Map();

  /** Mark the start of a launch phase. Idempotent per phase. */
  begin(phase: LaunchPhase): void {
    if (this._phases.has(phase)) return;
    this._phases.set(phase, { startMs: this._now() });
  }

  /**
   * Mark the end of a launch phase.
   *
   * Silently no-ops when `begin()` has not been called for this phase, or when
   * `end()` has already been called (idempotent).
   */
  end(phase: LaunchPhase): void {
    const rec = this._phases.get(phase);
    if (!rec) return;
    if (rec.endMs === undefined) {
      rec.endMs = this._now();
    }
  }

  /** Return all completed phase records, sorted by start time. */
  records(): LaunchPhaseRecord[] {
    const out: LaunchPhaseRecord[] = [];
    for (const [phase, rec] of this._phases) {
      if (rec.endMs !== undefined) {
        out.push({
          phase,
          startMs:    rec.startMs,
          endMs:      rec.endMs,
          durationMs: rec.endMs - rec.startMs,
        });
      }
    }
    out.sort((a, b) => a.startMs - b.startMs);
    return out;
  }

  /**
   * Summary of all completed phases.
   *
   * Returns the total elapsed time across completed phases, the slowest
   * individual phase, and all records.
   */
  summary(): { totalMs: number; slowest: LaunchPhaseRecord | null; records: LaunchPhaseRecord[] } {
    const recs = this.records();
    let totalMs = 0;
    let slowest: LaunchPhaseRecord | null = null;
    for (const r of recs) {
      totalMs += r.durationMs;
      if (!slowest || r.durationMs > slowest.durationMs) slowest = r;
    }
    return { totalMs, slowest, records: recs };
  }

  /** Reset all phase records (e.g. before a new launch attempt). */
  reset(): void {
    this._phases.clear();
  }

  private _now(): number {
    try { return performance.now(); } catch { return Date.now(); }
  }
}

// ── FPS prediction ────────────────────────────────────────────────────────────

/**
 * Collects FPS samples over an initial observation window and predicts
 * whether the current tier can sustain 60 fps long-term.
 *
 * Uses a simple linear-regression trend over the collected samples to
 * determine if FPS is stable, degrading, or recovering. After `windowMs`
 * milliseconds the prediction is locked in and no new samples are accepted.
 *
 * ### Design
 * - Observation window: first 5 s of gameplay (configurable).
 * - Minimum samples: 3 (fewer gives an unreliable prediction).
 * - FPS threshold: 55 fps → "sustainable"; below → "unsustainable".
 * - Trend threshold: slope < −2 fps/s over the window → "degrading".
 */
export class FpsPrediction {
  private readonly _windowMs:    number;
  private readonly _minSamples:  number;
  private readonly _targetFps:   number;
  private _samples: Array<{ t: number; fps: number }> = [];
  private _locked  = false;
  private _startMs = -1;

  /**
   * @param windowMs    Observation window in milliseconds (default 5000).
   * @param targetFps   FPS threshold above which the tier is "sustainable" (default 55).
   * @param minSamples  Minimum samples required for a prediction (default 3).
   */
  constructor(windowMs = 5_000, targetFps = 55, minSamples = 3) {
    this._windowMs   = windowMs;
    this._targetFps  = targetFps;
    this._minSamples = minSamples;
  }

  /**
   * Record a new FPS sample.
   *
   * Samples are ignored after the prediction window closes or when the
   * prediction has been locked.
   *
   * @param fps  Current FPS reading (must be a finite non-negative number).
   * @param nowMs  Current time in ms (defaults to `performance.now()`).
   */
  addSample(fps: number, nowMs?: number): void {
    if (this._locked || !Number.isFinite(fps) || fps < 0) return;
    const t = nowMs ?? this._now();
    if (this._startMs < 0) this._startMs = t;
    if (t - this._startMs > this._windowMs) {
      this._locked = true;
      return;
    }
    this._samples.push({ t, fps });
  }

  /** Whether the observation window has elapsed. */
  get isLocked(): boolean { return this._locked; }

  /** Number of samples collected so far. */
  get sampleCount(): number { return this._samples.length; }

  /**
   * Return a prediction once enough samples have been collected.
   *
   * Returns `null` if fewer than `minSamples` samples are available.
   *
   * ### Result fields
   * - `sustainable`  — `true` when the average FPS meets the threshold AND
   *                    the trend is not strongly negative.
   * - `averageFps`   — Mean FPS over the observation window.
   * - `trendFpsPerS` — FPS slope (fps per second) from linear regression.
   *                    Negative means FPS is degrading; positive means recovery.
   * - `confidence`   — `"low"` | `"medium"` | `"high"` based on sample count.
   */
  predict(): {
    sustainable: boolean;
    averageFps: number;
    trendFpsPerS: number;
    confidence: "low" | "medium" | "high";
  } | null {
    if (this._samples.length < this._minSamples) return null;

    const n = this._samples.length;
    let sumFps = 0;
    for (const s of this._samples) sumFps += s.fps;
    const averageFps = sumFps / n;

    // Linear regression: fps = a*t + b — we want the slope (a) in fps/second
    const tRef = this._samples[0]!.t;
    let sumT  = 0, sumF = 0, sumTF = 0, sumT2 = 0;
    for (const s of this._samples) {
      const tSec = (s.t - tRef) / 1000;
      sumT  += tSec;
      sumF  += s.fps;
      sumTF += tSec * s.fps;
      sumT2 += tSec * tSec;
    }
    const denom = n * sumT2 - sumT * sumT;
    const trendFpsPerS = denom !== 0 ? (n * sumTF - sumT * sumF) / denom : 0;

    // A strongly negative slope (< −2 fps/s) is a warning sign even if the
    // current average is above threshold — the tier is likely unsustainable.
    const sustainable = averageFps >= this._targetFps && trendFpsPerS >= -2;

    const confidence: "low" | "medium" | "high" =
      n >= 20 ? "high" : n >= 8 ? "medium" : "low";

    return { sustainable, averageFps, trendFpsPerS, confidence };
  }

  /** Reset the predictor for a new game session. */
  reset(): void {
    this._samples = [];
    this._locked  = false;
    this._startMs = -1;
  }

  private _now(): number {
    try { return performance.now(); } catch { return Date.now(); }
  }
}
