import { createElement as make } from "./dom.js";
import { isTopmostOverlay, registerOverlay } from "./overlayStack.js";

export interface PassphraseDialogOpts {
  title: string;
  body?: string;
  confirmLabel?: string;
  requireConfirm?: boolean;
}

/** Modal passphrase entry for encrypted profile export/import. */
export function showPassphraseDialog(opts: PassphraseDialogOpts): Promise<string | null> {
  const { title, body, confirmLabel = "Continue", requireConfirm = false } = opts;
  return new Promise((resolve) => {
    const overlay = make("div", { class: "confirm-overlay" });
    const box = make("div", {
      class: "confirm-box",
      role: "dialog",
      "aria-modal": "true",
      "aria-label": title,
    });
    box.appendChild(make("h3", { class: "confirm-title" }, title));
    if (body) box.appendChild(make("p", { class: "confirm-body" }, body));

    const passInp = make("input", {
      type: "password",
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
      make("label", { class: "settings-input-label", for: passInp.id || undefined }, "Passphrase"),
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

    let detachFromStack: (() => void) | null = null;
    const close = (value: string | null) => {
      detachFromStack?.();
      detachFromStack = null;
      overlay.classList.remove("confirm-overlay--visible");
      setTimeout(() => overlay.remove(), 200);
      resolve(value);
    };

    detachFromStack = registerOverlay({ element: overlay, close: () => close(null) });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && isTopmostOverlay(overlay)) {
        e.preventDefault();
        close(null);
      }
    }, { once: true });
    btnCancel.addEventListener("click", () => close(null));
    btnConfirm.addEventListener("click", () => {
      const pass = passInp.value;
      if (!pass) {
        errorMsg.textContent = "Enter a passphrase.";
        errorMsg.hidden = false;
        return;
      }
      if (requireConfirm && confirmInp && pass !== confirmInp.value) {
        errorMsg.textContent = "Passphrases do not match.";
        errorMsg.hidden = false;
        return;
      }
      close(pass);
    });
    passInp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") btnConfirm.click();
    });
    requestAnimationFrame(() => overlay.classList.add("confirm-overlay--visible"));
    passInp.focus();
  });
}
