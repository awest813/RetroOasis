import { describe, expect, it, vi } from "vitest";
import { createDebugConsoleController } from "./debugConsole.js";

function makeEmulator() {
  return {
    diagnosticLog: [] as Array<{ category: string; message: string; timestamp: number }>,
    clearDiagnosticLog: vi.fn(),
    logDiagnostic: vi.fn(),
    reset: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    verboseLogging: false,
  };
}

function mountDebugConsoleDom(): void {
  document.body.innerHTML = `
    <div id="debug-console" hidden>
      <div id="debug-console-handle"></div>
      <button id="debug-console-close" type="button">Close</button>
      <button id="debug-console-clear" type="button">Clear</button>
      <div id="debug-console-log"></div>
      <input id="debug-console-input" />
    </div>
  `;
}

describe("createDebugConsoleController", () => {
  it("re-wires controls after the debug console DOM is rebuilt", () => {
    const emulator = makeEmulator();
    const controller = createDebugConsoleController({ onToggleDevOverlay: vi.fn() });

    mountDebugConsoleDom();
    controller.toggle(emulator as never);
    controller.toggle(emulator as never);

    mountDebugConsoleDom();
    controller.toggle(emulator as never);

    const clearBtn = document.getElementById("debug-console-clear") as HTMLButtonElement;
    clearBtn.click();

    expect(emulator.clearDiagnosticLog).toHaveBeenCalledTimes(1);
  });
});
