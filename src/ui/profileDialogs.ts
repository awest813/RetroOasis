import { createElement as make, trapFocus } from "./dom.js";
import { isTopmostOverlay, registerOverlay } from "./overlayStack.js";
import { canRenderProfileShareQr, renderProfileShareQrDataUrl } from "../profileQr.js";
import { showInfoToast } from "./toasts.js";

export interface PassphraseDialogOpts {
  title: string;
  body?: string;
  confirmLabel?: string;
  requireConfirm?: boolean;
}

interface ProfileDialogShell {
  overlay: HTMLDivElement;
  box: HTMLDivElement;
  ac: AbortController;
  close: () => void;
}

function armProfileDialog(
  overlay: HTMLDivElement,
  box: HTMLDivElement,
  onDismiss: () => void,
  focusEl?: HTMLElement,
): ProfileDialogShell {
  const ac = new AbortController();
  let detachFromStack: (() => void) | null = null;
  const close = () => {
    detachFromStack?.();
    detachFromStack = null;
    ac.abort();
    overlay.classList.remove("confirm-overlay--visible");
    setTimeout(() => overlay.remove(), 200);
    onDismiss();
  };
  detachFromStack = registerOverlay({ element: overlay, close });
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  }, { signal: ac.signal });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isTopmostOverlay(overlay)) {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  }, { signal: ac.signal, capture: true });
  trapFocus(box, ac.signal);
  requestAnimationFrame(() => {
    overlay.classList.add("confirm-overlay--visible");
    (focusEl ?? box.querySelector<HTMLElement>("button, input, textarea"))?.focus();
  });
  return { overlay, box, ac, close };
}

/** Modal passphrase entry for encrypted profile export/import. */
export function showPassphraseDialog(opts: PassphraseDialogOpts): Promise<string | null> {
  const { title, body, confirmLabel = "Continue", requireConfirm = false } = opts;
  return new Promise((resolve) => {
    const overlay = make("div", { class: "confirm-overlay" }) as HTMLDivElement;
    const box = make("div", {
      class: "confirm-box",
      role: "dialog",
      "aria-modal": "true",
      "aria-label": title,
    }) as HTMLDivElement;
    box.appendChild(make("h3", { class: "confirm-title" }, title));
    if (body) box.appendChild(make("p", { class: "confirm-body" }, body));

    const passInp = make("input", {
      type: "password",
      id: "profile-passphrase-input",
      class: "settings-input",
      placeholder: "Passphrase",
      autocomplete: "new-password",
      "aria-label": "Passphrase",
    }) as HTMLInputElement;

    const confirmInp = requireConfirm
      ? make("input", {
          type: "password",
          class: "settings-input",
          placeholder: "Confirm passphrase",
          autocomplete: "new-password",
          "aria-label": "Confirm passphrase",
        }) as HTMLInputElement
      : null;

    const errorMsg = make("p", { class: "cloud-wizard-error", "aria-live": "assertive" });
    errorMsg.hidden = true;

    const form = make("div", { class: "cloud-wizard-form" });
    form.append(
      make("label", { class: "settings-input-label", for: "profile-passphrase-input" }, "Passphrase"),
      passInp,
    );
    if (confirmInp) {
      form.append(
        make("label", { class: "settings-input-label" }, "Confirm"),
        confirmInp,
      );
    }
    box.append(form, errorMsg);

    const footer = make("div", { class: "confirm-footer" });
    const btnCancel = make("button", { class: "btn", type: "button" }, "Cancel") as HTMLButtonElement;
    const btnConfirm = make("button", { class: "btn btn--primary", type: "button" }, confirmLabel) as HTMLButtonElement;
    footer.append(btnCancel, btnConfirm);
    box.appendChild(footer);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const { close } = armProfileDialog(overlay, box, () => finish(null), btnConfirm);
    btnCancel.addEventListener("click", () => close());
    btnConfirm.addEventListener("click", () => {
      const pass = passInp.value;
      if (!pass) {
        errorMsg.textContent = "Enter a passphrase.";
        errorMsg.hidden = false;
        passInp.focus();
        return;
      }
      if (requireConfirm && confirmInp && pass !== confirmInp.value) {
        errorMsg.textContent = "Passphrases do not match.";
        errorMsg.hidden = false;
        confirmInp.focus();
        return;
      }
      finish(pass);
      close();
    });
    passInp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") btnConfirm.click();
    });
  });
}

/** Show a copyable profile share code (encrypted payload). */
export function showProfileShareDialog(shareCode: string): Promise<void> {
  return new Promise((resolve) => {
    const overlay = make("div", { class: "confirm-overlay" }) as HTMLDivElement;
    const box = make("div", {
      class: "confirm-box",
      role: "dialog",
      "aria-modal": "true",
      "aria-label": "Profile share code",
    }) as HTMLDivElement;
    box.appendChild(make("h3", { class: "confirm-title" }, "Profile share code"));
    box.appendChild(make("p", { class: "confirm-body" },
      "Copy this code and paste it on another device using Import share code. " +
      "It contains encrypted credentials — share only with people you trust."));

    const codeArea = make("textarea", {
      class: "settings-input profile-share-code",
      readonly: "true",
      rows: "6",
      "aria-label": "Profile share code",
    }) as HTMLTextAreaElement;
    codeArea.value = shareCode;
    box.appendChild(codeArea);

    if (canRenderProfileShareQr(shareCode)) {
      const qrWrap = make("div", { class: "profile-share-qr-wrap" });
      const qrImg = make("img", {
        class: "profile-share-qr",
        alt: "QR code for profile share",
      }) as HTMLImageElement;
      const dataUrl = renderProfileShareQrDataUrl(shareCode, 220);
      if (dataUrl) {
        qrImg.src = dataUrl;
        qrWrap.appendChild(make("p", { class: "settings-help" }, "Scan this QR on another device, then choose Import share code."));
        qrWrap.appendChild(qrImg);
        box.appendChild(qrWrap);
      }
    } else {
      box.appendChild(make("p", { class: "settings-help" },
        "This share code is too large for a QR image — use Copy code instead."));
    }

    const footer = make("div", { class: "confirm-footer" });
    const btnCopy = make("button", { class: "btn btn--primary", type: "button" }, "Copy code") as HTMLButtonElement;
    const btnClose = make("button", { class: "btn", type: "button" }, "Close") as HTMLButtonElement;
    footer.append(btnCopy, btnClose);
    box.appendChild(footer);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    const { close } = armProfileDialog(overlay, box, () => resolve(), btnCopy);
    btnClose.addEventListener("click", close);
    btnCopy.addEventListener("click", () => {
      void navigator.clipboard?.writeText(shareCode).then(() => {
        btnCopy.textContent = "Copied";
        showInfoToast("Share code copied.", "success");
        setTimeout(() => { btnCopy.textContent = "Copy code"; }, 1500);
      }).catch(() => {
        codeArea.focus();
        codeArea.select();
      });
    });
  });
}

/** Paste a profile share code for import. */
export function showProfileShareImportDialog(): Promise<string | null> {
  return new Promise((resolve) => {
    const overlay = make("div", { class: "confirm-overlay" }) as HTMLDivElement;
    const box = make("div", {
      class: "confirm-box",
      role: "dialog",
      "aria-modal": "true",
      "aria-label": "Import profile share code",
    }) as HTMLDivElement;
    box.appendChild(make("h3", { class: "confirm-title" }, "Import share code"));
    box.appendChild(make("p", { class: "confirm-body" }, "Paste a ro-profile share code from another device."));

    const codeArea = make("textarea", {
      class: "settings-input profile-share-code",
      rows: "6",
      placeholder: "ro-profile:v1:…",
      "aria-label": "Paste profile share code",
    }) as HTMLTextAreaElement;

    const scanStatus = make("p", { class: "settings-help", "aria-live": "polite" });
    scanStatus.hidden = true;
    const importError = make("p", { class: "cloud-wizard-error", "aria-live": "assertive" });
    importError.hidden = true;

    const footer = make("div", { class: "confirm-footer" });
    const btnCancel = make("button", { class: "btn", type: "button" }, "Cancel") as HTMLButtonElement;
    const btnScan = make("button", { class: "btn", type: "button" }, "Scan QR") as HTMLButtonElement;
    const btnStopScan = make("button", { class: "btn", type: "button" }, "Stop scan") as HTMLButtonElement;
    btnStopScan.hidden = true;
    const btnImport = make("button", { class: "btn btn--primary", type: "button" }, "Import") as HTMLButtonElement;
    footer.append(btnCancel, btnScan, btnStopScan, btnImport);
    box.append(codeArea, scanStatus, importError, footer);

    const scanSupported = typeof window !== "undefined"
      && "BarcodeDetector" in window
      && typeof navigator.mediaDevices?.getUserMedia === "function";
    if (!scanSupported) btnScan.hidden = true;

    let stopActiveScan: (() => void) | null = null;

    btnScan.addEventListener("click", () => {
      void (async () => {
        stopActiveScan?.();
        btnScan.disabled = true;
        btnStopScan.hidden = false;
        scanStatus.hidden = false;
        scanStatus.textContent = "Starting camera…";
        let stream: MediaStream | null = null;
        let video: HTMLVideoElement | null = null;
        let aborted = false;
        const stopCamera = () => {
          aborted = true;
          stream?.getTracks().forEach((t) => t.stop());
          stream = null;
          video?.remove();
          video = null;
          btnStopScan.hidden = true;
          btnScan.disabled = false;
        };
        stopActiveScan = stopCamera;
        try {
          const Detector = (window as unknown as { BarcodeDetector: new (opts: { formats: string[] }) => {
            detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
          } }).BarcodeDetector;
          const detector = new Detector({ formats: ["qr_code"] });
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
          if (aborted) return;
          video = make("video", { autoplay: "true", playsinline: "true", class: "profile-share-qr-video" }) as HTMLVideoElement;
          video.srcObject = stream;
          box.insertBefore(video, footer);
          await new Promise<void>((res) => { video!.onloadedmetadata = () => res(); });
          if (aborted) return;
          await video.play();
          scanStatus.textContent = "Point the camera at a profile QR code…";
          const deadline = Date.now() + 20_000;
          let found = false;
          while (!aborted && Date.now() < deadline) {
            const codes = await detector.detect(video);
            const hit = codes.find((c) => c.rawValue?.startsWith("ro-profile:"));
            if (hit?.rawValue) {
              codeArea.value = hit.rawValue;
              scanStatus.textContent = "QR code captured.";
              found = true;
              break;
            }
            await new Promise((r) => setTimeout(r, 250));
          }
          if (!aborted && !found) {
            scanStatus.textContent = "No profile QR detected. Paste the code manually or try again.";
          }
        } catch {
          if (!aborted) scanStatus.textContent = "Camera unavailable. Paste the share code manually.";
        } finally {
          if (stopActiveScan === stopCamera) stopActiveScan = null;
          stopCamera();
        }
      })();
    });

    btnStopScan.addEventListener("click", () => {
      stopActiveScan?.();
      stopActiveScan = null;
      scanStatus.textContent = "Scan cancelled.";
    });

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      stopActiveScan?.();
      stopActiveScan = null;
      resolve(value);
    };

    const { close } = armProfileDialog(overlay, box, () => finish(null), btnImport);
    btnCancel.addEventListener("click", () => close());
    btnImport.addEventListener("click", () => {
      const value = codeArea.value.trim();
      if (!value) {
        importError.textContent = "Paste a share code to import.";
        importError.hidden = false;
        codeArea.focus();
        return;
      }
      finish(value);
      close();
    });
    codeArea.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) btnImport.click();
    });
  });
}
