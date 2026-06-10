import { ICON_CLOSE_X_SVG, INFO_TOAST_ICON_HTML } from "../chromeIcons.js";

const ERROR_DISMISS_TIMEOUT_MS = 12_000;
let _errorDismissTimer: ReturnType<typeof setTimeout> | null = null;

const TOAST_DISMISS_TIMEOUT_MS = 5_000;
const TOAST_REMOVE_DELAY_MS = 400;
const TOAST_STACK_MAX = 3;
let _toastDismissTimer: ReturnType<typeof setTimeout> | null = null;

export interface InfoToastOptions {
  /** When true, stack with existing toasts instead of replacing them. */
  queue?: boolean;
}

let _openSettingsFn: ((tab?: string) => void) | null = null;

export function setErrorBannerSettingsOpener(fn: ((tab?: string) => void) | null): void {
  _openSettingsFn = fn;
}

function _clearErrorDismissTimer(): void {
  if (_errorDismissTimer !== null) {
    clearTimeout(_errorDismissTimer);
    _errorDismissTimer = null;
  }
}

function _scheduleErrorDismiss(): void {
  _clearErrorDismissTimer();
  _errorDismissTimer = setTimeout(() => {
    hideError();
    _errorDismissTimer = null;
  }, ERROR_DISMISS_TIMEOUT_MS);
}

function _clearToastDismissTimer(): void {
  if (_toastDismissTimer !== null) {
    clearTimeout(_toastDismissTimer);
    _toastDismissTimer = null;
  }
}

function friendlyErrorMessage(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("sharedarraybuffer") || m.includes("cross-origin isolated")) {
    return "PSP games need a special browser feature (SharedArrayBuffer) that isn't available here.\n\nTry opening the page from the correct URL, or use a browser that supports HTTPS.";
  }
  if (m.includes("webassembly") || m.includes("wasm")) {
    return "Your browser doesn't support WebAssembly, which is required to run games.\n\nTry Chrome 90+, Firefox 90+, or Safari 15+.";
  }
  if (m.includes("not found in library") || m.includes("game file not found")) {
    return "Game file not found. The file may have been deleted from this browser.\n\nTry adding the game again from your device.";
  }
  if (m.includes("quota") || m.includes("storage") || m.includes("no space")) {
    return "Not enough storage space to save this game. Try clearing some old games or saves in Settings → My Games.";
  }
  if (m.includes("network") || m.includes("fetch") || m.includes("failed to load")) {
    return "Couldn't load a required file. Check your internet connection and try again.";
  }
  if ((m.includes("dreamcast") || m.includes("flycast")) && (m.includes("experimental") || m.includes("stabil"))) {
    return "Dreamcast support is experimental right now. Some games may boot slowly, show glitches, or crash.\n\nFlycast uses HLE BIOS by default, so dc_boot.bin and dc_flash.bin are optional compatibility files. If one title fails, try another title or lower the load on your device.";
  }
  if (m.includes("bios") || m.includes("startup file")) {
    return "This game needs a startup file (BIOS). Go to Settings → System Files to add one.";
  }
  return msg;
}

export function showError(msg: string, onRetry?: () => void): void {
  const banner = document.getElementById("error-banner");
  const msgEl  = document.getElementById("error-message");
  if (!banner || !msgEl) return;
  msgEl.textContent = "";

  const displayMsg = friendlyErrorMessage(msg);

  const lines = displayMsg.split("\n");
  lines.forEach((line, i) => {
    if (i > 0) msgEl.appendChild(document.createElement("br"));
    msgEl.appendChild(document.createTextNode(line));
  });

  const isBiosError = msg.toLowerCase().includes("bios") || msg.toLowerCase().includes("startup file");
  if (isBiosError && _openSettingsFn) {
    const actionBtn = document.createElement("button");
    actionBtn.className = "error-action-btn";
    actionBtn.textContent = "Open System Files";
    actionBtn.addEventListener("click", () => {
      hideError();
      _openSettingsFn!("bios");
    });
    msgEl.appendChild(document.createElement("br"));
    msgEl.appendChild(actionBtn);
  }

  if (onRetry) {
    const retryBtn = document.createElement("button");
    retryBtn.className = "error-action-btn error-retry-btn";
    retryBtn.textContent = "Retry";
    retryBtn.addEventListener("click", () => {
      hideError();
      onRetry();
    });
    msgEl.appendChild(document.createElement("br"));
    msgEl.appendChild(retryBtn);
  }

  banner.classList.add("visible");
  const firstAction =
    msgEl.querySelector<HTMLButtonElement>(".error-action-btn") ??
    document.getElementById("error-close") as HTMLButtonElement | null;
  requestAnimationFrame(() => {
    (firstAction ?? banner).focus();
  });

  const pauseDismiss = () => _clearErrorDismissTimer();
  const resumeDismiss = () => {
    const active = document.activeElement;
    if (active instanceof Node && banner.contains(active)) return;
    _scheduleErrorDismiss();
  };

  banner.onmouseenter = pauseDismiss;
  banner.onmouseleave = resumeDismiss;
  (banner as HTMLElement & { onfocusin: ((this: GlobalEventHandlers, ev: FocusEvent) => unknown) | null }).onfocusin = pauseDismiss;
  (banner as HTMLElement & { onfocusout: ((this: GlobalEventHandlers, ev: FocusEvent) => unknown) | null }).onfocusout = () => setTimeout(resumeDismiss, 0);
  banner.onkeydown = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    e.preventDefault();
    hideError();
  };

  _scheduleErrorDismiss();
}

export function hideError(): void {
  _clearErrorDismissTimer();
  const banner = document.getElementById("error-banner");
  if (!banner) return;
  banner.classList.remove("visible");
  banner.onmouseenter = null;
  banner.onmouseleave = null;
  (banner as HTMLElement & { onfocusin: ((this: GlobalEventHandlers, ev: FocusEvent) => unknown) | null }).onfocusin = null;
  (banner as HTMLElement & { onfocusout: ((this: GlobalEventHandlers, ev: FocusEvent) => unknown) | null }).onfocusout = null;
  banner.onkeydown = null;
}

function ensureToastStack(): HTMLElement {
  let stack = document.getElementById("toast-stack");
  if (!stack) {
    stack = document.createElement("div");
    stack.id = "toast-stack";
    stack.className = "toast-stack";
    stack.setAttribute("aria-live", "polite");
    document.body.appendChild(stack);
  }
  return stack;
}

function repositionToastStack(): void {
  const stack = document.getElementById("toast-stack");
  if (!stack) return;
  const toasts = [...stack.querySelectorAll<HTMLElement>(".info-toast")];
  toasts.forEach((toast, index) => {
    toast.style.setProperty("--toast-stack-index", String(index));
    if (index === toasts.length - 1) toast.id = "info-toast";
    else toast.removeAttribute("id");
  });
}

export function showInfoToast(
  msg: string,
  type: "success" | "info" | "warning" | "error" = "success",
  opts?: InfoToastOptions,
): void {
  const stack = ensureToastStack();
  if (!opts?.queue) {
    stack.querySelectorAll(".info-toast").forEach((node) => node.remove());
    _clearToastDismissTimer();
  } else {
    const queued = stack.querySelectorAll(".info-toast");
    if (queued.length >= TOAST_STACK_MAX) {
      queued[0]?.remove();
    }
    document.getElementById("info-toast")?.removeAttribute("id");
  }

  const toast = document.createElement("div");
  toast.id = "info-toast";
  toast.className = `info-toast info-toast--${type}`;
  toast.setAttribute("role", type === "error" ? "alert" : "status");
  toast.setAttribute("aria-live", type === "error" ? "assertive" : "polite");
  toast.setAttribute("aria-atomic", "true");

  const icon = document.createElement("span");
  icon.className = "info-toast__icon";
  icon.setAttribute("aria-hidden", "true");
  icon.innerHTML = INFO_TOAST_ICON_HTML[type] ?? INFO_TOAST_ICON_HTML.success;

  const text = document.createElement("span");
  text.className = "info-toast__msg";
  text.textContent = msg;

  const closeBtn = document.createElement("button");
  closeBtn.className = "error-close";
  closeBtn.innerHTML = ICON_CLOSE_X_SVG;
  closeBtn.setAttribute("aria-label", "Dismiss");
  closeBtn.addEventListener("click", () => {
    toast.classList.remove("visible");
    setTimeout(() => toast.remove(), TOAST_REMOVE_DELAY_MS);
    _clearToastDismissTimer();
  });

  toast.append(icon, text, closeBtn);
  stack.appendChild(toast);
  repositionToastStack();

  requestAnimationFrame(() => toast.classList.add("visible"));

  const dismissToast = () => {
    if (toast.parentElement) {
      toast.classList.remove("visible");
      setTimeout(() => {
        toast.remove();
        repositionToastStack();
        const remaining = document.querySelectorAll("#toast-stack .info-toast");
        if (!remaining.length) document.getElementById("toast-stack")?.remove();
      }, TOAST_REMOVE_DELAY_MS);
    }
    _clearToastDismissTimer();
  };
  const scheduleToastDismiss = () => {
    _clearToastDismissTimer();
    _toastDismissTimer = setTimeout(dismissToast, TOAST_DISMISS_TIMEOUT_MS);
  };
  const pauseToastDismiss = () => _clearToastDismissTimer();
  const resumeToastDismiss = () => {
    const active = document.activeElement;
    if (active instanceof Node && toast.contains(active)) return;
    scheduleToastDismiss();
  };

  toast.addEventListener("mouseenter", pauseToastDismiss);
  toast.addEventListener("mouseleave", resumeToastDismiss);
  toast.addEventListener("focusin", pauseToastDismiss as EventListener);
  toast.addEventListener("focusout", (() => setTimeout(resumeToastDismiss, 0)) as EventListener);

  scheduleToastDismiss();
}
