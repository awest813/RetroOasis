/**
 * cloudRomImporter.ts — Browse cloud storage and import ROMs into the local library.
 */

import type { Settings, CloudLibraryConnection } from "../types/settings.js";
import type { GameLibrary } from "../library.js";
import { createProvider, downloadCloudFile, type CloudFile } from "../cloudLibrary.js";
import { detectSystem } from "../systems.js";
import { makeFileFromBlob } from "../blobUtils.js";
import { LEGACY_EVENTS } from "../legacy.js";
import { createElement as make } from "./dom.js";
import { showError, showInfoToast } from "./toasts.js";
import {
  showLoadingOverlay,
  hideLoadingOverlay,
  setLoadingMessage,
  setLoadingSubtitle,
} from "./loadingOverlay.js";
import {
  OVERLAY_FADE_DELAY_MS,
  getCloudProviderLabel,
} from "./tabs/cloudTabShared.js";

export interface CloudRomImporterOpts {
  settings: Settings;
  library: GameLibrary;
  /** Pre-select a connection when opened from a source row. */
  initialConnectionId?: string;
  onComplete?: () => void;
}

function isImportableRom(file: CloudFile): boolean {
  return !file.isDirectory && Boolean(detectSystem(file.name));
}

export function showCloudRomImporterDialog(opts: CloudRomImporterOpts): Promise<void> {
  const enabled = opts.settings.cloudLibraries.filter((c) => c.enabled);
  if (enabled.length === 0) {
    showError("Add a remote library source in Settings → Cloud Library first.");
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const overlay = make("div", { class: "confirm-overlay" });
    const box = make("div", {
      class: "confirm-box cloud-wizard-box cloud-rom-importer",
      role: "dialog",
      "aria-modal": "true",
      "aria-label": "Import ROMs from cloud storage",
    });

    let activeConn: CloudLibraryConnection =
      enabled.find((c) => c.id === opts.initialConnectionId) ?? enabled[0]!;
    let currentPath = "";
    const pathCrumbs: { name: string; path: string }[] = [];
    let listedFiles: CloudFile[] = [];
    const selected = new Set<string>();

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

    const errorEl = make("p", { class: "cloud-wizard-error", "aria-live": "assertive" });
    errorEl.hidden = true;

    const sourceRow = make("div", { class: "settings-input-row" });
    const sourceSel = make("select", {
      id: "cloud-import-source",
      class: "settings-input",
      "aria-label": "Cloud source",
    }) as HTMLSelectElement;
    for (const conn of enabled) {
      const opt = Object.assign(document.createElement("option"), {
        value: conn.id,
        textContent: `${conn.name} (${getCloudProviderLabel(conn.provider)})`,
      });
      sourceSel.appendChild(opt);
    }
    sourceSel.value = activeConn.id;
    sourceRow.append(
      make("label", { class: "settings-input-label", for: "cloud-import-source" }, "Source"),
      sourceSel,
    );

    const breadcrumb = make("nav", {
      class: "cloud-rom-importer__breadcrumb",
      "aria-label": "Folder path",
    });

    const fileList = make("div", {
      class: "cloud-rom-importer__list",
      role: "list",
      "aria-label": "Cloud files",
    });

    const actions = make("div", { class: "confirm-box__actions" });
    const cancelBtn = make("button", { class: "btn", type: "button" }, "Cancel") as HTMLButtonElement;
    const importBtn = make("button", {
      class: "btn btn--primary",
      type: "button",
      disabled: "true",
    }, "Import selected") as HTMLButtonElement;

    cancelBtn.addEventListener("click", close);

    const updateImportBtn = () => {
      importBtn.disabled = selected.size === 0;
      importBtn.textContent = selected.size > 0
        ? `Import ${selected.size} ROM${selected.size === 1 ? "" : "s"}`
        : "Import selected";
    };

    const renderBreadcrumb = () => {
      breadcrumb.innerHTML = "";
      const rootBtn = make("button", {
        class: "cloud-rom-importer__crumb btn btn--ghost btn--sm",
        type: "button",
      }, "Root") as HTMLButtonElement;
      rootBtn.addEventListener("click", () => {
        currentPath = "";
        pathCrumbs.length = 0;
        void refreshListing();
      });
      breadcrumb.appendChild(rootBtn);

      for (const crumb of pathCrumbs) {
        const segPath = crumb.path;
        const segBtn = make("button", {
          class: "cloud-rom-importer__crumb btn btn--ghost btn--sm",
          type: "button",
        }, crumb.name) as HTMLButtonElement;
        segBtn.addEventListener("click", () => {
          const idx = pathCrumbs.findIndex((c) => c.path === segPath);
          if (idx >= 0) pathCrumbs.splice(idx + 1);
          currentPath = segPath;
          void refreshListing();
        });
        breadcrumb.appendChild(make("span", { class: "cloud-rom-importer__sep", "aria-hidden": "true" }, "/"));
        breadcrumb.appendChild(segBtn);
      }
    };

    const renderListing = () => {
      fileList.innerHTML = "";
      updateImportBtn();

      const dirs = listedFiles.filter((f) => f.isDirectory).sort((a, b) => a.name.localeCompare(b.name));
      const roms = listedFiles.filter((f) => isImportableRom(f)).sort((a, b) => a.name.localeCompare(b.name));
      const other = listedFiles.filter((f) => !f.isDirectory && !isImportableRom(f));

      if (dirs.length === 0 && roms.length === 0 && other.length === 0) {
        fileList.appendChild(make("p", { class: "settings-help" }, "This folder is empty."));
        return;
      }

      for (const dir of dirs) {
        const row = make("button", {
          class: "cloud-rom-importer__row cloud-rom-importer__row--folder",
          type: "button",
        }) as HTMLButtonElement;
        row.append(
          make("span", { class: "cloud-rom-importer__folder-icon", "aria-hidden": "true" }, "📁"),
          make("span", { class: "cloud-rom-importer__name" }, dir.name),
        );
        row.addEventListener("click", () => {
          pathCrumbs.push({ name: dir.name, path: dir.path });
          currentPath = dir.path;
          void refreshListing();
        });
        fileList.appendChild(row);
      }

      for (const rom of roms) {
        const row = make("label", { class: "cloud-rom-importer__row cloud-rom-importer__row--rom" });
        const cb = make("input", {
          type: "checkbox",
          class: "cloud-rom-importer__check",
        }) as HTMLInputElement;
        cb.checked = selected.has(rom.path);
        cb.addEventListener("change", () => {
          if (cb.checked) selected.add(rom.path);
          else selected.delete(rom.path);
          updateImportBtn();
        });
        row.append(
          cb,
          make("span", { class: "cloud-rom-importer__name" }, rom.name),
        );
        fileList.appendChild(row);
      }

      if (other.length > 0 && roms.length === 0 && dirs.length === 0) {
        fileList.appendChild(make("p", { class: "settings-help" },
          "No supported ROM extensions in this folder. Open a subfolder or try another path."));
      }
    };

    const refreshListing = async () => {
      errorEl.hidden = true;
      fileList.textContent = "Loading…";
      renderBreadcrumb();

      const provider = createProvider(activeConn);
      if (!provider) {
        errorEl.textContent = "This connection is misconfigured. Edit it in Settings → Cloud Library.";
        errorEl.hidden = false;
        fileList.innerHTML = "";
        return;
      }

      try {
        if (!(await provider.isAvailable())) {
          throw new Error("Cannot reach this provider. Check your network or reconnect the source.");
        }
        listedFiles = await provider.listFiles(currentPath || undefined);
        renderListing();
      } catch (e) {
        errorEl.textContent = e instanceof Error ? e.message : "Could not list cloud files.";
        errorEl.hidden = false;
        fileList.innerHTML = "";
      }
    };

    sourceSel.addEventListener("change", () => {
      const next = enabled.find((c) => c.id === sourceSel.value);
      if (!next) return;
      activeConn = next;
      currentPath = "";
      pathCrumbs.length = 0;
      selected.clear();
      void refreshListing();
    });

    importBtn.addEventListener("click", () => {
      void (async () => {
        if (selected.size === 0) return;
        importBtn.disabled = true;
        importBtn.setAttribute("aria-busy", "true");
        showLoadingOverlay();
        setLoadingMessage("Importing from cloud…");

        let imported = 0;
        let skipped = 0;
        let duplicates = 0;
        const toImport = listedFiles.filter((f) => selected.has(f.path));

        for (let i = 0; i < toImport.length; i++) {
          const file = toImport[i]!;
          const detected = detectSystem(file.name);
          if (!detected) { skipped++; continue; }
          const sys = Array.isArray(detected) ? detected[0] : detected;
          if (!sys) { skipped++; continue; }

          const existing = await opts.library.findByFileName(file.name, sys.id);
          if (existing) { duplicates++; continue; }

          setLoadingSubtitle(`Downloading ${file.name} (${i + 1}/${toImport.length})…`);
          try {
            const blob = await downloadCloudFile(activeConn, file.path);
            const romFile = makeFileFromBlob(blob, file.name);
            await opts.library.addGame(romFile, sys.id);
            imported++;
          } catch (e) {
            showError(e instanceof Error ? e.message : `Failed to import ${file.name}`);
          }
        }

        hideLoadingOverlay();
        importBtn.removeAttribute("aria-busy");

        if (imported > 0) {
          document.dispatchEvent(new CustomEvent(LEGACY_EVENTS.libraryCatalogNeedsRefresh));
          const dupNote = duplicates > 0
            ? ` (${duplicates} already in library)`
            : "";
          showInfoToast(
            `Imported ${imported} game${imported === 1 ? "" : "s"} from ${activeConn.name}${dupNote}.`,
            "success",
          );
          opts.onComplete?.();
          close();
        } else {
          importBtn.disabled = false;
          updateImportBtn();
          if (duplicates > 0 && skipped === 0) {
            showError("Selected ROMs are already in your library.");
          } else if (skipped > 0) {
            showError("No files could be imported. Check that selected files are supported ROM types.");
          }
        }
      })();
    });

    box.append(
      make("h3", { class: "confirm-box__title" }, "Import ROMs from Cloud"),
      make("p", { class: "confirm-box__body" },
        "Browse your connected cloud storage, select ROM files, and copy them into your local library."),
      sourceRow,
      breadcrumb,
      fileList,
      errorEl,
      actions,
    );
    actions.append(cancelBtn, importBtn);

    overlay.appendChild(box);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("confirm-overlay--visible"));
    void refreshListing();
  });
}
