import { createElement as make } from "../dom.js";
import { showConfirmDialog } from "../modals.js";
import { showError, showInfoToast } from "../toasts.js";
import type { Settings, CloudLibraryConnection } from "../../types/settings.js";
import { GameLibrary, formatRelativeTime } from "../../library.js";
import {
  getGoogleClientId,
  getDropboxAppKey,
  setGoogleClientId,
  setDropboxAppKey,
} from "../../oauthPopup.js";
import { createProvider } from "../../cloudLibrary.js";
import { createUuid } from "../../uuid.js";
import { detectSystem } from "../../systems.js";
import { LEGACY_EVENTS } from "../../legacy.js";
import {
  showLoadingOverlay,
  hideLoadingOverlay,
  setLoadingMessage,
  setLoadingSubtitle,
} from "../loadingOverlay.js";
import { showCloudRomImporterDialog } from "../cloudRomImporter.js";
import {
  serializeProfileSnapshot,
} from "../../profileSnapshot.js";
import { encryptProfileExport } from "../../profileCrypto.js";
import { encodeProfileSharePayload, parseProfileImportPayload } from "../../profileShare.js";
import {
  canSyncProfilesViaCloudSave,
  pushProfileIndexToCloud,
  pullProfileIndexFromCloud,
} from "../../profileCloudSync.js";
import { PROFILE_COLOR_PRESETS } from "../../profileColors.js";
import { getProfileManager } from "../../profileManager.js";
import {
  showPassphraseDialog,
  showProfileShareDialog,
  showProfileShareImportDialog,
} from "../profileDialogs.js";
import type { ApiKeyStore } from "../../apiKeyStore.js";
import {
  CLOUD_LIBRARY_PROVIDERS,
  getCloudProviderLabel,
  pasteIntoCloudWizardInput,
  appendCloudWizardLabeledField,
  cloudWizardHeadingId,
  appendOAuthSignInButton,
  cloudProviderPickerIconEl,
  OVERLAY_FADE_DELAY_MS,
} from "./cloudTabShared.js";

function showAddCloudLibraryDialog(
  settings:         Settings,
  onSettingsChange: (patch: Partial<Settings>) => void,
  rebuildTab:       () => void,
): Promise<void> {
  return new Promise((resolve) => {
    const overlay = make("div", { class: "confirm-overlay" });
    const box = make("div", {
      class: "confirm-box cloud-wizard-box",
      role:  "dialog",
      "aria-modal": "true",
      "aria-label": "Add Remote Library Source",
    });

    const close = () => {
      document.removeEventListener("keydown", onKeydown, { capture: true });
      overlay.classList.remove("confirm-overlay--visible");
      setTimeout(() => overlay.remove(), OVERLAY_FADE_DELAY_MS);
      resolve();
    };
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); close(); }
    };
    document.addEventListener("keydown", onKeydown, { capture: true });
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

    const renderStep1 = () => {
      box.innerHTML = "";
      const titleId = cloudWizardHeadingId();
      box.setAttribute("aria-labelledby", titleId);
      box.appendChild(make("h3", { id: titleId, class: "confirm-box__title" }, "Add Remote Library"));
      box.appendChild(make("p", { class: "confirm-box__body" },
        "Choose where RetroOasis should look for remote games. They will appear beside local games after indexing."
      ));

      const grid = make("div", { class: "cloud-provider-grid" });
      for (const p of CLOUD_LIBRARY_PROVIDERS) {
        const card = make("button", {
          class: "cloud-provider-card",
          type:  "button",
          "aria-label": `${p.label} remote library source`,
        }) as HTMLButtonElement;
        card.appendChild(cloudProviderPickerIconEl(p.id));
        card.appendChild(make("span", { class: "cloud-provider-card__label" }, p.label));
        card.addEventListener("click", () => renderStep2(p.id));
        grid.appendChild(card);
      }
      box.appendChild(grid);

      const actions = make("div", { class: "confirm-box__actions" });
      const cancelBtn = make("button", { class: "btn" }, "Cancel") as HTMLButtonElement;
      cancelBtn.addEventListener("click", close);
      actions.appendChild(cancelBtn);
      box.appendChild(actions);
    };

    const renderStep2 = (providerId: string) => {
      box.innerHTML = "";
      const meta = CLOUD_LIBRARY_PROVIDERS.find(p => p.id === providerId);
      if (!meta) { close(); return; }
      const stepTitleId = cloudWizardHeadingId();
      box.setAttribute("aria-labelledby", stepTitleId);
      box.appendChild(make("h3", { id: stepTitleId, class: "confirm-box__title" }, `${meta.label} remote library`));

      const form = make("div", { class: "cloud-wizard-form" });
      const nameInp = make("input", {
        type: "text",
        id: "cld-name",
        class: "settings-input",
        placeholder: `My ${meta.label} Library`,
        autocomplete: "off",
      }) as HTMLInputElement;
      appendCloudWizardLabeledField(form, "Display Name", nameInp, "display name");
      form.appendChild(make("p", { class: "settings-help" }, "This name will appear in your library filters."));

      type LibCredResult = { ok: false; error: string } | { ok: true; config: CloudLibraryConnection["config"] };
      let getCredentials: () => LibCredResult = () => ({ ok: true, config: "{}" });

      if (providerId === "webdav" || providerId === "nextcloud") {
        const urlInp  = make("input", { type: "url", id: "cld-url", class: "settings-input", placeholder: providerId === "nextcloud" ? "https://nextcloud.example.com" : "https://dav.example.com/roms", autocomplete: "off" }) as HTMLInputElement;
        const userInp = make("input", { type: "text", id: "cld-user", class: "settings-input", placeholder: "Username", autocomplete: "username" }) as HTMLInputElement;
        const passInp = make("input", { type: "password", id: "cld-pass", class: "settings-input", placeholder: "Password (or App Password)", autocomplete: "current-password" }) as HTMLInputElement;
        appendCloudWizardLabeledField(form, "Server URL", urlInp, "server URL");
        appendCloudWizardLabeledField(form, "Username", userInp, "username");
        appendCloudWizardLabeledField(form, "Password", passInp, "password");
        getCredentials = () => {
          const url  = urlInp.value.trim();
          const user = userInp.value.trim();
          const pass = passInp.value;
          if (!url)  return { ok: false, error: "Server URL is required." };
          if (!user) return { ok: false, error: "Username is required." };
          return { ok: true, config: JSON.stringify({ url, username: user, password: pass }) };
        };
      } else if (providerId === "pcloud") {
        const tokenInp = make("input", { type: "text", id: "cld-token", class: "settings-input", placeholder: "pCloud access token", autocomplete: "off" }) as HTMLInputElement;
        appendCloudWizardLabeledField(form, "Access Token", tokenInp, "access token");
        const regionRow = make("div", { class: "settings-input-row" });
        const regionSel = make("select", { id: "cld-region", class: "settings-input" }) as HTMLSelectElement;
        regionSel.appendChild(Object.assign(document.createElement("option"), { value: "us", textContent: "US" }));
        regionSel.appendChild(Object.assign(document.createElement("option"), { value: "eu", textContent: "EU" }));
        regionRow.append(make("label", { class: "settings-input-label", for: "cld-region" }, "Region"), regionSel);
        form.append(regionRow);
        getCredentials = () => {
          const token = tokenInp.value.trim();
          if (!token) return { ok: false, error: "Access token is required." };
          return { ok: true, config: JSON.stringify({ accessToken: token, region: regionSel.value }) };
        };
      } else if (providerId === "blomp") {
        const userInp = make("input", { type: "text", id: "cld-user", class: "settings-input", placeholder: "Blomp username", autocomplete: "username" }) as HTMLInputElement;
        const passInp = make("input", { type: "password", id: "cld-pass", class: "settings-input", placeholder: "Password", autocomplete: "current-password" }) as HTMLInputElement;
        const containerInp = make("input", { type: "text", id: "cld-container", class: "settings-input", placeholder: "retrooasis", autocomplete: "off" }) as HTMLInputElement;
        appendCloudWizardLabeledField(form, "Username", userInp, "username");
        appendCloudWizardLabeledField(form, "Password", passInp, "password");
        appendCloudWizardLabeledField(form, "Container (optional)", containerInp, "container name");
        getCredentials = () => {
          const user = userInp.value.trim();
          if (!user) return { ok: false, error: "Username is required." };
          return { ok: true, config: JSON.stringify({ username: user, password: passInp.value, container: containerInp.value.trim() || "retrooasis" }) };
        };
      } else if (providerId === "onedrive") {
        const tokenInp = make("input", { type: "text", id: "cld-token", class: "settings-input", placeholder: "OneDrive access token", autocomplete: "off" }) as HTMLInputElement;
        const rootInp = make("input", { type: "text", id: "cld-rootid", class: "settings-input", placeholder: "root (optional)", autocomplete: "off" }) as HTMLInputElement;
        appendCloudWizardLabeledField(form, "Access Token", tokenInp, "access token");
        appendCloudWizardLabeledField(form, "Root Folder ID (optional)", rootInp, "root folder ID");
        getCredentials = () => {
          const token = tokenInp.value.trim();
          if (!token) return { ok: false, error: "Access token is required." };
          return { ok: true, config: JSON.stringify({ accessToken: token, rootId: rootInp.value.trim() || undefined }) };
        };
      } else if (providerId === "box") {
        const tokenInp = make("input", { type: "text", id: "cld-token", class: "settings-input", placeholder: "Box OAuth access token", autocomplete: "off" }) as HTMLInputElement;
        const folderInp = make("input", { type: "text", id: "cld-folder", class: "settings-input", placeholder: "0 (root)", autocomplete: "off" }) as HTMLInputElement;
        appendCloudWizardLabeledField(form, "Access Token", tokenInp, "access token");
        appendCloudWizardLabeledField(form, "Root Folder ID (optional)", folderInp, "folder ID");
        getCredentials = () => {
          const token = tokenInp.value.trim();
          if (!token) return { ok: false, error: "Access token is required." };
          return { ok: true, config: JSON.stringify({ accessToken: token, rootFolderId: folderInp.value.trim() || "0" }) };
        };
      } else if (providerId === "mega") {
        const emailInp = make("input", { type: "email", id: "cld-email", class: "settings-input", placeholder: "MEGA email address", autocomplete: "email" }) as HTMLInputElement;
        const passInp = make("input", { type: "password", id: "cld-pass", class: "settings-input", placeholder: "Password", autocomplete: "current-password" }) as HTMLInputElement;
        appendCloudWizardLabeledField(form, "Email", emailInp, "email");
        appendCloudWizardLabeledField(form, "Password", passInp, "password");
        getCredentials = () => {
          const email = emailInp.value.trim();
          const pass  = passInp.value;
          if (!email) return { ok: false, error: "Email is required." };
          if (!pass)  return { ok: false, error: "Password is required." };
          return { ok: true, config: JSON.stringify({ megaEmail: email, megaPassword: pass }) };
        };
      } else {
        const tokenInp = make("input", { type: "text", id: "cld-token", class: "settings-input", placeholder: `${meta.label} access token`, autocomplete: "off" }) as HTMLInputElement;
        appendOAuthSignInButton({ providerId, providerLabel: meta.label, container: form, tokenInput: tokenInp, getErrorEl: () => errorMsg });
        appendCloudWizardLabeledField(form, "Access Token", tokenInp, "access token");
        getCredentials = () => {
          const token = tokenInp.value.trim();
          if (!token) return { ok: false, error: "Access token is required." };
          return { ok: true, config: JSON.stringify({ accessToken: token }) };
        };
      }

      box.appendChild(form);
      const errorMsg = make("p", { class: "cloud-wizard-error", "aria-live": "assertive" });
      errorMsg.hidden = true;
      box.appendChild(errorMsg);

      const actions = make("div", { class: "confirm-box__actions" });
      const backBtn = make("button", { class: "btn" }, "← Back") as HTMLButtonElement;
      const saveBtn = make("button", { class: "btn btn--primary" }, "Add Source") as HTMLButtonElement;
      actions.append(backBtn, saveBtn);
      box.appendChild(actions);

      backBtn.addEventListener("click", () => renderStep1());
      saveBtn.addEventListener("click", () => {
        void (async () => {
          const creds = getCredentials();
          if (!creds.ok) { errorMsg.textContent = creds.error; errorMsg.hidden = false; return; }
          errorMsg.hidden = true;
          const probe = createProvider({ provider: providerId as CloudLibraryConnection["provider"], config: creds.config });
          if (!probe) { errorMsg.textContent = "Those details could not be assembled into a valid connection."; errorMsg.hidden = false; return; }

          saveBtn.disabled = true;
          saveBtn.textContent = "Verifying…";
          try {
            if (!(await probe.isAvailable())) {
              errorMsg.textContent = "Cannot reach this provider right now. Check the URL or token.";
              errorMsg.hidden = false;
              return;
            }
            const newConn: CloudLibraryConnection = {
              id: createUuid(),
              provider: providerId as CloudLibraryConnection["provider"],
              name: nameInp.value.trim() || meta.label,
              enabled: true,
              config: creds.config,
            };
            onSettingsChange({ cloudLibraries: [...settings.cloudLibraries, newConn] });
            rebuildTab();
            close();
          } catch (e) {
            errorMsg.textContent = e instanceof Error ? e.message : "Could not verify this connection.";
            errorMsg.hidden = false;
          } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = "Add Source";
          }
        })();
      });
    };

    renderStep1();
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("confirm-overlay--visible"));
  });
}

const _cloudLibrarySyncConnIds = new Set<string>();

async function syncCloudLibrary(
  conn: CloudLibraryConnection,
  library: GameLibrary,
  syncTrigger?: HTMLButtonElement,
): Promise<void> {
  if (_cloudLibrarySyncConnIds.has(conn.id)) return;
  _cloudLibrarySyncConnIds.add(conn.id);

  const provider = createProvider(conn);
  if (!provider) {
    _cloudLibrarySyncConnIds.delete(conn.id);
    showError("This connection is missing required fields. Edit or remove it and add the source again.");
    return;
  }

  if (syncTrigger) {
    syncTrigger.disabled = true;
    syncTrigger.setAttribute("aria-busy", "true");
    syncTrigger.classList.add("is-loading");
    syncTrigger.textContent = "Syncing...";
  }

  showLoadingOverlay();
  setLoadingMessage(`Syncing ${conn.name}…`);
  try {
    if (!(await provider.isAvailable())) {
      throw new Error("Could not reach this provider. Check the network, token expiry, or reconnect the source in Settings → Cloud Library.");
    }
    setLoadingSubtitle("Scanning root folder for playable files…");
    const files = await provider.listFiles();
    const romFiles = files.filter((f) => !f.isDirectory && detectSystem(f.name));
    setLoadingSubtitle(`Found ${romFiles.length} matching file(s). Updating library…`);

    for (const f of romFiles) {
      const res = detectSystem(f.name);
      if (res) {
        const sys = Array.isArray(res) ? res[0] : res;
        if (!sys) continue;
        await library.upsertVirtualGame(f.name.replace(/\.[^.]+$/, ""), f.name, sys.id, f.size, conn.id, f.path, f.thumbnailUrl);
      }
    }

    if (romFiles.length === 0) {
      showInfoToast(`Connected to ${conn.name}, but no supported ROM extensions were found in the root folder.`, "info");
    } else {
      showInfoToast(`Synced ${romFiles.length} game file(s) from ${conn.name}.`, "success");
    }
    document.dispatchEvent(new CustomEvent(LEGACY_EVENTS.libraryCatalogNeedsRefresh));
  } catch (error: unknown) {
    showError(error instanceof Error ? error.message : "Remote library sync failed.");
  } finally {
    _cloudLibrarySyncConnIds.delete(conn.id);
    hideLoadingOverlay();
    if (syncTrigger) {
      syncTrigger.disabled = false;
      syncTrigger.removeAttribute("aria-busy");
      syncTrigger.classList.remove("is-loading");
      syncTrigger.textContent = "Sync";
    }
  }
}

function buildProfileSection(
  settings: Settings,
  onSettingsChange: (patch: Partial<Settings>) => void,
  apiKeyStore: ApiKeyStore | undefined,
  appName: string,
  rebuildTab: () => void,
): HTMLElement {
  const profileHeadingId = "settings-cloud-profile-heading";
  const section = make("div", {
    class: "cloud-library-section",
    role: "region",
    "aria-labelledby": profileHeadingId,
  });
  section.appendChild(make("h5", { class: "cloud-library-section__title", id: profileHeadingId }, "Profiles"));
  section.appendChild(make("p", { class: "settings-help" },
    `Switch between saved bundles of cloud sources, API keys, OAuth app IDs, and save-sync credentials. ` +
    `Changes auto-save to the active profile every few seconds.`));

  if (!apiKeyStore) {
    section.appendChild(make("p", { class: "settings-help", role: "status" }, "Profile storage is unavailable."));
    return section;
  }

  const pm = getProfileManager();
  const deps = { settings, apiKeyStore, onSettingsChange };
  pm.ensureInitialized(deps);

  const switchRow = make("div", { class: "settings-input-row profile-switch-row" });
  const profileSel = make("select", {
    id: "profile-active-select",
    class: "settings-input",
    "aria-label": "Active profile",
  }) as HTMLSelectElement;

  const refreshProfileSelect = () => {
    const prev = profileSel.value;
    profileSel.innerHTML = "";
    for (const meta of pm.listProfiles()) {
      const opt = Object.assign(document.createElement("option"), {
        value: meta.id,
        textContent: meta.name,
      });
      profileSel.appendChild(opt);
    }
    profileSel.value = pm.getActiveProfileId();
    if (!profileSel.value && prev) profileSel.value = prev;
    refreshColorSwatches();
  };

  const colorRow = make("div", { class: "settings-input-row profile-color-row" });
  colorRow.append(make("span", { class: "settings-input-label" }, "Profile color"));
  const swatchWrap = make("div", { class: "profile-color-swatches", role: "group", "aria-label": "Profile color" });
  colorRow.appendChild(swatchWrap);

  const refreshColorSwatches = () => {
    swatchWrap.innerHTML = "";
    const activeColor = pm.getProfileColor(profileSel.value || pm.getActiveProfileId());
    for (const color of PROFILE_COLOR_PRESETS) {
      const swatch = make("button", {
        type: "button",
        class: `profile-color-swatch${color === activeColor ? " profile-color-swatch--active" : ""}`,
        title: `Use ${color}`,
        "aria-label": `Profile color ${color}`,
        "aria-pressed": color === activeColor ? "true" : "false",
        style: `background-color:${color}`,
      }) as HTMLButtonElement;
      swatch.addEventListener("click", () => {
        const targetId = profileSel.value || pm.getActiveProfileId();
        pm.setProfileColor(targetId, color);
        refreshColorSwatches();
      });
      swatchWrap.appendChild(swatch);
    }
  };
  refreshProfileSelect();

  profileSel.addEventListener("change", () => {
    void (async () => {
      const id = profileSel.value;
      const previousId = pm.getActiveProfileId();
      refreshColorSwatches();
      if (!id || id === previousId) return;
      profileSel.disabled = true;
      const ok = await pm.switchProfile(id, deps);
      profileSel.disabled = false;
      if (ok) {
        renameInp.value = pm.getActiveProfileName();
        refreshColorSwatches();
        showInfoToast(`Switched to profile "${pm.getActiveProfileName()}".`, "success");
        rebuildTab();
      } else {
        profileSel.value = previousId;
        refreshColorSwatches();
        showError("Could not switch profile. Try again.");
      }
    })();
  });

  switchRow.append(
    make("label", { class: "settings-input-label", for: "profile-active-select" }, "Active profile"),
    profileSel,
  );
  section.appendChild(switchRow);

  const renameInp = make("input", {
    type: "text",
    id: "profile-rename-input",
    class: "settings-input",
    value: pm.getActiveProfileName(),
    autocomplete: "off",
    "aria-label": "Rename active profile",
  }) as HTMLInputElement;

  const renameBtn = make("button", { class: "btn btn--sm", type: "button" }, "Rename") as HTMLButtonElement;
  renameBtn.addEventListener("click", () => {
    pm.renameActiveProfile(renameInp.value);
    refreshProfileSelect();
    renameInp.value = pm.getActiveProfileName();
    showInfoToast("Profile renamed.", "success");
  });

  const newBtn = make("button", { class: "btn btn--sm", type: "button" }, "New profile") as HTMLButtonElement;
  newBtn.addEventListener("click", () => {
    const created = pm.createProfile(`Profile ${pm.listProfiles().length + 1}`, deps);
    refreshProfileSelect();
    renameInp.value = created.name;
    showInfoToast(`Created profile "${created.name}".`, "success");
    rebuildTab();
  });

  const deleteBtn = make("button", { class: "btn btn--sm btn--danger", type: "button" }, "Delete") as HTMLButtonElement;
  deleteBtn.addEventListener("click", () => {
    const id = pm.getActiveProfileId();
    if (!pm.deleteProfile(id, deps)) {
      showError("Keep at least one profile.");
      return;
    }
    refreshProfileSelect();
    renameInp.value = pm.getActiveProfileName();
    deleteBtn.disabled = pm.listProfiles().length <= 1;
    showInfoToast("Profile deleted.", "success");
    rebuildTab();
  });
  if (pm.listProfiles().length <= 1) deleteBtn.disabled = true;

  const manageRow = make("div", { class: "settings-input-row profile-manage-row" });
  manageRow.append(
    make("label", { class: "settings-input-label", for: "profile-rename-input" }, "Profile name"),
    renameInp,
    renameBtn,
    newBtn,
    deleteBtn,
  );
  section.appendChild(manageRow);
  section.appendChild(colorRow);

  const filterRow = make("div", { class: "settings-input-row profile-filter-row" });
  const filterToggle = make("input", {
    type: "checkbox",
    id: "profile-library-filter",
    class: "settings-toggle",
    ...(settings.profileLibraryFilter ? { checked: "" } : {}),
  }) as HTMLInputElement;
  filterToggle.addEventListener("change", () => {
    onSettingsChange({ profileLibraryFilter: filterToggle.checked });
    document.dispatchEvent(new CustomEvent(LEGACY_EVENTS.libraryCatalogNeedsRefresh));
  });
  filterRow.append(
    filterToggle,
    make("label", { class: "settings-input-label", for: "profile-library-filter" },
      "Filter library to active profile (plus shared untagged games)"),
  );
  section.appendChild(filterRow);

  const downloadProfileFile = (contents: string, baseName: string, extension: string) => {
    const blob = new Blob([contents], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${baseName.replace(/\s+/g, "-").toLowerCase() || "retrooasis-profile"}.${extension}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportBtn = make("button", { class: "btn btn--sm", type: "button" }, "Export JSON") as HTMLButtonElement;
  exportBtn.addEventListener("click", () => {
    void (async () => {
      const profileId = profileSel.value || pm.getActiveProfileId();
      const confirmed = await showConfirmDialog(
        "This file contains API keys, cloud tokens, and OAuth app IDs. " +
        "Anyone with the file can access your connected services. Store it securely and do not share it publicly.",
        { title: "Export profile?", confirmLabel: "Export" },
      );
      if (!confirmed) return;
      const snapshot = pm.exportProfileSnapshot(profileId, deps);
      if (!snapshot) { showError("Could not export the selected profile."); return; }
      downloadProfileFile(serializeProfileSnapshot(snapshot), snapshot.name, "json");
      showInfoToast("Profile exported.", "success");
    })();
  });

  const exportEncryptedBtn = make("button", { class: "btn btn--sm", type: "button" }, "Export encrypted") as HTMLButtonElement;
  exportEncryptedBtn.addEventListener("click", () => {
    void (async () => {
      const profileId = profileSel.value || pm.getActiveProfileId();
      const passphrase = await showPassphraseDialog({
        title: "Encrypt profile export",
        body: "Choose a passphrase. You will need it to import this file on another device.",
        confirmLabel: "Encrypt & export",
        requireConfirm: true,
      });
      if (!passphrase) return;
      const snapshot = pm.exportProfileSnapshot(profileId, deps);
      if (!snapshot) { showError("Could not export the selected profile."); return; }
      try {
        const encrypted = await encryptProfileExport(serializeProfileSnapshot(snapshot), passphrase);
        downloadProfileFile(encrypted, snapshot.name, "retroprofile");
        showInfoToast("Encrypted profile exported.", "success");
      } catch (err) {
        showError(err instanceof Error ? err.message : "Encryption failed.");
      }
    })();
  });

  const importInput = make("input", {
    type: "file",
    accept: "application/json,.json,.retroprofile",
    "aria-label": "Import profile file",
    style: "display:none",
  }) as HTMLInputElement;

  const requestDecryptPassphrase = () =>
    showPassphraseDialog({
      title: "Decrypt profile",
      body: "This file is encrypted. Enter the passphrase used when it was exported.",
      confirmLabel: "Decrypt",
    });

  const applyImportedProfile = async (
    parsed: import("../../profileSnapshot.js").ProfileSnapshotV1,
    mode: "new" | "merge",
  ) => {
    if (mode === "merge") {
      const mergeConfirmed = await showConfirmDialog(
        `Replace the active profile "${pm.getActiveProfileName()}" with the imported cloud connections, API keys, and save-sync credentials? ` +
        "Your current profile name will be kept.",
        { title: "Merge into active profile?", confirmLabel: "Merge", isDanger: true },
      );
      if (!mergeConfirmed) return;
      pm.importSnapshotIntoActive(parsed, deps);
      renameInp.value = pm.getActiveProfileName();
      showInfoToast(`Merged imported settings into "${pm.getActiveProfileName()}".`, "success");
    } else {
      const meta = pm.importSnapshotAsNewProfile(parsed, deps);
      refreshProfileSelect();
      renameInp.value = meta.name;
      showInfoToast(`Imported profile "${meta.name}".`, "success");
    }
    rebuildTab();
  };

  const handleProfileImport = (mode: "new" | "merge") => {
    void (async () => {
      const file = importInput.files?.[0];
      importInput.value = "";
      if (!file) return;
      const text = await file.text();
      const parsed = await parseProfileImportPayload(text, requestDecryptPassphrase);
      if (typeof parsed === "string") { showError(parsed); return; }
      await applyImportedProfile(parsed, mode);
    })();
  };

  const shareCodeBtn = make("button", { class: "btn btn--sm", type: "button" }, "Create share code") as HTMLButtonElement;
  shareCodeBtn.addEventListener("click", () => {
    void (async () => {
      const profileId = profileSel.value || pm.getActiveProfileId();
      const passphrase = await showPassphraseDialog({
        title: "Encrypt share code",
        body: "Choose a passphrase. The other device will need it to import this share code.",
        confirmLabel: "Create code",
        requireConfirm: true,
      });
      if (!passphrase) return;
      const snapshot = pm.exportProfileSnapshot(profileId, deps);
      if (!snapshot) { showError("Could not export the selected profile."); return; }
      try {
        const encrypted = await encryptProfileExport(serializeProfileSnapshot(snapshot), passphrase);
        const shareCode = encodeProfileSharePayload(encrypted);
        await showProfileShareDialog(shareCode);
      } catch (err) {
        showError(err instanceof Error ? err.message : "Could not create share code.");
      }
    })();
  });

  const importShareBtn = make("button", { class: "btn btn--sm", type: "button" }, "Import share code") as HTMLButtonElement;
  importShareBtn.addEventListener("click", () => {
    void (async () => {
      const code = await showProfileShareImportDialog();
      if (!code) return;
      const parsed = await parseProfileImportPayload(code, requestDecryptPassphrase);
      if (typeof parsed === "string") { showError(parsed); return; }
      await applyImportedProfile(parsed, "new");
    })();
  });

  const importNewBtn = make("button", { class: "btn btn--sm", type: "button" }, "Import as new") as HTMLButtonElement;
  importNewBtn.addEventListener("click", () => {
    importInput.onchange = () => handleProfileImport("new");
    importInput.click();
  });
  const importMergeBtn = make("button", { class: "btn btn--sm", type: "button" }, "Merge into active") as HTMLButtonElement;
  importMergeBtn.addEventListener("click", () => {
    importInput.onchange = () => handleProfileImport("merge");
    importInput.click();
  });

  const fileRow = make("div", { class: "settings-input-row profile-snapshot-actions" });
  fileRow.append(exportBtn, exportEncryptedBtn, shareCodeBtn, importNewBtn, importMergeBtn, importShareBtn, importInput);
  section.appendChild(fileRow);
  section.appendChild(make("p", { class: "settings-help" },
    "Export uses the profile selected above. Share codes are encrypted for copy/paste transfer between devices. " +
    "Import as new creates a separate slot; merge replaces credentials on the active profile."));

  const cloudSyncRow = make("div", { class: "settings-input-row profile-cloud-sync-row" });
  const pushCloudBtn = make("button", { class: "btn btn--sm", type: "button" }, "Upload to save sync") as HTMLButtonElement;
  const mergeCloudBtn = make("button", { class: "btn btn--sm", type: "button" }, "Merge from save sync") as HTMLButtonElement;
  const replaceCloudBtn = make("button", { class: "btn btn--sm btn--danger", type: "button" }, "Replace from save sync") as HTMLButtonElement;
  const cloudSyncHelp = make("p", { class: "settings-help" },
    canSyncProfilesViaCloudSave()
      ? "Back up all profile slots to your save-sync folder (WebDAV/Nextcloud)."
      : "Connect save sync via WebDAV or Nextcloud to back up profile slots to the cloud.");

  if (!canSyncProfilesViaCloudSave()) {
    pushCloudBtn.disabled = true;
    mergeCloudBtn.disabled = true;
    replaceCloudBtn.disabled = true;
  }

  pushCloudBtn.addEventListener("click", () => {
    void (async () => {
      pushCloudBtn.disabled = true;
      const err = await pushProfileIndexToCloud(pm.exportProfileIndexRaw());
      pushCloudBtn.disabled = false;
      if (err) showError(err);
      else showInfoToast("Profiles uploaded to save sync.", "success");
    })();
  });

  const downloadProfilesFromCloud = (mode: "merge" | "replace") => {
    void (async () => {
      if (mode === "replace") {
        const confirmed = await showConfirmDialog(
          "Replace all local profiles with the cloud copy?",
          { title: "Replace local profiles?", confirmLabel: "Replace", isDanger: true },
        );
        if (!confirmed) return;
      }
      mergeCloudBtn.disabled = true;
      replaceCloudBtn.disabled = true;
      const remote = await pullProfileIndexFromCloud();
      mergeCloudBtn.disabled = !canSyncProfilesViaCloudSave();
      replaceCloudBtn.disabled = !canSyncProfilesViaCloudSave();
      if (!remote) { showError("No profile backup found in save sync."); return; }
      const err = pm.importProfileIndexRaw(remote, mode, deps);
      if (err) showError(err);
      else {
        showInfoToast(mode === "merge" ? "Merged profiles from save sync." : "Replaced local profiles from save sync.", "success");
        rebuildTab();
      }
    })();
  };

  mergeCloudBtn.addEventListener("click", () => downloadProfilesFromCloud("merge"));
  replaceCloudBtn.addEventListener("click", () => downloadProfilesFromCloud("replace"));

  cloudSyncRow.append(pushCloudBtn, mergeCloudBtn, replaceCloudBtn);
  section.appendChild(cloudSyncRow);
  section.appendChild(cloudSyncHelp);

  void appName;
  return section;
}

export function buildCloudLibraryTab(
  container:        HTMLElement,
  settings:         Settings,
  library:          GameLibrary,
  onSettingsChange: (patch: Partial<Settings>) => void,
  appName?: string,
  apiKeyStore?: ApiKeyStore,
): void {
  const APP_NAME = appName ?? "RetroOasis";
  container.innerHTML = "";
  const netOffline = typeof navigator !== "undefined" && !navigator.onLine;
  const headingId = "settings-cloud-library-heading";
  const sourcesHeadingId = "settings-cloud-library-sources-heading";
  const oauthHeadingId = "settings-cloud-oauth-keys-heading";
  const oauthHelpId = "settings-cloud-oauth-keys-help";

  const section = make("div", {
    class: "settings-section",
    role: "region",
    "aria-labelledby": headingId,
  });
  section.appendChild(make("h4", { class: "settings-section__title", id: headingId }, "Cloud Library"));
  section.appendChild(make("p", { class: "settings-section__desc" },
    `Index remote ROM folders, import games into your local library, and manage cloud connections.`));

  const summary = make("p", { class: "cloud-storage-summary", role: "status", "aria-live": "polite" }, "Checking library status...");
  void library.getAllGamesMetadata().then((games) => {
    const remoteIndexed = games.filter(g => g.cloudId).length;
    const sourceCount = settings.cloudLibraries.length;
    summary.textContent =
      `${sourceCount} remote source${sourceCount === 1 ? "" : "s"} connected · ` +
      `${remoteIndexed} remote-indexed game${remoteIndexed === 1 ? "" : "s"}.`;
  }).catch(() => { summary.textContent = "Remote library status could not be read."; });
  section.appendChild(summary);

  const rebuildTab = () => buildCloudLibraryTab(container, settings, library, onSettingsChange, appName, apiKeyStore);

  const importerSection = make("div", { class: "cloud-library-section", role: "region", "aria-labelledby": "settings-cloud-import-heading" });
  importerSection.appendChild(make("h5", { class: "cloud-library-section__title", id: "settings-cloud-import-heading" }, "Import ROMs"));
  importerSection.appendChild(make("p", { class: "settings-help" },
    "Browse connected cloud folders and copy ROM files into your local IndexedDB library."));
  const importBtn = make("button", {
    class: "btn btn--primary",
    type: "button",
    "aria-label": "Open cloud ROM importer",
  }, "Import from cloud storage") as HTMLButtonElement;
  importBtn.addEventListener("click", () => {
    void showCloudRomImporterDialog({ settings, library, onComplete: () => rebuildTab() });
  });
  if (netOffline || settings.cloudLibraries.length === 0) {
    importBtn.disabled = true;
    importBtn.title = settings.cloudLibraries.length === 0
      ? "Add a remote library source first"
      : "Requires an internet connection";
  }
  importerSection.appendChild(importBtn);
  section.appendChild(importerSection);

  const list = make("div", { class: "cloud-connection-list" });
  const librarySection = make("div", { class: "cloud-library-section", role: "region", "aria-labelledby": sourcesHeadingId });
  librarySection.appendChild(make("h5", { class: "cloud-library-section__title", id: sourcesHeadingId }, "Remote Library Sources"));
  librarySection.appendChild(make("p", { class: "settings-help" },
    "Add a remote source to show supported games beside local ROMs. Sync indexes the root folder; use Import to browse subfolders."));

  if (settings.cloudLibraries.length === 0) {
    const empty = make("div", { class: "cloud-connection-empty" });
    empty.innerHTML = `<p>No remote library sources connected yet.</p><p>Add a source, then sync or import ROMs from cloud storage.</p>`;
    list.appendChild(empty);
  } else {
    settings.cloudLibraries.forEach((conn) => {
      const item = make("div", { class: "cloud-connection-item" });
      const info = make("div", { class: "cloud-connection-item__info" });
      info.appendChild(make("strong", {}, conn.name));
      const sourceMeta = make("span", {}, `${getCloudProviderLabel(conn.provider)} source`);
      info.appendChild(sourceMeta);
      void library.getAllGamesMetadata().then((games) => {
        const indexed = games.filter(g => g.cloudId === conn.id);
        const cached = indexed.filter(g => g.hasLocalBlob).length;
        sourceMeta.textContent = `${getCloudProviderLabel(conn.provider)} · ${indexed.length} indexed · ${cached} cached`;
      }).catch(() => { /* ignore */ });

      const statusDot = make("span", { class: "cloud-connection-item__status" }, "Checking...");
      info.appendChild(statusDot);
      const provider = createProvider(conn);
      if (provider) {
        provider.isAvailable().then(ok => {
          statusDot.textContent = ok ? "Ready" : "Unavailable";
          statusDot.className = `cloud-connection-item__status ${ok ? "status--online" : "status--offline"}`;
        }).catch(() => {
          statusDot.textContent = "Unavailable";
          statusDot.className = "cloud-connection-item__status status--offline";
        });
      } else {
        statusDot.textContent = "Config error";
        statusDot.className = "cloud-connection-item__status status--offline";
      }

      const actions = make("div", { class: "cloud-connection-item__actions" });
      const browseBtn = make("button", { class: "btn btn--sm", type: "button", "aria-label": `Import ROMs from ${conn.name}` }, "Import");
      browseBtn.addEventListener("click", () => {
        void showCloudRomImporterDialog({ settings, library, initialConnectionId: conn.id, onComplete: () => rebuildTab() });
      });
      const syncBtn = make("button", { class: "btn btn--sm", type: "button", "aria-label": `Sync remote games from ${conn.name}` }, "Sync");
      syncBtn.addEventListener("click", () => { void syncCloudLibrary(conn, library, syncBtn); });
      const removeBtn = make("button", { class: "btn btn--sm btn--danger", type: "button", "aria-label": `Remove ${conn.name}` }, "Remove");
      removeBtn.addEventListener("click", () => {
        onSettingsChange({ cloudLibraries: settings.cloudLibraries.filter(c => c.id !== conn.id) });
        rebuildTab();
      });
      if (netOffline) { browseBtn.disabled = true; syncBtn.disabled = true; }
      actions.append(browseBtn, syncBtn, removeBtn);
      item.append(info, actions);
      list.appendChild(item);
    });
  }

  const addBtn = make("button", { class: "btn btn--primary cloud-connection-add", type: "button", "aria-label": "Add remote library source" }, "Add remote library");
  addBtn.addEventListener("click", () => { void showAddCloudLibraryDialog(settings, onSettingsChange, rebuildTab); });
  if (netOffline) addBtn.disabled = true;
  librarySection.append(list, addBtn);
  section.appendChild(librarySection);

  const oauthSection = make("div", { class: "cloud-library-section", role: "region", "aria-labelledby": oauthHeadingId });
  oauthSection.appendChild(make("h5", { class: "cloud-library-section__title", id: oauthHeadingId }, "OAuth Apps (optional)"));
  oauthSection.appendChild(make("p", { class: "settings-help", id: oauthHelpId },
    "Paste your Google Client ID or Dropbox App Key to enable one-click sign-in when adding cloud sources."));

  const gIdInp = make("input", { type: "text", id: "oauth-google-client-id", class: "settings-input", placeholder: "Google OAuth Client ID", autocomplete: "off", "aria-describedby": oauthHelpId }) as HTMLInputElement;
  gIdInp.value = getGoogleClientId();
  const gIdPaste = make("button", { type: "button", class: "btn btn--ghost btn--sm", "aria-label": "Paste Google OAuth Client ID" }, "Paste") as HTMLButtonElement;
  gIdPaste.addEventListener("click", () => pasteIntoCloudWizardInput(gIdInp, "Google Client ID"));
  const gIdLine = make("div", { class: "settings-input-paste-line" });
  gIdLine.append(gIdInp, gIdPaste);

  const dbKeyInp = make("input", { type: "text", id: "oauth-dropbox-app-key", class: "settings-input", placeholder: "Dropbox App Key", autocomplete: "off", "aria-describedby": oauthHelpId }) as HTMLInputElement;
  dbKeyInp.value = getDropboxAppKey();
  const dbKeyPaste = make("button", { type: "button", class: "btn btn--ghost btn--sm", "aria-label": "Paste Dropbox App Key" }, "Paste") as HTMLButtonElement;
  dbKeyPaste.addEventListener("click", () => pasteIntoCloudWizardInput(dbKeyInp, "Dropbox App Key"));
  const dbKeyLine = make("div", { class: "settings-input-paste-line" });
  dbKeyLine.append(dbKeyInp, dbKeyPaste);

  const profileDeps = apiKeyStore ? { settings, apiKeyStore, onSettingsChange } : null;
  const scheduleOAuthProfileSave = () => {
    if (!profileDeps) return;
    getProfileManager().scheduleAutoSave(profileDeps);
  };

  const oauthSaveBtn = make("button", { class: "btn btn--sm", type: "button" }, "Save OAuth apps") as HTMLButtonElement;
  const persistOAuthApps = () => {
    setGoogleClientId(gIdInp.value);
    setDropboxAppKey(dbKeyInp.value);
    scheduleOAuthProfileSave();
    oauthSaveBtn.textContent = "Saved";
    setTimeout(() => { oauthSaveBtn.textContent = "Save OAuth apps"; }, 1500);
  };
  oauthSaveBtn.addEventListener("click", persistOAuthApps);
  gIdInp.addEventListener("blur", scheduleOAuthProfileSave);
  dbKeyInp.addEventListener("blur", scheduleOAuthProfileSave);

  oauthSection.append(
    make("div", { class: "settings-input-row" }, make("label", { class: "settings-input-label", for: "oauth-google-client-id" }, "Google Client ID"), gIdLine),
    make("div", { class: "settings-input-row" }, make("label", { class: "settings-input-label", for: "oauth-dropbox-app-key" }, "Dropbox App Key"), dbKeyLine),
    oauthSaveBtn,
  );
  section.appendChild(oauthSection);
  section.appendChild(buildProfileSection(settings, onSettingsChange, apiKeyStore, APP_NAME, rebuildTab));
  container.appendChild(section);
}
