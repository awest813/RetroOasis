export function setLoadingProgress(percent: number | null): void {
  const container = document.getElementById("loading-progress-container");
  const bar = document.getElementById("loading-progress-bar");
  if (!container || !bar) return;
  if (percent === null) {
    container.hidden = true;
  } else {
    container.hidden = false;
    bar.style.width = `${Math.min(100, Math.max(0, percent))}%`;
  }
}

export function showLoadingOverlay(): void {
  const overlay = document.getElementById("loading-overlay");
  overlay?.classList.add("visible");
  overlay?.setAttribute("aria-hidden", "false");
}

export function hideLoadingOverlay(): void {
  const overlay = document.getElementById("loading-overlay");
  overlay?.classList.remove("visible");
  overlay?.setAttribute("aria-hidden", "true");
  setLoadingProgress(null);
  const sub = document.getElementById("loading-subtitle");
  if (sub) {
    sub.textContent = "";
    sub.setAttribute("hidden", "true");
  }
}

export function setLoadingMessage(msg: string): void {
  const e = document.getElementById("loading-message");
  if (e) e.textContent = msg;
}

export function setLoadingSubtitle(msg: string, opts?: { append?: boolean }): void {
  const e = document.getElementById("loading-subtitle");
  if (!e) return;
  const trimmed = msg.trim();
  if (opts?.append && trimmed) {
    const existing = e.textContent?.trim() ?? "";
    if (existing && !existing.includes(trimmed)) {
      e.textContent = `${existing} · ${trimmed}`;
    } else if (!existing) {
      e.textContent = trimmed;
    }
  } else {
    e.textContent = msg;
  }
  const visible = (e.textContent?.trim() ?? "").length > 0;
  if (visible) e.removeAttribute("hidden");
  else e.setAttribute("hidden", "true");
}
