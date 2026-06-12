/**
 * profileSection.ts — Settings → Cloud Library → Profiles UI.
 */

import { createElement as make } from "./dom.js";
import { showConfirmDialog } from "./modals.js";
import { showError, showInfoToast } from "./toasts.js";
import type { Settings } from "../types/settings.js";
import { LEGACY_EVENTS } from "../legacy.js";
import { serializeProfileSnapshot, type ProfileSnapshotV1 } from "../profileSnapshot.js";
import { encryptProfileExport } from "../profileCrypto.js";
import { encodeProfileSharePayload, parseProfileImportPayload } from "../profileShare.js";
import {
  canSyncProfilesViaCloudSave,
  profileCloudSyncProviderLabel,
  getProfileCloudSyncConfig,
  pushProfileIndexToCloud,
  pullProfileIndexFromCloud,
} from "../profileCloudSync.js";
import { PROFILE_COLOR_PRESETS } from "../profileColors.js";
import { getProfileManager, type ProfileApplyDeps, type ProfileManager } from "../profileManager.js";
import {
  showPassphraseDialog,
  showProfileShareDialog,
  showProfileShareImportDialog,
} from "./profileDialogs.js";
import type { ApiKeyStore } from "../apiKeyStore.js";

function selectedProfileId(sel: HTMLSelectElement, pm: ProfileManager): string {
  return sel.value || pm.getActiveProfileId();
}

function downloadProfileFile(contents: string, baseName: string, extension: string): void {
  const blob = new Blob([contents], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${baseName.replace(/\s+/g, "-").toLowerCase() || "retrooasis-profile"}.${extension}`;
  a.click();
  URL.revokeObjectURL(url);
}

export function buildProfileSection(
  settings: Settings,
  onSettingsChange: (patch: Partial<Settings>) => void,
  apiKeyStore: ApiKeyStore | undefined,
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
    "Switch between saved bundles of cloud sources, API keys, OAuth app IDs, and save-sync credentials. " +
    "Changes auto-save to the active profile every few seconds."));

  if (!apiKeyStore) {
    section.appendChild(make("p", { class: "settings-help", role: "status" }, "Profile storage is unavailable."));
    return section;
  }

  const pm = getProfileManager();
  const deps: ProfileApplyDeps = { settings, apiKeyStore, onSettingsChange };
  pm.ensureInitialized(deps);

  const profileSel = make("select", {
    id: "profile-active-select",
    class: "settings-input",
    "aria-label": "Active profile",
  }) as HTMLSelectElement;

  const renameInp = make("input", {
    type: "text",
    id: "profile-rename-input",
    class: "settings-input",
    value: pm.getActiveProfileName(),
    autocomplete: "off",
    "aria-label": "Rename active profile",
  }) as HTMLInputElement;
  const filterToggle = make("input", {
    type: "checkbox",
    id: "profile-library-filter",
    class: "settings-toggle",
    ...(settings.profileLibraryFilter ? { checked: "" } : {}),
  }) as HTMLInputElement;

  const swatchWrap = make("div", { class: "profile-color-swatches", role: "group", "aria-label": "Profile color" });

  const refreshColorSwatches = () => {
    swatchWrap.innerHTML = "";
    const id = selectedProfileId(profileSel, pm);
    const selectedColor = pm.getProfileColor(id);
    const isActive = id === pm.getActiveProfileId();
    for (const color of PROFILE_COLOR_PRESETS) {
      const swatch = make("button", {
        type: "button",
        class: `profile-color-swatch${color === selectedColor ? " profile-color-swatch--active" : ""}`,
        title: `Set color for ${isActive ? "active" : "selected"} profile`,
        "aria-label": `Profile color ${color}`,
        "aria-pressed": color === selectedColor ? "true" : "false",
        style: `background-color:${color}`,
      }) as HTMLButtonElement;
      swatch.addEventListener("click", () => {
        pm.setProfileColor(selectedProfileId(profileSel, pm), color);
        refreshColorSwatches();
      });
      swatchWrap.appendChild(swatch);
    }
  };

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
    filterToggle.checked = settings.profileLibraryFilter;
    refreshColorSwatches();
  };

  const exportSelectedSnapshot = () =>
    pm.exportProfileSnapshot(selectedProfileId(profileSel, pm), deps);

  const requestDecryptPassphrase = () =>
    showPassphraseDialog({
      title: "Decrypt profile",
      body: "This file is encrypted. Enter the passphrase used when it was exported.",
      confirmLabel: "Decrypt",
    });

  const applyImportedProfile = async (parsed: ProfileSnapshotV1, mode: "new" | "merge") => {
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
        showInfoToast(`Switched to profile "${pm.getActiveProfileName()}".`, "success");
        rebuildTab();
      } else {
        profileSel.value = previousId;
        refreshColorSwatches();
        showError("Could not switch profile. Try again.");
      }
    })();
  });

  const switchRow = make("div", { class: "settings-input-row profile-switch-row" });
  switchRow.append(
    make("label", { class: "settings-input-label", for: "profile-active-select" }, "Active profile"),
    profileSel,
  );
  section.appendChild(switchRow);

  const renameBtn = make("button", { class: "btn btn--sm", type: "button" }, "Rename") as HTMLButtonElement;
  renameBtn.addEventListener("click", () => {
    pm.renameActiveProfile(renameInp.value);
    refreshProfileSelect();
    renameInp.value = pm.getActiveProfileName();
    showInfoToast("Profile renamed.", "success");
  });

  const newBtn = make("button", { class: "btn btn--sm", type: "button" }, "New profile") as HTMLButtonElement;
  newBtn.addEventListener("click", () => {
    void (async () => {
      const confirmed = await showConfirmDialog(
        "Creates a new profile from your current cloud connections, API keys, and settings. " +
        "Existing profiles are not changed.",
        { title: "Create new profile?", confirmLabel: "Create" },
      );
      if (!confirmed) return;
      const created = pm.createProfile(`Profile ${pm.listProfiles().length + 1}`, deps);
      refreshProfileSelect();
      renameInp.value = created.name;
      showInfoToast(`Created profile "${created.name}".`, "success");
      rebuildTab();
    })();
  });

  const deleteBtn = make("button", { class: "btn btn--sm btn--danger", type: "button" }, "Delete") as HTMLButtonElement;
  deleteBtn.disabled = pm.listProfiles().length <= 1;
  deleteBtn.addEventListener("click", () => {
    if (!pm.deleteProfile(pm.getActiveProfileId(), deps)) {
      showError("Keep at least one profile.");
      return;
    }
    refreshProfileSelect();
    renameInp.value = pm.getActiveProfileName();
    deleteBtn.disabled = pm.listProfiles().length <= 1;
    showInfoToast("Profile deleted.", "success");
    rebuildTab();
  });

  const manageRow = make("div", { class: "settings-input-row profile-manage-row" });
  manageRow.append(
    make("label", { class: "settings-input-label", for: "profile-rename-input" }, "Profile name"),
    renameInp,
    renameBtn,
    newBtn,
    deleteBtn,
  );
  section.appendChild(manageRow);

  const colorRow = make("div", { class: "settings-input-row profile-color-row" });
  colorRow.append(make("span", { class: "settings-input-label" }, "Profile color"), swatchWrap);
  section.appendChild(colorRow);
  section.appendChild(make("p", { class: "settings-help" },
    "Color swatches apply to the profile selected above (active or not yet switched)."));

  filterToggle.addEventListener("change", () => {
    onSettingsChange({ profileLibraryFilter: filterToggle.checked });
    document.dispatchEvent(new CustomEvent(LEGACY_EVENTS.libraryCatalogNeedsRefresh));
  });
  const filterRow = make("div", { class: "settings-input-row profile-filter-row" });
  filterRow.append(
    filterToggle,
    make("label", { class: "settings-input-label", for: "profile-library-filter" },
      "Filter library to active profile (plus shared untagged games)"),
  );
  section.appendChild(filterRow);

  const exportBtn = make("button", { class: "btn btn--sm", type: "button" }, "Export JSON") as HTMLButtonElement;
  exportBtn.addEventListener("click", () => {
    void (async () => {
      const confirmed = await showConfirmDialog(
        "This file contains API keys, cloud tokens, and OAuth app IDs. " +
        "Anyone with the file can access your connected services. Store it securely and do not share it publicly.",
        { title: "Export profile?", confirmLabel: "Export" },
      );
      if (!confirmed) return;
      const snapshot = exportSelectedSnapshot();
      if (!snapshot) { showError("Could not export the selected profile."); return; }
      downloadProfileFile(serializeProfileSnapshot(snapshot), snapshot.name, "json");
      showInfoToast("Profile exported.", "success");
    })();
  });

  const exportEncryptedBtn = make("button", { class: "btn btn--sm", type: "button" }, "Export encrypted") as HTMLButtonElement;
  exportEncryptedBtn.addEventListener("click", () => {
    void (async () => {
      const passphrase = await showPassphraseDialog({
        title: "Encrypt profile export",
        body: "Choose a passphrase. You will need it to import this file on another device.",
        confirmLabel: "Encrypt & export",
        requireConfirm: true,
      });
      if (!passphrase) return;
      const snapshot = exportSelectedSnapshot();
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

  const handleProfileImport = (mode: "new" | "merge") => {
    void (async () => {
      const file = importInput.files?.[0];
      importInput.value = "";
      if (!file) return;
      const parsed = await parseProfileImportPayload(await file.text(), requestDecryptPassphrase);
      if (typeof parsed === "string") { showError(parsed); return; }
      await applyImportedProfile(parsed, mode);
    })();
  };

  const shareCodeBtn = make("button", { class: "btn btn--sm", type: "button" }, "Create share code") as HTMLButtonElement;
  shareCodeBtn.addEventListener("click", () => {
    void (async () => {
      const passphrase = await showPassphraseDialog({
        title: "Encrypt share code",
        body: "Choose a passphrase. The other device will need it to import this share code.",
        confirmLabel: "Create code",
        requireConfirm: true,
      });
      if (!passphrase) return;
      const snapshot = exportSelectedSnapshot();
      if (!snapshot) { showError("Could not export the selected profile."); return; }
      try {
        const encrypted = await encryptProfileExport(serializeProfileSnapshot(snapshot), passphrase);
        await showProfileShareDialog(encodeProfileSharePayload(encrypted));
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
      if (await showConfirmDialog(
        "Import this share code as a new profile slot?",
        { title: "Import share code", confirmLabel: "New profile" },
      )) {
        await applyImportedProfile(parsed, "new");
        return;
      }
      if (await showConfirmDialog(
        `Merge into the active profile "${pm.getActiveProfileName()}" instead?`,
        { title: "Merge into active profile?", confirmLabel: "Merge", isDanger: true },
      )) {
        await applyImportedProfile(parsed, "merge");
      }
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

  const cloudSyncEnabled = canSyncProfilesViaCloudSave();
  const pushCloudBtn = make("button", { class: "btn btn--sm", type: "button" }, "Upload to save sync") as HTMLButtonElement;
  const mergeCloudBtn = make("button", { class: "btn btn--sm", type: "button" }, "Merge from save sync") as HTMLButtonElement;
  const replaceCloudBtn = make("button", { class: "btn btn--sm btn--danger", type: "button" }, "Replace from save sync") as HTMLButtonElement;
  if (!cloudSyncEnabled) {
    pushCloudBtn.disabled = true;
    mergeCloudBtn.disabled = true;
    replaceCloudBtn.disabled = true;
  }

  pushCloudBtn.addEventListener("click", () => {
    void (async () => {
      pushCloudBtn.disabled = true;
      const persistErr = pm.flushAutoSave(deps);
      if (persistErr) {
        pushCloudBtn.disabled = false;
        showError(persistErr);
        return;
      }
      const err = await pushProfileIndexToCloud(pm.exportProfileIndexRaw());
      pushCloudBtn.disabled = false;
      if (err) showError(err);
      else showInfoToast("Profiles uploaded to save sync.", "success");
    })();
  });

  const downloadProfilesFromCloud = (mode: "merge" | "replace") => {
    void (async () => {
      if (mode === "replace" && !await showConfirmDialog(
        "Replace all local profiles with the cloud copy?",
        { title: "Replace local profiles?", confirmLabel: "Replace", isDanger: true },
      )) return;

      mergeCloudBtn.disabled = true;
      replaceCloudBtn.disabled = true;
      const remote = await pullProfileIndexFromCloud();
      mergeCloudBtn.disabled = !cloudSyncEnabled;
      replaceCloudBtn.disabled = !cloudSyncEnabled;
      if (!remote) { showError("No profile backup found in save sync."); return; }
      const err = pm.importProfileIndexRaw(remote, mode, deps);
      if (err) showError(err);
      else {
        showInfoToast(
          mode === "merge" ? "Merged profiles from save sync." : "Replaced local profiles from save sync.",
          "success",
        );
        rebuildTab();
      }
    })();
  };

  mergeCloudBtn.addEventListener("click", () => downloadProfilesFromCloud("merge"));
  replaceCloudBtn.addEventListener("click", () => downloadProfilesFromCloud("replace"));

  const syncLabel = profileCloudSyncProviderLabel(getProfileCloudSyncConfig());
  const cloudSyncRow = make("div", { class: "settings-input-row profile-cloud-sync-row" });
  cloudSyncRow.append(pushCloudBtn, mergeCloudBtn, replaceCloudBtn);
  section.appendChild(cloudSyncRow);
  section.appendChild(make("p", { class: "settings-help" },
    cloudSyncEnabled
      ? `Back up all profile slots to your ${syncLabel} save-sync folder. ` +
        "The upload includes API keys and save-sync credentials in plaintext — use only on storage you trust."
      : "Connect save sync (WebDAV, Nextcloud, Google Drive, or Dropbox) to back up profile slots."));

  return section;
}
