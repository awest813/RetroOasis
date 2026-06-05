// ── Node.js 25 localStorage compatibility ───────────────────────────────────

if (typeof window !== "undefined") {
  const store = new Map<string, string>();
  const storage: Storage = {
    getItem(key) { return store.get(key) ?? null; },
    setItem(key, value) { store.set(key, String(value)); },
    removeItem(key) { store.delete(key); },
    clear() { store.clear(); },
    get length() { return store.size; },
    key(index) { return [...store.keys()][index] ?? null; },
  };
  Object.defineProperty(window, "localStorage", {
    value: storage,
    writable: true,
    configurable: true,
  });
}

// ── Known console.error suppressions ─────────────────────────────────────────

const JSDOM_CANVAS_GET_CONTEXT_WARNINGS = [
  "Not implemented: HTMLCanvasElement's getContext() method",
  "Not implemented: HTMLCanvasElement.prototype.getContext",
] as const;

function matchesString(arg: unknown, needle: string): boolean {
  if (typeof arg === "string") return arg.includes(needle);
  if (
    arg &&
    typeof arg === "object" &&
    "message" in arg &&
    typeof (arg as { message?: unknown }).message === "string"
  ) {
    return (arg as { message: string }).message.includes(needle);
  }
  return false;
}

function isExpectedJsdomCanvasWarning(args: unknown[]): boolean {
  return JSDOM_CANVAS_GET_CONTEXT_WARNINGS.some((pattern) =>
    args.some((arg) => matchesString(arg, pattern)),
  );
}

// jsdom logs this message when the optional native `canvas` dependency is not
// installed. In this project that is an expected test-environment limitation,
// not a product regression, so suppress only this exact warning family.
const originalConsoleError = console.error.bind(console);

console.error = ((...args: unknown[]) => {
  if (isExpectedJsdomCanvasWarning(args)) return;
  originalConsoleError(...args);
}) as typeof console.error;

// ── Known console.warn suppressions ──────────────────────────────────────────
//
// Several tests exercise failure paths in the application that intentionally
// log [RetroOasis] warnings. These are correct, expected messages and do not
// indicate a regression. Suppressing them keeps the test output signal/noise
// ratio high so genuine warnings stand out.

const EXPECTED_WARN_PATTERNS = [
  // Lanemu desktop adapter: no-ops in jsdom / browser unit tests (expected)
  "[Lanemu] spawn() called in browser.",
  "[Lanemu] kill() called for PID:",
  "[Lanemu] exists() called in browser for path:",
  "[Lanemu] validateJava() called in browser for path:",
  "[Lanemu] ping() not supported in browser for IP:",
  // WebGPU post-processor: pipeline build failure (tested explicitly)
  "[RetroOasis] Failed to build WebGPU post-process pipeline:",
  // WebGPU post-processor: device loss path (tested explicitly)
  "[RetroOasis] WebGPU device lost",
  // MemoryMonitor: pressure callback fire (tested explicitly in emulator tests)
  "[RetroOasis] Memory pressure detected",
  // WebGPU post-processor: canvas context unavailable (jsdom environment)
  "[RetroOasis] WebGPU canvas context unavailable",
  // WebGPU post-processor: render loop frame failure (tested explicitly)
  "[RetroOasis] WebGPU post-process frame failed",
  // ThermalMonitor: elevated pressure warning (tested explicitly in emulator tests)
  "[RetroOasis] Thermal pressure elevated",
] as const;

function isExpectedWarn(args: unknown[]): boolean {
  return EXPECTED_WARN_PATTERNS.some((pattern) =>
    args.some((arg) => matchesString(arg, pattern)),
  );
}

const originalConsoleWarn = console.warn.bind(console);

console.warn = ((...args: unknown[]) => {
  if (isExpectedWarn(args)) return;
  originalConsoleWarn(...args);
}) as typeof console.warn;

// ── Pointer capture stubs ─────────────────────────────────────────────────────

// jsdom does not implement the Pointer Events capture API.  Provide no-op
// stubs so that code calling setPointerCapture/releasePointerCapture does not
// throw in the test environment.  Actual capture routing is handled by the
// browser; tests simulate it by dispatching events directly on the element.
if (typeof HTMLElement !== "undefined") {
  if (!HTMLElement.prototype.setPointerCapture) {
    HTMLElement.prototype.setPointerCapture = () => {};
  }
  if (!HTMLElement.prototype.releasePointerCapture) {
    HTMLElement.prototype.releasePointerCapture = () => {};
  }
  if (!HTMLElement.prototype.hasPointerCapture) {
    HTMLElement.prototype.hasPointerCapture = () => false;
  }
}

// ── window.matchMedia stub ────────────────────────────────────────────────────

// jsdom does not implement window.matchMedia.  Provide a minimal stub that
// returns a MediaQueryList-like object.  Tests that need to simulate portrait
// mode can override window.matchMedia via vi.stubGlobal().
if (typeof window !== "undefined" && !window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string): MediaQueryList => ({
      matches: false,
      media: query,
      onchange: null,
      addListener:    () => {},
      removeListener: () => {},
      addEventListener:    () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    } as MediaQueryList),
  });
}

// Older jsdom environments may lack PointerEvent. A lightweight MouseEvent-
// based shim is sufficient for the touch-control tests in this repo.
if (typeof globalThis !== "undefined" && typeof globalThis.PointerEvent === "undefined") {
  class PointerEventShim extends MouseEvent {
    pointerId: number;

    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
    }
  }

  Object.defineProperty(globalThis, "PointerEvent", {
    configurable: true,
    writable: true,
    value: PointerEventShim,
  });
}

// Older jsdom versions used for Vitest compatibility may not implement the
// Blob convenience readers that browser code relies on.
if (typeof Blob !== "undefined") {
  if (!Blob.prototype.arrayBuffer) {
    Blob.prototype.arrayBuffer = async function (): Promise<ArrayBuffer> {
      const reader = new FileReader();
      return await new Promise<ArrayBuffer>((resolve, reject) => {
        reader.onerror = () => reject(reader.error ?? new Error("Failed to read blob as ArrayBuffer"));
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.readAsArrayBuffer(this as Blob);
      });
    };
  }

  if (!Blob.prototype.text) {
    Blob.prototype.text = async function (): Promise<string> {
      const reader = new FileReader();
      return await new Promise<string>((resolve, reject) => {
        reader.onerror = () => reject(reader.error ?? new Error("Failed to read blob as text"));
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.readAsText(this as Blob);
      });
    };
  }

  // jsdom does not implement Blob.stream(), which browser Blobs provide and
  // which `new Response(blob)` (undici) relies on to read blob payloads. Back
  // it with arrayBuffer() so code paths that stream blobs work under test.
  if (!Blob.prototype.stream && typeof ReadableStream !== "undefined") {
    Blob.prototype.stream = function (this: Blob): ReadableStream<Uint8Array> {
      const blob = this;
      return new ReadableStream<Uint8Array>({
        async start(controller) {
          try {
            controller.enqueue(new Uint8Array(await blob.arrayBuffer()));
            controller.close();
          } catch (err) {
            controller.error(err);
          }
        },
      });
    } as typeof Blob.prototype.stream;
  }
}

// ── structuredClone: preserve jsdom Blobs (fake-indexeddb fidelity) ───────────
//
// Node's native structuredClone does not recognise jsdom's Blob implementation
// and silently clones it into an empty plain object, so fake-indexeddb loses
// Blob payloads on insertion. Tests that round-trip save-state blobs through
// IndexedDB depend on the bytes surviving, so wrap structuredClone with a
// Blob-aware deep clone that delegates every other value to the native impl.
if (typeof Blob !== "undefined" && typeof globalThis.structuredClone === "function") {
  const nativeStructuredClone = globalThis.structuredClone.bind(globalThis);

  // jsdom stores Blob bytes on a non-enumerable `[Symbol(impl)]._buffer`
  // (a Node Buffer). `instanceof Uint8Array` is unreliable across realms here,
  // so detect the view with the realm-safe `ArrayBuffer.isView`.
  const blobBytes = (blob: Blob): ArrayBufferView | null => {
    for (const sym of Object.getOwnPropertySymbols(blob)) {
      const impl = (blob as unknown as Record<symbol, { _buffer?: unknown }>)[sym];
      if (impl && ArrayBuffer.isView(impl._buffer)) return impl._buffer;
    }
    return null;
  };

  const cloneWithBlobs = (value: unknown, seen: WeakMap<object, unknown>): unknown => {
    if (value === null || typeof value !== "object") return value;
    if (value instanceof Blob) {
      const view = blobBytes(value);
      if (!view) return nativeStructuredClone(value);
      const copy = new Uint8Array(view.byteLength);
      copy.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
      return new Blob([copy as unknown as Uint8Array<ArrayBuffer>], { type: value.type });
    }
    if (seen.has(value)) return seen.get(value);
    if (Array.isArray(value)) {
      const arr: unknown[] = [];
      seen.set(value, arr);
      for (const item of value) arr.push(cloneWithBlobs(item, seen));
      return arr;
    }
    const proto: unknown = Object.getPrototypeOf(value);
    if (proto === Object.prototype || proto === null) {
      const obj: Record<string, unknown> = {};
      seen.set(value, obj);
      for (const key of Object.keys(value as Record<string, unknown>)) {
        obj[key] = cloneWithBlobs((value as Record<string, unknown>)[key], seen);
      }
      return obj;
    }
    // Dates, ArrayBuffers, typed arrays, Maps, Sets, etc. (no nested Blobs in
    // our IndexedDB records) clone correctly through the native implementation.
    return nativeStructuredClone(value);
  };

  const blobAwareClone = ((value: unknown) =>
    cloneWithBlobs(value, new WeakMap())) as typeof structuredClone;
  (blobAwareClone as unknown as { __blobAware: boolean }).__blobAware = true;
  globalThis.structuredClone = blobAwareClone;
}
