import { EasyNetplayManager } from "../netplay/EasyNetplayManager.js";
import type { EasyNetplayRoom } from "../netplay/netplayTypes.js";
import { createElement as make } from "./dom.js";

let easyNetplayManager: EasyNetplayManager | null = null;
let pagehideLeaveWired = false;

function wirePagehideLeave(manager: EasyNetplayManager): void {
  if (pagehideLeaveWired || typeof window === "undefined") return;
  pagehideLeaveWired = true;
  window.addEventListener("pagehide", () => {
    if (manager.hasActiveSession()) {
      void manager.leaveRoom().catch(() => {});
    }
  });
}

export function getEasyNetplayManager(serverUrl?: string): EasyNetplayManager {
  if (!easyNetplayManager) {
    easyNetplayManager = new EasyNetplayManager(serverUrl);
    wirePagehideLeave(easyNetplayManager);
  } else if (serverUrl !== undefined) {
    easyNetplayManager.setServerUrl(serverUrl);
  }
  return easyNetplayManager;
}

export function renderEasyDiagnosticEntry(
  level: "info" | "warning" | "error",
  message: string,
  detail?: string,
): HTMLElement {
  const cls = `enp-diag enp-diag--${level === "error" ? "error" : level === "warning" ? "warn" : "info"}`;
  if (!detail) return make("p", { class: cls }, message);

  const wrap = make("div", { class: "enp-diag-wrap" });
  wrap.appendChild(make("p", { class: cls }, message));
  const info = make("details", { class: "enp-diag-detail" }) as HTMLDetailsElement;
  info.appendChild(make("summary", {}, "Technical details"));
  info.appendChild(make("pre", { class: "enp-diag-detail__text" }, detail));
  wrap.appendChild(info);
  return wrap;
}

export function renderRoomCard(
  container: HTMLElement,
  room: EasyNetplayRoom,
  opts: {
    easyMgr?: EasyNetplayManager;
    isHost?: boolean;
    showLeaveBtn?: boolean;
    showToast(message: string): void;
  },
): void {
  const isHost = opts.isHost ?? true;
  
  if (isHost) {
    const pulseWrap = make("div", { class: "enp-waiting-pulse" });
    const circle = make("div", { class: "enp-pulse-circle" });
    circle.innerHTML = `<svg viewBox="0 0 48 48" width="60" height="60" fill="none" aria-hidden="true"><path d="M8 28c4-8 9.5-12 16-12s12 4 16 12c-4 8-9.5 12-16 12S12 36 8 28Z" stroke="currentColor" stroke-width="2.6"/><path d="M15 27h8M19 23v8" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="30.5" cy="27" r="2" fill="currentColor"/><circle cx="36" cy="27" r="2" fill="currentColor"/></svg>`;
    
    if (room.isLocal) {
      pulseWrap.appendChild(make(
        "p",
        { class: "enp-help enp-server-warn", role: "note" },
        "Local-only room — set a Play Together server in Settings to invite friends online.",
      ));
    }

    const codeLabel = make("p", { class: "enp-help" }, "Share this code with your friend:");
    const codeLarge = make("div", { class: "enp-invite-code-large", title: "Click to copy" }, room.code);
    codeLarge.addEventListener("click", () => {
      void navigator.clipboard?.writeText(room.code);
      opts.showToast("Invite code copied!");
    });

    const infoText = make("p", { class: "enp-room-card__game" }, `Hosting ${room.gameName || "Game"}`);
    const waitingText = make("p", { class: "enp-active-room__waiting" }, "⏳ Waiting for another player…");

    pulseWrap.append(circle, codeLabel, codeLarge, infoText, waitingText);

    if (opts.showLeaveBtn && opts.easyMgr) {
      const btnLeave = make("button", { class: "btn btn--danger enp-leave-btn", style: "margin-top: 20px" }, "Close Room") as HTMLButtonElement;
      btnLeave.addEventListener("click", async () => {
        await opts.easyMgr!.leaveRoom();
        container.innerHTML = "";
      });
      pulseWrap.appendChild(btnLeave);
    }
    container.appendChild(pulseWrap);
    return;
  }

  const connectedWrap = make("div", { class: "enp-connected-card" });
  
  const header = make("div", { class: "enp-connected-card__header" });
  header.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="enp-connected-icon"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
  header.appendChild(make("h3", { class: "enp-connected-card__title" }, "Connected!"));
  
  const infoText = make("p", { class: "enp-room-card__game" }, `Playing ${room.gameName || "Game"}`);
  const hostText = make("p", { class: "enp-room-card__host" }, `Host: ${room.hostName || "Anonymous"}`);
  
  connectedWrap.append(header, infoText, hostText);

  if (opts.showLeaveBtn && opts.easyMgr) {
    const btnLeave = make("button", { class: "btn btn--danger enp-leave-btn", style: "margin-top: 20px" }, "Disconnect") as HTMLButtonElement;
    btnLeave.addEventListener("click", async () => {
      await opts.easyMgr!.leaveRoom();
      container.innerHTML = "";
    });
    connectedWrap.appendChild(btnLeave);
  }
  
  container.appendChild(connectedWrap);
}
