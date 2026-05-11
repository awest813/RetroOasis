import type { TouchButtonDef } from "./layouts.js";

function styledElement(tag: string, className: string, btn: TouchButtonDef, scaled: number): HTMLElement {
  const el = document.createElement(tag);
  el.className = className;
  el.dataset.btnId = btn.id;
  el.style.cssText = [
    `left:${btn.x}%`,
    `top:${btn.y}%`,
    `width:${scaled}px`,
    `height:${scaled}px`,
    `margin-left:-${scaled / 2}px`,
    `margin-top:-${scaled / 2}px`,
    `background:${btn.color}`,
  ].join(";");
  return el;
}

export function buildButton(btn: TouchButtonDef, scale: number): HTMLElement {
  const scaled = Math.round(btn.size * scale);
  const el = styledElement("div", "tc-btn", btn, scaled);
  el.textContent = btn.label;
  return el;
}

export function buildDpad(btn: TouchButtonDef, scale: number): { outer: HTMLElement; arms: Map<string, HTMLElement> } {
  const scaled = Math.round(btn.size * scale);
  const outer = styledElement("div", "tc-dpad", btn, scaled);
  const armDirs: { id: "up" | "down" | "left" | "right"; label: string }[] = [
    { id: "up",    label: "\u25B2" },
    { id: "down",  label: "\u25BC" },
    { id: "left",  label: "\u25C0" },
    { id: "right", label: "\u25B6" },
  ];
  const arms = new Map<string, HTMLElement>();
  for (const { id, label } of armDirs) {
    const arm = document.createElement("div");
    arm.className = `tc-dpad__arm tc-dpad__arm--${id}`;
    arm.textContent = label;
    arm.style.background = btn.color;
    outer.appendChild(arm);
    arms.set(id, arm);
  }
  const center = document.createElement("div");
  center.className = "tc-dpad__center";
  center.style.background = btn.color;
  outer.appendChild(center);
  return { outer, arms };
}

export function buildStick(btn: TouchButtonDef, scale: number): { outer: HTMLElement; knob: HTMLElement } {
  const scaled = Math.round(btn.size * scale);
  const outer = styledElement("div", "tc-stick", btn, scaled);
  const knobSize = Math.round(scaled * 0.44);
  const knob = document.createElement("div");
  knob.className = "tc-stick__knob";
  knob.style.cssText = `width:${knobSize}px;height:${knobSize}px;`;
  outer.appendChild(knob);
  return { outer, knob };
}
