import type { PSPEmulator } from "../emulator.js";
import { trapFocus } from "./dom.js";

export function createDebugConsoleController(opts: { onToggleDevOverlay: () => void }) {
  let visible = false;
  let position: { x: number; y: number } = (() => {
    try {
      const saved = localStorage.getItem("ro_debug_console_pos");
      return saved ? (JSON.parse(saved) as { x: number; y: number }) : { x: 20, y: 80 };
    } catch {
      return { x: 20, y: 80 };
    }
  })();
  let lastLoggedEventCount = 0;
  let cleanupBindings: (() => void) | null = null;
  let modalAc: AbortController | null = null;
  let previouslyFocused: HTMLElement | null = null;
  let wiredConsoleEl: HTMLElement | null = null;

  function isBoundToCurrentDOM(): boolean {
    return wiredConsoleEl !== null && wiredConsoleEl === document.getElementById("debug-console");
  }

  function closeModal(): void {
    const consoleEl = document.getElementById("debug-console");
    modalAc?.abort();
    modalAc = null;
    visible = false;
    if (consoleEl) consoleEl.hidden = true;
    previouslyFocused?.focus();
    previouslyFocused = null;
  }

  function openModal(emulator?: PSPEmulator): void {
    const consoleEl = document.getElementById("debug-console");
    if (!consoleEl) return;

    previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    visible = true;
    consoleEl.hidden = false;
    consoleEl.style.left = `${position.x}px`;
    consoleEl.style.top = `${position.y}px`;

    if (emulator && !isBoundToCurrentDOM()) {
      wire(emulator);
    }

    modalAc = new AbortController();
    const { signal } = modalAc;
    trapFocus(consoleEl, signal);
    document.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closeModal();
      }
    }, { signal, capture: true });

    document.getElementById("debug-console-input")?.focus();
    if (emulator) update(emulator);
  }

  function toggle(emulator?: PSPEmulator): void {
    if (visible) {
      closeModal();
      return;
    }
    openModal(emulator);
  }

  function wire(emulator: PSPEmulator): void {
    cleanupBindings?.();

    const handle = document.getElementById("debug-console-handle");
    const consoleEl = document.getElementById("debug-console");
    const closeBtn = document.getElementById("debug-console-close");
    const clearBtn = document.getElementById("debug-console-clear");
    const input = document.getElementById("debug-console-input") as HTMLInputElement | null;
    const controller = new AbortController();
    const { signal } = controller;

    wiredConsoleEl = consoleEl;

    if (handle && consoleEl) {
      let isDragging = false;
      let startX = 0;
      let startY = 0;

      const onPointerDown = (e: PointerEvent) => {
        if (e.button !== 0) return;
        isDragging = true;
        startX = e.clientX - consoleEl.offsetLeft;
        startY = e.clientY - consoleEl.offsetTop;
        handle.setPointerCapture(e.pointerId);
        handle.style.cursor = "grabbing";
      };

      const onPointerMove = (e: PointerEvent) => {
        if (!isDragging) return;
        const x = e.clientX - startX;
        const y = e.clientY - startY;
        consoleEl.style.left = `${x}px`;
        consoleEl.style.top = `${y}px`;
        position = { x, y };
      };

      const onPointerUp = (e: PointerEvent) => {
        if (!isDragging) return;
        isDragging = false;
        handle.style.cursor = "grab";
        if (handle.hasPointerCapture(e.pointerId)) {
          handle.releasePointerCapture(e.pointerId);
        }
        localStorage.setItem("ro_debug_console_pos", JSON.stringify(position));
      };

      handle.addEventListener("pointerdown", onPointerDown, { signal });
      handle.addEventListener("pointermove", onPointerMove, { signal });
      handle.addEventListener("pointerup", onPointerUp, { signal });
      handle.addEventListener("pointercancel", onPointerUp, { signal });
    }

    closeBtn?.addEventListener("click", () => closeModal(), { signal });
    clearBtn?.addEventListener("click", () => {
      emulator.clearDiagnosticLog();
      const logEl = document.getElementById("debug-console-log");
      if (logEl) logEl.innerHTML = "";
      lastLoggedEventCount = 0;
    }, { signal });

    input?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const cmd = input.value.trim();
        if (cmd) {
          runCommand(cmd, emulator);
          input.value = "";
        }
      }
      e.stopPropagation();
    }, { signal });

    cleanupBindings = () => {
      controller.abort();
      wiredConsoleEl = null;
      cleanupBindings = null;
    };
  }

  function runCommand(cmd: string, emulator: PSPEmulator): void {
    const parts = cmd.toLowerCase().split(" ");
    const action = parts[0];

    emulator.logDiagnostic("system", `> ${cmd}`);

    switch (action) {
      case "help":
        emulator.logDiagnostic("system", "Available commands: help, reset, pause, resume, step, stats, log [on|off], clear, close");
        break;
      case "reset":
        emulator.reset();
        break;
      case "pause":
        emulator.pause();
        break;
      case "resume":
        emulator.resume();
        break;
      case "step":
        emulator.pause();
        setTimeout(() => emulator.resume(), 16);
        setTimeout(() => emulator.pause(), 32);
        break;
      case "stats":
        opts.onToggleDevOverlay();
        break;
      case "log":
        if (parts[1] === "on" || parts[1] === "verbose") {
          emulator.verboseLogging = true;
          emulator.logDiagnostic("system", "Verbose logging enabled.");
        } else {
          emulator.verboseLogging = false;
          emulator.logDiagnostic("system", "Verbose logging disabled.");
        }
        break;
      case "clear": {
        emulator.clearDiagnosticLog();
        const logEl = document.getElementById("debug-console-log");
        if (logEl) logEl.innerHTML = "";
        lastLoggedEventCount = 0;
        break;
      }
      case "close":
        closeModal();
        break;
      default:
        emulator.logDiagnostic("error", `Unknown command: ${cmd}`);
        break;
    }

    update(emulator);
  }

  function update(emulator: PSPEmulator): void {
    const logEl = document.getElementById("debug-console-log");
    if (!logEl) return;

    const logs = emulator.diagnosticLog;
    if (logs.length === lastLoggedEventCount) return;

    const fragment = document.createDocumentFragment();
    for (const event of logs.slice(lastLoggedEventCount)) {
      const row = document.createElement("div");
      row.className = `debug-console-entry debug-console-entry--${event.category}`;
      const ts = new Date(event.timestamp).toLocaleTimeString();
      row.textContent = `[${ts}] ${event.message}`;
      fragment.appendChild(row);
    }
    logEl.appendChild(fragment);
    logEl.scrollTop = logEl.scrollHeight;
    lastLoggedEventCount = logs.length;
  }

  return { toggle, update };
}
