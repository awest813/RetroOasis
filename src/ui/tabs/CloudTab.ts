import { createElement as make } from "../dom.js";
import type { Settings } from "../../types/settings.js";
import { GameLibrary, formatRelativeTime } from "../../library.js";
import { getCloudSaveManager } from "../../cloudSaveSingleton.js";
import {
  WebDAVProvider,
  GoogleDriveProvider,
  DropboxProvider,
  pCloudProvider,
  BlompProvider,
  BoxProvider,
  OneDriveProvider,
  MegaProvider,
  NextcloudProvider,
} from "../../cloudSave.js";
import {
  CLOUD_SAVE_PROVIDERS,
  getCloudProviderLabel,
  appendCloudWizardLabeledField,
  cloudWizardHeadingId,
  appendOAuthSignInButton,
  cloudProviderPickerIconEl,
  OVERLAY_FADE_DELAY_MS,
} from "./cloudTabShared.js";

function showCloudConnectDialog(): Promise<boolean> {
  const cloudManager = getCloudSaveManager();

  return new Promise((resolve) => {
    const overlay = make("div", { class: "confirm-overlay" });
    const box = make("div", {
      class: "confirm-box cloud-wizard-box",
      role: "dialog",
      "aria-modal": "true",
      "aria-label": "Save Sync Connection",
    });

    const close = (result: boolean) => {
      document.removeEventListener("keydown", onKeydown, { capture: true });
      overlay.classList.remove("confirm-overlay--visible");
      setTimeout(() => overlay.remove(), OVERLAY_FADE_DELAY_MS);
      resolve(result);
    };

    const onKeydown = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); close(false); }
    };
    document.addEventListener("keydown", onKeydown, { capture: true });
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(false); });

    const renderStep1 = () => {
      box.innerHTML = "";
      const titleId = cloudWizardHeadingId();
      box.setAttribute("aria-labelledby", titleId);
      box.appendChild(make("h3", { id: titleId, class: "confirm-box__title" }, "Turn On Save Sync"));
      box.appendChild(make("p", { class: "confirm-box__body" },
        "Choose where RetroOasis should mirror save snapshots. Local saves remain in this browser; save sync adds a second copy."
      ));

      const providerGrid = make("div", { class: "cloud-provider-grid" });
      let selectedId = CLOUD_SAVE_PROVIDERS[0]?.id ?? "local";

      for (const p of CLOUD_SAVE_PROVIDERS) {
        const pCard = make("button", {
          class: `cloud-provider-card${p.id === selectedId ? " active" : ""}`,
          type: "button",
          "aria-label": `${p.label} save sync provider`,
          "aria-pressed": p.id === selectedId ? "true" : "false",
        }) as HTMLButtonElement;
        pCard.appendChild(cloudProviderPickerIconEl(p.id));
        pCard.appendChild(make("span", { class: "cloud-provider-card__label" }, p.label));
        pCard.addEventListener("click", () => {
          selectedId = p.id;
          providerGrid.querySelectorAll(".cloud-provider-card").forEach((c) => {
            c.classList.remove("active");
            c.setAttribute("aria-pressed", "false");
          });
          pCard.classList.add("active");
          pCard.setAttribute("aria-pressed", "true");
        });
        providerGrid.appendChild(pCard);
      }
      box.appendChild(providerGrid);

      const actions = make("div", { class: "confirm-box__actions" });
      const cancelBtn = make("button", { class: "btn" }, "Cancel") as HTMLButtonElement;
      const nextBtn   = make("button", { class: "btn btn--primary" }, "Continue") as HTMLButtonElement;
      cancelBtn.addEventListener("click", () => close(false));
      nextBtn.addEventListener("click", () => renderStep2(selectedId));
      actions.append(cancelBtn, nextBtn);
      box.appendChild(actions);
    };

    const renderStep2 = (providerId: string) => {
      box.innerHTML = "";
      const meta = CLOUD_SAVE_PROVIDERS.find(p => p.id === providerId);
      if (!meta) { close(false); return; }
      const stepTitleId = cloudWizardHeadingId();
      box.setAttribute("aria-labelledby", stepTitleId);
      box.appendChild(make("h3", { id: stepTitleId, class: "confirm-box__title" }, `${meta.label} save sync`));

      const form = make("div", { class: "cloud-wizard-form" });
      type CredResult = { ok: false; error: string } | { ok: true; data: Record<string, string> };
      let getCredentials: () => CredResult = () => ({ ok: true, data: {} });

      if (providerId === "webdav" || providerId === "nextcloud") {
        const urlInp  = make("input", { type: "url", id: "csd-url", class: "settings-input", placeholder: providerId === "nextcloud" ? "https://nextcloud.example.com" : "https://dav.example.com/saves", autocomplete: "off" }) as HTMLInputElement;
        const userInp = make("input", { type: "text", id: "csd-user", class: "settings-input", placeholder: "Username", autocomplete: "username" }) as HTMLInputElement;
        const passInp = make("input", { type: "password", id: "csd-pass", class: "settings-input", placeholder: "Password (or App Password)", autocomplete: "current-password" }) as HTMLInputElement;
        appendCloudWizardLabeledField(form, "Server URL", urlInp, "server URL");
        appendCloudWizardLabeledField(form, "Username", userInp, "username");
        appendCloudWizardLabeledField(form, "Password", passInp, "password");
        getCredentials = () => {
          const url = urlInp.value.trim();
          const user = userInp.value.trim();
          const pass = passInp.value;
          if (!url) return { ok: false, error: "Server URL is required." };
          if (!user) return { ok: false, error: "Username is required." };
          return { ok: true, data: { url, user, pass } };
        };
      } else if (providerId === "pcloud") {
        const tokenInp = make("input", { type: "text", id: "csd-token", class: "settings-input", placeholder: "pCloud access token", autocomplete: "off" }) as HTMLInputElement;
        appendCloudWizardLabeledField(form, "Access Token", tokenInp, "access token");
        const regionSel = make("select", { id: "csd-region", class: "settings-input" }) as HTMLSelectElement;
        regionSel.appendChild(Object.assign(document.createElement("option"), { value: "us", textContent: "US" }));
        regionSel.appendChild(Object.assign(document.createElement("option"), { value: "eu", textContent: "EU" }));
        form.append(make("div", { class: "settings-input-row" }, make("label", { class: "settings-input-label", for: "csd-region" }, "Region"), regionSel));
        getCredentials = () => {
          const token = tokenInp.value.trim();
          if (!token) return { ok: false, error: "Access token is required." };
          return { ok: true, data: { token, region: regionSel.value } };
        };
      } else if (providerId === "blomp") {
        const userInp = make("input", { type: "text", id: "csd-user", class: "settings-input", placeholder: "Blomp username", autocomplete: "username" }) as HTMLInputElement;
        const passInp = make("input", { type: "password", id: "csd-pass", class: "settings-input", placeholder: "Password", autocomplete: "current-password" }) as HTMLInputElement;
        const containerInp = make("input", { type: "text", id: "csd-container", class: "settings-input", placeholder: "retrooasis", autocomplete: "off" }) as HTMLInputElement;
        appendCloudWizardLabeledField(form, "Username", userInp, "username");
        appendCloudWizardLabeledField(form, "Password", passInp, "password");
        appendCloudWizardLabeledField(form, "Container (optional)", containerInp, "container name");
        getCredentials = () => {
          const user = userInp.value.trim();
          if (!user) return { ok: false, error: "Username is required." };
          return { ok: true, data: { user, pass: passInp.value, container: containerInp.value.trim() || "retrooasis" } };
        };
      } else if (providerId === "box") {
        const tokenInp = make("input", { type: "text", id: "csd-token", class: "settings-input", placeholder: "Box OAuth access token", autocomplete: "off" }) as HTMLInputElement;
        const folderInp = make("input", { type: "text", id: "csd-folder", class: "settings-input", placeholder: "0 (root)", autocomplete: "off" }) as HTMLInputElement;
        appendCloudWizardLabeledField(form, "Access Token", tokenInp, "access token");
        appendCloudWizardLabeledField(form, "Root Folder ID (optional)", folderInp, "folder ID");
        getCredentials = () => {
          const token = tokenInp.value.trim();
          if (!token) return { ok: false, error: "Access token is required." };
          return { ok: true, data: { token, folderId: folderInp.value.trim() || "0" } };
        };
      } else if (providerId === "onedrive") {
        const tokenInp = make("input", { type: "text", id: "csd-token", class: "settings-input", placeholder: "OneDrive access token", autocomplete: "off" }) as HTMLInputElement;
        const rootInp = make("input", { type: "text", id: "csd-rootid", class: "settings-input", placeholder: "root (optional)", autocomplete: "off" }) as HTMLInputElement;
        appendCloudWizardLabeledField(form, "Access Token", tokenInp, "access token");
        appendCloudWizardLabeledField(form, "Root Folder ID (optional)", rootInp, "root folder ID");
        getCredentials = () => {
          const token = tokenInp.value.trim();
          if (!token) return { ok: false, error: "Access token is required." };
          return { ok: true, data: { token, rootId: rootInp.value.trim() || "root" } };
        };
      } else if (providerId === "mega") {
        const emailInp = make("input", { type: "email", id: "csd-email", class: "settings-input", placeholder: "MEGA email address", autocomplete: "email" }) as HTMLInputElement;
        const passInp = make("input", { type: "password", id: "csd-pass", class: "settings-input", placeholder: "Password", autocomplete: "current-password" }) as HTMLInputElement;
        appendCloudWizardLabeledField(form, "Email", emailInp, "email");
        appendCloudWizardLabeledField(form, "Password", passInp, "password");
        getCredentials = () => {
          const email = emailInp.value.trim();
          const pass = passInp.value;
          if (!email) return { ok: false, error: "Email is required." };
          if (!pass) return { ok: false, error: "Password is required." };
          return { ok: true, data: { email, pass } };
        };
      } else {
        const tokenInp = make("input", { type: "text", id: "csd-token", class: "settings-input", placeholder: `${meta.label} access token`, autocomplete: "off" }) as HTMLInputElement;
        appendOAuthSignInButton({ providerId, providerLabel: meta.label, container: form, tokenInput: tokenInp, getErrorEl: () => errorMsg });
        appendCloudWizardLabeledField(form, "Access Token", tokenInp, "access token");
        getCredentials = () => {
          const token = tokenInp.value.trim();
          if (!token) return { ok: false, error: "Access token is required." };
          return { ok: true, data: { token } };
        };
      }

      box.appendChild(form);
      const errorMsg = make("p", { class: "cloud-wizard-error", "aria-live": "assertive" });
      errorMsg.hidden = true;
      box.appendChild(errorMsg);

      const actions = make("div", { class: "confirm-box__actions" });
      const backBtn = make("button", { class: "btn" }, "← Back") as HTMLButtonElement;
      const connectBtn = make("button", { class: "btn btn--primary" }, "Connect") as HTMLButtonElement;
      actions.append(backBtn, connectBtn);
      box.appendChild(actions);

      backBtn.addEventListener("click", () => renderStep1());
      connectBtn.addEventListener("click", async () => {
        const creds = getCredentials();
        if (!creds.ok) { errorMsg.textContent = creds.error; errorMsg.hidden = false; return; }
        errorMsg.hidden = true;
        connectBtn.disabled = true;
        connectBtn.textContent = "Connecting…";
        try {
          const d = creds.data;
          let provider;
          if (providerId === "webdav") {
            cloudManager.saveWebDAVConfig(d["url"]!, d["user"]!, d["pass"]!);
            provider = new WebDAVProvider(d["url"]!, d["user"]!, d["pass"]!);
          } else if (providerId === "nextcloud") {
            cloudManager.saveNextcloudConfig(d["url"]!, d["user"]!, d["pass"]!);
            provider = new NextcloudProvider(d["url"]!, d["user"]!, d["pass"]!);
          } else if (providerId === "gdrive") {
            cloudManager.saveGDriveConfig(d["token"]!);
            provider = new GoogleDriveProvider(d["token"]!);
          } else if (providerId === "dropbox") {
            cloudManager.saveDropboxConfig(d["token"]!);
            provider = new DropboxProvider(d["token"]!);
          } else if (providerId === "pcloud") {
            cloudManager.savePCloudConfig(d["token"]!, d["region"] as "us" | "eu");
            provider = new pCloudProvider(d["token"]!, d["region"] as "us" | "eu");
          } else if (providerId === "blomp") {
            cloudManager.saveBlompConfig(d["user"]!, d["pass"]!, d["container"]!);
            provider = new BlompProvider(d["user"]!, d["pass"]!, d["container"]!);
          } else if (providerId === "box") {
            cloudManager.saveBoxConfig(d["token"]!, d["folderId"]!);
            provider = new BoxProvider(d["token"]!, d["folderId"]!);
          } else if (providerId === "onedrive") {
            cloudManager.saveOneDriveConfig(d["token"]!, d["rootId"]!);
            provider = new OneDriveProvider(d["token"]!, d["rootId"]!);
          } else if (providerId === "mega") {
            cloudManager.saveMegaConfig(d["email"]!, d["pass"]!);
            provider = new MegaProvider(d["email"]!, d["pass"]!);
          } else {
            throw new Error("Unknown provider.");
          }
          await cloudManager.connect(provider);
          close(true);
        } catch (err: unknown) {
          errorMsg.textContent = err instanceof Error ? err.message : "Connection failed.";
          errorMsg.hidden = false;
          connectBtn.disabled = false;
          connectBtn.textContent = "Connect";
        }
      });
    };

    renderStep1();
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("confirm-overlay--visible"));
  });
}

export function buildCloudTab(
  container:        HTMLElement,
  settings:         Settings,
  library:          GameLibrary,
  onSettingsChange: (patch: Partial<Settings>) => void,
  appName?: string,
): void {
  void settings;
  void library;
  void onSettingsChange;
  const APP_NAME = appName ?? "RetroOasis";
  container.innerHTML = "";
  const netOffline = typeof navigator !== "undefined" && !navigator.onLine;
  const headingId = "settings-save-sync-heading";
  const saveHeadingId = "settings-cloud-save-backup-heading";

  const section = make("div", { class: "settings-section", role: "region", "aria-labelledby": headingId });
  section.appendChild(make("h4", { class: "settings-section__title", id: headingId }, "Save Sync"));
  section.appendChild(make("p", { class: "settings-section__desc" },
    `Mirror save snapshots to a cloud provider. Local saves always stay in this browser first.`));

  const cloudManager = getCloudSaveManager();
  const summary = make("p", { class: "cloud-storage-summary", role: "status", "aria-live": "polite" }, "Checking connection status...");
  summary.textContent = cloudManager.isConnected()
    ? `Connected to ${getCloudProviderLabel(cloudManager.providerId)}`
    : "Save sync not connected";
  section.appendChild(summary);

  const saveSection = make("div", { class: "cloud-library-section", role: "region", "aria-labelledby": saveHeadingId });
  const saveTitleEl = () => make("h5", { class: "cloud-library-section__title", id: saveHeadingId }, "Cloud Save Backup");

  const buildSaveStatus = () => {
    const statusRow = make("div", { class: "cloud-save-status-row" });
    if (cloudManager.isConnected()) {
      const provLabel = getCloudProviderLabel(cloudManager.providerId);
      statusRow.append(
        make("span", { class: "cloud-connection-item__status status--online" }, "Connected"),
        make("span", { class: "cloud-save-status__provider" }, `${provLabel} sync active`),
        cloudManager.lastSyncAt
          ? make("span", { class: "cloud-save-status__lastsync" }, `Last sync: ${formatRelativeTime(cloudManager.lastSyncAt)}`)
          : make("span", { class: "cloud-save-status__lastsync" }, "Snapshots mirror after your next save."),
      );
      const disconnectBtn = make("button", { class: "btn btn--sm", type: "button", "aria-label": `Disconnect save sync (${provLabel})` }, "Disconnect") as HTMLButtonElement;
      disconnectBtn.addEventListener("click", () => {
        cloudManager.disconnect();
        saveSection.innerHTML = "";
        saveSection.appendChild(saveTitleEl());
        saveSection.appendChild(buildSaveStatus());
        summary.textContent = "Save sync not connected";
      });
      statusRow.appendChild(disconnectBtn);
      if (cloudManager.lastError) {
        statusRow.appendChild(make("p", { class: "cloud-save-status__error", role: "status" }, `Last sync issue: ${cloudManager.lastError}`));
      }
    } else {
      statusRow.append(
        make("p", { class: "settings-help" }, `Turn on save sync to back up ${APP_NAME} snapshots on another device.`),
      );
      const connectBtn = make("button", { class: "btn btn--primary", type: "button", "aria-label": "Turn on save sync" }, "Turn on save sync") as HTMLButtonElement;
      connectBtn.addEventListener("click", () => {
        void showCloudConnectDialog().then((connected) => {
          if (connected) {
            saveSection.innerHTML = "";
            saveSection.appendChild(saveTitleEl());
            saveSection.appendChild(buildSaveStatus());
            summary.textContent = `Connected to ${getCloudProviderLabel(cloudManager.providerId)}`;
          }
        });
      });
      if (netOffline) { connectBtn.disabled = true; connectBtn.title = "Connect when you're back online"; }
      statusRow.appendChild(connectBtn);
    }
    return statusRow;
  };

  saveSection.appendChild(saveTitleEl());
  saveSection.appendChild(buildSaveStatus());
  section.appendChild(saveSection);
  section.appendChild(make("p", { class: "settings-help" },
    "Remote ROM libraries and cloud imports are in Settings → Cloud Library."));
  container.appendChild(section);
}
