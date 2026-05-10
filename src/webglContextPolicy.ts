/**
 * Browser WebGL context policy for EmulatorJS cores.
 *
 * RetroOasis does not own the cores’ render loops, but we can steer how the
 * browser creates WebGL contexts via `powerPreference` and selected
 * `WebGLContextAttributes` — especially on Chromebooks, when the user
 * picks Performance vs Quality graphics mode, and when WebGPU post-processing
 * must read the framebuffer after presenting (`preserveDrawingBuffer`).
 */

import type { DeviceCapabilities, PerformanceMode } from "./performance.js";

/** Resolved preference before merging with per-call `getContext` options. */
export type WebGlPowerPreferenceChoice = "default" | "low-power" | "high-performance";

/**
 * Map app graphics mode + device class to a WebGL `powerPreference` hint.
 * - Performance mode → always conservative GPU clocks where the browser honours it.
 * - Quality → high-performance on capable hosts; stays low-power on low-spec / Chrome OS.
 * - Auto → low-power only for classified constrained devices; otherwise browser default.
 */
export function resolveWebGlPowerPreferenceForShell(
  mode: PerformanceMode,
  caps: Pick<DeviceCapabilities, "isLowSpec" | "isChromOS">,
): WebGlPowerPreferenceChoice {
  if (mode === "performance") return "low-power";
  if (mode === "quality") {
    return caps.isLowSpec || caps.isChromOS ? "low-power" : "high-performance";
  }
  if (caps.isLowSpec || caps.isChromOS) return "low-power";
  return "default";
}

let installed = false;
let uninstall: (() => void) | null = null;

/** State read on every WebGL `getContext` so mid-session pref changes apply. */
export interface WebGlContextPolicyState {
  performanceMode: PerformanceMode;
  deviceCaps: DeviceCapabilities;
  /** When true, merge `preserveDrawingBuffer: true` unless the caller set it explicitly. */
  forcePreserveDrawingBuffer?: boolean;
}

/**
 * Patch `HTMLCanvasElement.prototype.getContext` once so every WebGL context
 * honours {@link resolveWebGlPowerPreferenceForShell} unless the caller
 * already passed `powerPreference`, and optionally sets `preserveDrawingBuffer`
 * for WebGPU canvas capture.
 *
 * `getState` is invoked on **each** WebGL context creation so Graphics Mode
 * changes apply without a page reload (EmulatorJS typically creates GL after
 * the user launches a game).
 */
export function installWebGlContextPolicy(
  getState: () => WebGlContextPolicyState,
): () => void {
  if (typeof HTMLCanvasElement === "undefined") {
    return () => {};
  }
  if (installed) return uninstall ?? (() => {});

  const proto = HTMLCanvasElement.prototype as unknown as {
    getContext: (
      this: HTMLCanvasElement,
      contextId: string,
      options?: WebGLContextAttributes,
    ) => RenderingContext | null;
  };
  const nativeGetContext = proto.getContext;

  proto.getContext = function (
    this: HTMLCanvasElement,
    type: string,
    options?: WebGLContextAttributes,
  ): RenderingContext | null {
    const isGl =
      type === "webgl" || type === "webgl2" || type === "experimental-webgl";
    if (!isGl) return nativeGetContext.call(this, type, options);

    const { performanceMode, deviceCaps, forcePreserveDrawingBuffer } = getState();
    const choice = resolveWebGlPowerPreferenceForShell(performanceMode, deviceCaps);
    const attrs: WebGLContextAttributes = { ...(options ?? {}) };
    if (choice !== "default" && attrs.powerPreference === undefined) {
      attrs.powerPreference = choice;
    }
    if (forcePreserveDrawingBuffer && attrs.preserveDrawingBuffer === undefined) {
      attrs.preserveDrawingBuffer = true;
    }
    return nativeGetContext.call(this, type, attrs);
  };

  installed = true;
  uninstall = () => {
    if (!installed) return;
    proto.getContext = nativeGetContext;
    installed = false;
    uninstall = null;
  };
  return uninstall;
}

/** @internal Vitest helpers */
export function __resetWebGlContextPolicyForTests(): void {
  uninstall?.();
}
