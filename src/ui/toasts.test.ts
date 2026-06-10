import { describe, it, expect, beforeEach } from "vitest";
import { showInfoToast } from "./toasts.js";

describe("showInfoToast", () => {
  beforeEach(() => {
    document.getElementById("toast-stack")?.remove();
    document.getElementById("info-toast")?.remove();
  });

  it("replaces the previous toast by default", () => {
    showInfoToast("First message");
    showInfoToast("Second message");
    const toasts = document.querySelectorAll(".info-toast");
    expect(toasts.length).toBe(1);
    expect(document.getElementById("info-toast")?.textContent).toContain("Second message");
  });

  it("stacks toasts when queue option is set", () => {
    showInfoToast("Compatibility note", "warning", { queue: true });
    showInfoToast("Save sync updated", "success", { queue: true });
    const toasts = document.querySelectorAll(".info-toast");
    expect(toasts.length).toBe(2);
    expect(toasts[0]?.textContent).toContain("Compatibility note");
    expect(toasts[1]?.textContent).toContain("Save sync updated");
  });
});
