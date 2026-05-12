import { describe, it, expect } from "vitest";
import { buildButton, buildDpad, buildStick } from "./builders.js";
import { DEFAULT_LAYOUT, type TouchButtonDef } from "./layouts.js";

function button(id: string): TouchButtonDef {
  const def = DEFAULT_LAYOUT.find((b) => b.id === id);
  if (!def) throw new Error(`Button "${id}" not found`);
  return { ...def };
}

// ── buildButton ────────────────────────────────────────────────────────────

describe("buildButton", () => {
  it("returns an element with class tc-btn", () => {
    const el = buildButton(button("a"), 1);
    expect(el.className).toBe("tc-btn");
  });

  it("sets data-btn-id to the button id", () => {
    const el = buildButton(button("b"), 1);
    expect(el.dataset.btnId).toBe("b");
  });

  it("sets text content to the button label", () => {
    const def = button("a");
    const el = buildButton(def, 1);
    expect(el.textContent).toBe(def.label);
  });

  it("applies position, size, and colour CSS properties", () => {
    const def: TouchButtonDef = { id: "test", type: "button", x: 25, y: 50, size: 48, color: "red", label: "T" };
    const el = buildButton(def, 1);
    expect(el.style.left).toBe("25%");
    expect(el.style.top).toBe("50%");
    expect(el.style.width).toBe("48px");
    expect(el.style.height).toBe("48px");
    expect(el.style.background).toBe("red");
  });

  it("scales size by the scale factor", () => {
    const def: TouchButtonDef = { id: "test", type: "button", x: 0, y: 0, size: 48, color: "#000", label: "T" };
    const el = buildButton(def, 1.5);
    expect(el.style.width).toBe("72px");
    expect(el.style.height).toBe("72px");
  });

  it("negative margin centres the element at its position", () => {
    const def: TouchButtonDef = { id: "test", type: "button", x: 0, y: 0, size: 48, color: "#000", label: "T" };
    const el = buildButton(def, 1);
    expect(el.style.marginLeft).toBe("-24px");
    expect(el.style.marginTop).toBe("-24px");
  });
});

// ── buildDpad ──────────────────────────────────────────────────────────────

describe("buildDpad", () => {
  it("returns an outer element with class tc-dpad", () => {
    const { outer } = buildDpad(button("dpad"), 1);
    expect(outer.className).toBe("tc-dpad");
  });

  it("sets data-btn-id on outer", () => {
    const { outer } = buildDpad(button("dpad"), 1);
    expect(outer.dataset.btnId).toBe("dpad");
  });

  it("contains four directional arm children", () => {
    const { outer } = buildDpad(button("dpad"), 1);
    const arms = outer.querySelectorAll(".tc-dpad__arm");
    expect(arms).toHaveLength(4);
  });

  it("has up/down/left/right arm classes", () => {
    const { outer } = buildDpad(button("dpad"), 1);
    expect(outer.querySelector(".tc-dpad__arm--up")).not.toBeNull();
    expect(outer.querySelector(".tc-dpad__arm--down")).not.toBeNull();
    expect(outer.querySelector(".tc-dpad__arm--left")).not.toBeNull();
    expect(outer.querySelector(".tc-dpad__arm--right")).not.toBeNull();
  });

  it("contains a centre element", () => {
    const { outer } = buildDpad(button("dpad"), 1);
    expect(outer.querySelector(".tc-dpad__center")).not.toBeNull();
  });

  it("arms Map contains all four directions", () => {
    const { arms } = buildDpad(button("dpad"), 1);
    expect(arms.has("up")).toBe(true);
    expect(arms.has("down")).toBe(true);
    expect(arms.has("left")).toBe(true);
    expect(arms.has("right")).toBe(true);
    expect(arms.size).toBe(4);
  });

  it("each arm returns the same element stored in the map", () => {
    const { outer, arms } = buildDpad(button("dpad"), 1);
    for (const dir of ["up", "down", "left", "right"] as const) {
      expect(arms.get(dir)).toBe(outer.querySelector(`.tc-dpad__arm--${dir}`));
    }
  });

  it("applies CSS properties to outer", () => {
    const def: TouchButtonDef = { id: "dpad", type: "dpad", x: 10, y: 20, size: 80, color: "#333", label: "" };
    const { outer } = buildDpad(def, 1);
    expect(outer.style.left).toBe("10%");
    expect(outer.style.top).toBe("20%");
    expect(outer.style.width).toBe("80px");
    expect(outer.style.height).toBe("80px");
  });
});

// ── buildStick ─────────────────────────────────────────────────────────────

describe("buildStick", () => {
  const stickDef: TouchButtonDef = { id: "stick", type: "stick", x: 0, y: 0, size: 48, color: "#000", label: "" };

  it("returns an outer element with class tc-stick", () => {
    const { outer } = buildStick(stickDef, 1);
    expect(outer.className).toBe("tc-stick");
  });

  it("sets data-btn-id on outer", () => {
    const { outer } = buildStick(stickDef, 1);
    expect(outer.dataset.btnId).toBe("stick");
  });

  it("contains a knob child element", () => {
    const { outer, knob } = buildStick(stickDef, 1);
    expect(outer.querySelector(".tc-stick__knob")).toBe(knob);
  });

  it("knob size is 44% of the scaled outer size", () => {
    const def: TouchButtonDef = { id: "stick", type: "stick", x: 0, y: 0, size: 100, color: "#000", label: "" };
    const { knob } = buildStick(def, 1);
    const expected = Math.round(100 * 0.44);
    expect(knob.style.width).toBe(`${expected}px`);
    expect(knob.style.height).toBe(`${expected}px`);
  });

  it("knob scales with the scale factor", () => {
    const def: TouchButtonDef = { id: "stick", type: "stick", x: 0, y: 0, size: 100, color: "#000", label: "" };
    const { knob } = buildStick(def, 2);
    const expected = Math.round(200 * 0.44);
    expect(knob.style.width).toBe(`${expected}px`);
  });

  it("applies CSS properties to outer", () => {
    const def: TouchButtonDef = { id: "stick", type: "stick", x: 75, y: 50, size: 60, color: "#555", label: "" };
    const { outer } = buildStick(def, 1);
    expect(outer.style.left).toBe("75%");
    expect(outer.style.top).toBe("50%");
    expect(outer.style.width).toBe("60px");
    expect(outer.style.height).toBe("60px");
  });
});
