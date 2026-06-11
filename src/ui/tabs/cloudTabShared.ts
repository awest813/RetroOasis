import { createElement as make } from "../dom.js";
import { showError } from "../toasts.js";
import {
  isGoogleOAuthConfigured,
  isDropboxOAuthConfigured,
  startGoogleOAuth,
  startDropboxOAuth,
} from "../../oauthPopup.js";

export interface CloudProviderMeta {
  id:    string;
  label: string;
}

export const CLOUD_PROVIDER_ICON_SVG: Record<string, string> = {
  gdrive: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2v11z"/></svg>`,
  dropbox: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`,
  onedrive: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>`,
  webdav: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
  pcloud: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/></svg>`,
  blomp: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>`,
  box: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.27 6.96L12 12.01l8.73-5.05"/></svg>`,
  mega: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
  nextcloud: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
};

export const OVERLAY_FADE_DELAY_MS = 200;

export const CLOUD_SAVE_PROVIDERS: CloudProviderMeta[] = [
  { id: "gdrive",   label: "Google Drive" },
  { id: "dropbox",  label: "Dropbox" },
  { id: "onedrive", label: "OneDrive" },
  { id: "webdav",   label: "WebDAV" },
  { id: "nextcloud",label: "Nextcloud" },
  { id: "pcloud",   label: "pCloud" },
  { id: "blomp",    label: "Blomp" },
  { id: "box",      label: "Box" },
  { id: "mega",     label: "MEGA" },
];

export const CLOUD_LIBRARY_PROVIDERS: CloudProviderMeta[] = [
  { id: "gdrive",   label: "Google Drive" },
  { id: "dropbox",  label: "Dropbox" },
  { id: "onedrive", label: "OneDrive" },
  { id: "webdav",   label: "WebDAV" },
  { id: "nextcloud",label: "Nextcloud" },
  { id: "pcloud",   label: "pCloud" },
  { id: "blomp",    label: "Blomp" },
  { id: "box",      label: "Box" },
  { id: "mega",     label: "MEGA" },
];

export const ALL_CLOUD_PROVIDERS: CloudProviderMeta[] = CLOUD_LIBRARY_PROVIDERS;

export function getCloudProviderLabel(id: string): string {
  return ALL_CLOUD_PROVIDERS.find(p => p.id === id)?.label ?? id;
}

export function cloudProviderPickerIconEl(providerId: string): HTMLElement {
  const wrap = make("span", { class: "cloud-provider-card__icon", "aria-hidden": "true" });
  const svg = CLOUD_PROVIDER_ICON_SVG[providerId];
  wrap.innerHTML = svg ?? CLOUD_PROVIDER_ICON_SVG["webdav"]!;
  return wrap;
}

export function pasteIntoCloudWizardInput(input: HTMLInputElement, fieldNameForErrors: string): void {
  void (async () => {
    try {
      if (typeof navigator === "undefined" || !navigator.clipboard?.readText) {
        showError("Clipboard paste is not available. Use Ctrl+V (⌘V on Mac) in the field.");
        input.focus();
        return;
      }
      const text = await navigator.clipboard.readText();
      const t = typeof text === "string" ? text.trim() : "";
      if (!t) {
        showError("Clipboard was empty.");
        input.focus();
        return;
      }
      input.value = t;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.focus();
    } catch {
      showError(
        `Could not read the clipboard for ${fieldNameForErrors} — paste with Ctrl+V in the field, or allow clipboard access for this site.`,
      );
      input.focus();
    }
  })();
}

export function appendCloudWizardLabeledField(
  form: HTMLElement,
  labelText: string,
  input: HTMLInputElement,
  pasteAccessibilityName: string,
): void {
  const row = make("div", { class: "settings-input-row" });
  const label = make("label", { class: "settings-input-label", for: input.id }, labelText);
  const line = make("div", { class: "settings-input-paste-line" });
  const pasteBtn = make("button", {
    type: "button",
    class: "btn btn--ghost btn--sm",
    "aria-label": `Paste ${pasteAccessibilityName} from clipboard`,
    title: "Insert text from the clipboard",
  }, "Paste") as HTMLButtonElement;
  pasteBtn.addEventListener("click", () => pasteIntoCloudWizardInput(input, pasteAccessibilityName));
  line.append(input, pasteBtn);
  row.append(label, line);
  form.appendChild(row);
}

export function cloudWizardHeadingId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? `cloud-wizard-h-${crypto.randomUUID()}`
    : `cloud-wizard-h-${Date.now().toString(36)}`;
}

export function appendOAuthSignInButton(opts: {
  providerId: string;
  providerLabel: string;
  container: HTMLElement;
  tokenInput: HTMLInputElement;
  getErrorEl: () => HTMLElement;
}): boolean {
  const oauthAvailable =
    (opts.providerId === "gdrive" && isGoogleOAuthConfigured()) ||
    (opts.providerId === "dropbox" && isDropboxOAuthConfigured());

  if (!oauthAvailable) return false;

  const oauthRow = make("div", { class: "settings-input-row oauth-signin-row" });
  const oauthBtn = make("button", {
    class: "btn btn--primary oauth-signin-btn",
    type: "button",
    "aria-label": `Sign in with ${opts.providerLabel} (browser OAuth)`,
  }, `Sign in with ${opts.providerLabel}`) as HTMLButtonElement;
  oauthRow.appendChild(oauthBtn);
  opts.container.appendChild(oauthRow);

  const divider = make("div", { class: "oauth-divider", role: "separator" });
  divider.appendChild(make("span", { class: "oauth-divider__line", "aria-hidden": "true" }));
  divider.appendChild(make("span", { class: "oauth-divider__text" }, "Or paste a token"));
  divider.appendChild(make("span", { class: "oauth-divider__line", "aria-hidden": "true" }));
  opts.container.appendChild(divider);

  oauthBtn.addEventListener("click", async () => {
    oauthBtn.disabled = true;
    oauthBtn.setAttribute("aria-busy", "true");
    oauthBtn.textContent = "Waiting for sign-in…";
    try {
      const result = opts.providerId === "gdrive"
        ? await startGoogleOAuth()
        : await startDropboxOAuth();
      opts.tokenInput.value = result.accessToken;
      oauthBtn.textContent = "Signed in";
      oauthBtn.removeAttribute("aria-busy");
    } catch (err) {
      oauthBtn.disabled = false;
      oauthBtn.removeAttribute("aria-busy");
      oauthBtn.textContent = `Sign in with ${opts.providerLabel}`;
      const msg = err instanceof Error ? err.message : "OAuth sign-in failed.";
      const errorEl = opts.getErrorEl();
      errorEl.textContent = msg;
      errorEl.hidden = false;
    }
  });

  return true;
}
