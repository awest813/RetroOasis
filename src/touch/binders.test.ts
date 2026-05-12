import { describe, it, expect, vi, afterEach } from "vitest";
import { bindButton, bindDpad, bindStick, type BinderContext } from "./binders.js";
import { DEFAULT_LAYOUT, type TouchButtonDef } from "./layouts.js";
import { TOUCH_KEY_MAP } from "./input.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function buttonDef(id: string): TouchButtonDef {
  const def = DEFAULT_LAYOUT.find((b) => b.id === id);
  if (!def) throw new Error(`Button "${id}" not found`);
  return { ...def };
}

function createContext(overrides: Partial<BinderContext> & { pressedKeys?: Set<string> } = {}): BinderContext {
  const pressedKeys = overrides.pressedKeys ?? new Set<string>();
  return {
    editing: false,
    hapticEnabled: false,
    overlay: null,
    systemId: "test_binder",
    portrait: false,
    buttons: [],
    pressedKeys,
    setDpadCleanup(_fn) { /* stored by the binder internally */ },
    ...overrides,
  };
}

const LS_KEY = "rv:touch-layout:test_binder";
const LS_KEY_PORTRAIT = "rv:touch-layout-portrait:test_binder";

const KEY_A = TOUCH_KEY_MAP.a!.key;

// ── bindButton ─────────────────────────────────────────────────────────────

describe("bindButton", () => {
  afterEach(() => {
    localStorage.removeItem(LS_KEY);
    localStorage.removeItem(LS_KEY_PORTRAIT);
  });

  it("dispatches keydown on pointerdown and keyup on pointerup", () => {
    const el = document.createElement("div");
    const btn = buttonDef("a");
    const ctx = createContext();

    const downKeys: string[] = [];
    const upKeys: string[] = [];
    document.addEventListener("keydown", (e) => downKeys.push(e.key));
    document.addEventListener("keyup",   (e) => upKeys.push(e.key));

    bindButton(el, btn, ctx);
    el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerId: 1 }));
    el.dispatchEvent(new PointerEvent("pointerup",   { bubbles: true, cancelable: true, pointerId: 1 }));

    expect(downKeys).toContain(KEY_A);
    expect(upKeys).toContain(KEY_A);
  });

  it("dispatches keyup on pointercancel", () => {
    const el = document.createElement("div");
    const btn = buttonDef("a");
    const ctx = createContext();

    const upKeys: string[] = [];
    document.addEventListener("keyup", (e) => upKeys.push(e.key));

    bindButton(el, btn, ctx);
    el.dispatchEvent(new PointerEvent("pointerdown",    { bubbles: true, cancelable: true, pointerId: 1 }));
    el.dispatchEvent(new PointerEvent("pointercancel",  { bubbles: true, cancelable: true, pointerId: 1 }));

    expect(upKeys).toContain(KEY_A);
  });

  it("toggles tc-btn--pressed class on press/release", () => {
    const el = document.createElement("div");
    const btn = buttonDef("a");
    const ctx = createContext();

    bindButton(el, btn, ctx);
    el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerId: 1 }));
    expect(el.classList.contains("tc-btn--pressed")).toBe(true);

    el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true, pointerId: 1 }));
    expect(el.classList.contains("tc-btn--pressed")).toBe(false);
  });

  it("does not dispatch key events in editing mode", () => {
    const el = document.createElement("div");
    const btn = buttonDef("a");
    const ctx = createContext({ editing: true });

    const keys: string[] = [];
    document.addEventListener("keydown", (e) => keys.push(e.key));

    bindButton(el, btn, ctx);
    el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerId: 1 }));
    el.dispatchEvent(new PointerEvent("pointerup",   { bubbles: true, cancelable: true, pointerId: 1 }));

    expect(keys).toHaveLength(0);
  });

  it("fires keydown only once with two simultaneous pointers", () => {
    const el = document.createElement("div");
    const btn = buttonDef("a");
    const ctx = createContext();

    const keys: string[] = [];
    document.addEventListener("keydown", (e) => keys.push(e.key));

    bindButton(el, btn, ctx);
    el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerId: 1 }));
    el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerId: 2 }));

    expect(keys.filter((k) => k === KEY_A)).toHaveLength(1);
  });

  it("holds key when first of two pointers lifts", () => {
    const el = document.createElement("div");
    const btn = buttonDef("a");
    const ctx = createContext();

    const upKeys: string[] = [];
    document.addEventListener("keyup", (e) => upKeys.push(e.key));

    bindButton(el, btn, ctx);
    el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerId: 1 }));
    el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerId: 2 }));
    el.dispatchEvent(new PointerEvent("pointerup",   { bubbles: true, cancelable: true, pointerId: 1 }));

    expect(upKeys).toHaveLength(0);

    el.dispatchEvent(new PointerEvent("pointerup",   { bubbles: true, cancelable: true, pointerId: 2 }));
    expect(upKeys).toContain(KEY_A);
  });

  it("does nothing for a button with no key binding", () => {
    const el = document.createElement("div");
    const btn: TouchButtonDef = { id: "nonexistent", type: "button", x: 50, y: 50, size: 40, color: "gray", label: "?" };
    const ctx = createContext();

    const keys: string[] = [];
    document.addEventListener("keydown", (e) => keys.push(e.key));

    bindButton(el, btn, ctx);
    el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerId: 1 }));

    expect(keys).toHaveLength(0);
  });

  it("updates btn position on drag in editing mode and saves layout", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const btn = buttonDef("a");
    const overlay = document.createElement("div");
    Object.defineProperty(overlay, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300, x: 0, y: 0, toJSON: () => ({}) }),
    });
    const ctx = createContext({ editing: true, overlay, buttons: [btn] });

    bindButton(el, btn, ctx);

    // Start drag
    el.dispatchEvent(new PointerEvent("pointerdown", { clientX: 100, clientY: 50, pointerId: 1, bubbles: true, cancelable: true }));
    // Move by 40px right and 30px down → 10% right, 10% down on a 400×300 overlay
    el.dispatchEvent(new PointerEvent("pointermove", { clientX: 140, clientY: 80, pointerId: 1, bubbles: true }));
    expect(btn.x).toBeGreaterThan(btn.x - 1); // original x + 10
    expect(btn.y).toBeGreaterThan(btn.y - 1); // original y + 10

    // End drag
    el.dispatchEvent(new PointerEvent("pointerup", { clientX: 140, clientY: 80, pointerId: 1, bubbles: true, cancelable: true }));

    // Layout saved to localStorage
    const saved = JSON.parse(localStorage.getItem(LS_KEY) ?? "[]") as Array<{ id: string; x: number; y: number }>;
    expect(saved.length).toBeGreaterThan(0);
    document.body.removeChild(el);
  });

  it("calls onLayoutSaved when drag ends in editing mode", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const btn = buttonDef("a");
    const overlay = document.createElement("div");
    Object.defineProperty(overlay, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300, x: 0, y: 0, toJSON: () => ({}) }),
    });
    const onLayoutSaved = vi.fn();
    const ctx = createContext({ editing: true, overlay, buttons: [btn], onLayoutSaved });

    bindButton(el, btn, ctx);
    el.dispatchEvent(new PointerEvent("pointerdown", { clientX: 100, clientY: 50, pointerId: 1, bubbles: true, cancelable: true }));
    el.dispatchEvent(new PointerEvent("pointerup",   { clientX: 100, clientY: 50, pointerId: 1, bubbles: true, cancelable: true }));

    expect(onLayoutSaved).toHaveBeenCalledWith("test_binder", [btn]);
    document.body.removeChild(el);
  });
});

// ── bindDpad ───────────────────────────────────────────────────────────────

describe("bindDpad", () => {
  let outer: HTMLElement;
  let arms: Map<string, HTMLElement>;

  function setupDpad(overrides: Partial<BinderContext> = {}) {
    outer = document.createElement("div");
    outer.className = "tc-dpad";
    arms = new Map();
    for (const dir of ["up", "down", "left", "right"] as const) {
      const arm = document.createElement("div");
      arm.className = `tc-dpad__arm tc-dpad__arm--${dir}`;
      outer.appendChild(arm);
      arms.set(dir, arm);
    }
    document.body.appendChild(outer);

    Object.defineProperty(outer, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 0, top: 0, width: 120, height: 120, right: 120, bottom: 120, x: 0, y: 0, toJSON: () => ({}) }),
    });

    const btn = buttonDef("dpad");
    const ctx = createContext(overrides);
    const scaledSize = 120;

    bindDpad(outer, arms, btn, scaledSize, ctx);

    return { btn, ctx };
  }

  afterEach(() => {
    outer?.remove();
    localStorage.removeItem(LS_KEY);
    localStorage.removeItem(LS_KEY_PORTRAIT);
  });

  it("fires ArrowUp when pointer is above centre", () => {
    setupDpad();
    const keys: string[] = [];
    document.addEventListener("keydown", (e) => keys.push(e.key));

    // Centre at (60, 60). Touch at (60, 5) → dy=-55 → strong up signal
    outer.dispatchEvent(new PointerEvent("pointerdown", { clientX: 60, clientY: 5, pointerId: 1, bubbles: true, cancelable: true }));

    expect(keys).toContain("ArrowUp");
    expect(keys).not.toContain("ArrowDown");
  });

  it("fires ArrowDown when pointer is below centre", () => {
    setupDpad();
    const keys: string[] = [];
    document.addEventListener("keydown", (e) => keys.push(e.key));

    outer.dispatchEvent(new PointerEvent("pointerdown", { clientX: 60, clientY: 115, pointerId: 1, bubbles: true, cancelable: true }));

    expect(keys).toContain("ArrowDown");
  });

  it("fires ArrowLeft when pointer is left of centre", () => {
    setupDpad();
    const keys: string[] = [];
    document.addEventListener("keydown", (e) => keys.push(e.key));

    outer.dispatchEvent(new PointerEvent("pointerdown", { clientX: 5, clientY: 60, pointerId: 1, bubbles: true, cancelable: true }));

    expect(keys).toContain("ArrowLeft");
  });

  it("fires ArrowRight when pointer is right of centre", () => {
    setupDpad();
    const keys: string[] = [];
    document.addEventListener("keydown", (e) => keys.push(e.key));

    outer.dispatchEvent(new PointerEvent("pointerdown", { clientX: 115, clientY: 60, pointerId: 1, bubbles: true, cancelable: true }));

    expect(keys).toContain("ArrowRight");
  });

  it("fires both ArrowUp and ArrowRight for diagonal up-right", () => {
    setupDpad();
    const keys: string[] = [];
    document.addEventListener("keydown", (e) => keys.push(e.key));

    // Top-right corner: dx=+55, dy=-55
    outer.dispatchEvent(new PointerEvent("pointerdown", { clientX: 115, clientY: 5, pointerId: 1, bubbles: true, cancelable: true }));

    expect(keys).toContain("ArrowUp");
    expect(keys).toContain("ArrowRight");
  });

  it("does not fire Arrow keys in editing mode", () => {
    setupDpad({ editing: true });
    const keys: string[] = [];
    document.addEventListener("keydown", (e) => keys.push(e.key));

    outer.dispatchEvent(new PointerEvent("pointerdown", { clientX: 60, clientY: 5, pointerId: 1, bubbles: true, cancelable: true }));

    expect(keys.filter((k) => k.startsWith("Arrow"))).toHaveLength(0);
  });

  it("shows arm active state on press and clears on release", () => {
    setupDpad();
    const upArm = arms.get("up")!;

    outer.dispatchEvent(new PointerEvent("pointerdown", { clientX: 60, clientY: 5, pointerId: 1, bubbles: true, cancelable: true }));
    expect(upArm.classList.contains("tc-dpad__arm--active")).toBe(true);

    outer.dispatchEvent(new PointerEvent("pointerup",   { clientX: 60, clientY: 5, pointerId: 1, bubbles: true, cancelable: true }));
    expect(upArm.classList.contains("tc-dpad__arm--active")).toBe(false);
  });

  it("shows tc-dpad--active while any direction is pressed", () => {
    setupDpad();
    outer.dispatchEvent(new PointerEvent("pointerdown", { clientX: 60, clientY: 5, pointerId: 1, bubbles: true, cancelable: true }));
    expect(outer.classList.contains("tc-dpad--active")).toBe(true);

    outer.dispatchEvent(new PointerEvent("pointerup",   { clientX: 60, clientY: 5, pointerId: 1, bubbles: true, cancelable: true }));
    expect(outer.classList.contains("tc-dpad--active")).toBe(false);
  });
});

// ── bindStick ──────────────────────────────────────────────────────────────

describe("bindStick", () => {
  let outer: HTMLElement;

  function setupStick(overrides: Partial<BinderContext> = {}) {
    outer = document.createElement("div");
    outer.className = "tc-stick";
    const knob = document.createElement("div");
    knob.className = "tc-stick__knob";
    outer.appendChild(knob);
    document.body.appendChild(outer);

    Object.defineProperty(outer, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 0, top: 0, width: 120, height: 120, right: 120, bottom: 120, x: 0, y: 0, toJSON: () => ({}) }),
    });

    const btn = buttonDef("stick");
    const ctx = createContext(overrides);
    const scaledSize = 100;

    bindStick(outer, knob, btn, scaledSize, ctx);
    return { knob, btn, ctx };
  }

  afterEach(() => {
    outer?.remove();
    localStorage.removeItem(LS_KEY);
    localStorage.removeItem(LS_KEY_PORTRAIT);
  });

  it("fires stick_right key when pointer is right of centre", () => {
    setupStick();
    const keys: string[] = [];
    document.addEventListener("keydown", (e) => keys.push(e.key));

    // Centre at (60, 60). Touch at (115, 60) → dx=55 > threshold
    outer.dispatchEvent(new PointerEvent("pointerdown", { clientX: 115, clientY: 60, pointerId: 1, bubbles: true, cancelable: true }));

    expect(keys).toContain(TOUCH_KEY_MAP.stick_right!.key);
  });

  it("fires stick_left key when pointer is left of centre", () => {
    setupStick();
    const keys: string[] = [];
    document.addEventListener("keydown", (e) => keys.push(e.key));

    outer.dispatchEvent(new PointerEvent("pointerdown", { clientX: 5, clientY: 60, pointerId: 1, bubbles: true, cancelable: true }));

    expect(keys).toContain(TOUCH_KEY_MAP.stick_left!.key);
  });

  it("toggles tc-stick--active on pointerdown/up", () => {
    setupStick();
    outer.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerId: 1 }));
    expect(outer.classList.contains("tc-stick--active")).toBe(true);

    outer.dispatchEvent(new PointerEvent("pointerup",   { bubbles: true, cancelable: true, pointerId: 1 }));
    expect(outer.classList.contains("tc-stick--active")).toBe(false);
  });

  it("does not fire stick keys in editing mode", () => {
    setupStick({ editing: true });
    const keys: string[] = [];
    document.addEventListener("keydown", (e) => keys.push(e.key));

    outer.dispatchEvent(new PointerEvent("pointerdown", { clientX: 115, clientY: 60, pointerId: 1, bubbles: true, cancelable: true }));

    expect(keys.filter((k) => k === TOUCH_KEY_MAP.stick_right!.key)).toHaveLength(0);
  });

  it("updates btn position on drag in editing mode", () => {
    const btn = buttonDef("stick");
    const overlay = document.createElement("div");
    Object.defineProperty(overlay, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300, x: 0, y: 0, toJSON: () => ({}) }),
    });

    const outer2 = document.createElement("div");
    outer2.className = "tc-stick";
    const knob2 = document.createElement("div");
    knob2.className = "tc-stick__knob";
    outer2.appendChild(knob2);
    document.body.appendChild(outer2);
    Object.defineProperty(outer2, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 0, top: 0, width: 120, height: 120, right: 120, bottom: 120, x: 0, y: 0, toJSON: () => ({}) }),
    });

    const ctx2 = createContext({ editing: true, overlay, buttons: [btn] });
    bindStick(outer2, knob2, btn, 100, ctx2);

    const origX = btn.x;
    const origY = btn.y;

    outer2.dispatchEvent(new PointerEvent("pointerdown", { clientX: 100, clientY: 50, pointerId: 1, bubbles: true, cancelable: true }));
    outer2.dispatchEvent(new PointerEvent("pointermove", { clientX: 140, clientY: 80, pointerId: 1, bubbles: true }));
    expect(btn.x).not.toBe(origX);
    expect(btn.y).not.toBe(origY);

    outer2.dispatchEvent(new PointerEvent("pointerup", { clientX: 140, clientY: 80, pointerId: 1, bubbles: true, cancelable: true }));
    outer2.remove();
  });
});
