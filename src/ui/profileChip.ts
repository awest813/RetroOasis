import { createElement as make } from "./dom.js";
import { getProfileManager, type ProfileApplyDeps } from "../profileManager.js";
import { showError, showInfoToast } from "./toasts.js";

export interface ProfileChipOpts {
  openCloudLibrarySettings: () => void;
  deps?: ProfileApplyDeps;
}

const MENU_ID = "header-profile-chip-menu";

let chipOpenSettings: (() => void) | null = null;
let chipDeps: ProfileApplyDeps | undefined;
let chipListenersInstalled = false;

function closeProfileChipMenu(): void {
  document.getElementById(MENU_ID)?.remove();
  document.getElementById("header-profile-chip")?.setAttribute("aria-expanded", "false");
}

function isProfileChipMenuOpen(): boolean {
  return document.getElementById(MENU_ID) !== null;
}

function openProfileChipMenu(chip: HTMLButtonElement): void {
  if (!chipDeps || !chipOpenSettings) return;
  closeProfileChipMenu();
  const pm = getProfileManager();
  const activeId = pm.getActiveProfileId();

  const menu = make("div", {
    id: MENU_ID,
    class: "profile-chip-menu",
    role: "menu",
    "aria-label": "Switch profile",
  });

  for (const meta of pm.listProfiles()) {
    const item = make("button", {
      type: "button",
      class: `profile-chip-menu__item${meta.id === activeId ? " profile-chip-menu__item--active" : ""}`,
      role: "menuitemradio",
      "aria-checked": meta.id === activeId ? "true" : "false",
    }) as HTMLButtonElement;
    const dot = make("span", {
      class: "profile-chip-menu__dot",
      style: `background-color:${pm.getProfileColor(meta.id)}`,
      "aria-hidden": "true",
    });
    item.append(dot, document.createTextNode(meta.name));
    item.addEventListener("click", () => {
      void (async () => {
        closeProfileChipMenu();
        if (meta.id === activeId) return;
        const ok = await pm.switchProfile(meta.id, chipDeps!);
        if (ok) showInfoToast(`Switched to profile "${meta.name}".`, "success");
        else showError("Could not switch profile. Try again.");
      })();
    });
    menu.appendChild(item);
  }

  const manage = make("button", {
    type: "button",
    class: "profile-chip-menu__manage",
    role: "menuitem",
  }, "Manage profiles…") as HTMLButtonElement;
  manage.addEventListener("click", () => {
    closeProfileChipMenu();
    chipOpenSettings?.();
  });
  menu.appendChild(manage);

  const rect = chip.getBoundingClientRect();
  menu.style.position = "fixed";
  menu.style.top = `${rect.bottom + 6}px`;
  menu.style.right = `${Math.max(8, window.innerWidth - rect.right)}px`;
  menu.style.zIndex = "10000";
  document.body.appendChild(menu);
  chip.setAttribute("aria-expanded", "true");
}

function ensureChipDismissListeners(): void {
  if (chipListenersInstalled) return;
  chipListenersInstalled = true;
  document.addEventListener("click", (e) => {
    const target = e.target as Node;
    if (document.getElementById("header-profile-chip")?.contains(target)) return;
    if (document.getElementById(MENU_ID)?.contains(target)) return;
    closeProfileChipMenu();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeProfileChipMenu();
  });
}

/** Insert or refresh the active-profile chip in the header actions row. */
export function refreshProfileHeaderChip(
  opts: ProfileChipOpts | (() => void),
): void {
  chipOpenSettings = typeof opts === "function" ? opts : opts.openCloudLibrarySettings;
  chipDeps = typeof opts === "function" ? undefined : opts.deps;
  ensureChipDismissListeners();

  const actions = document.getElementById("header-actions");
  if (!actions) return;

  const pm = getProfileManager();
  const name = pm.getActiveProfileName();
  const color = pm.getActiveProfileColor();
  const canQuickSwitch = Boolean(chipDeps) && pm.listProfiles().length > 1;

  let chip = document.getElementById("header-profile-chip") as HTMLButtonElement | null;

  if (!chip) {
    chip = make("button", {
      id: "header-profile-chip",
      class: "profile-chip btn btn--ghost btn--sm",
      type: "button",
    }) as HTMLButtonElement;
    chip.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!chipDeps || pm.listProfiles().length <= 1) {
        closeProfileChipMenu();
        chipOpenSettings?.();
        return;
      }
      if (isProfileChipMenuOpen()) {
        closeProfileChipMenu();
        return;
      }
      openProfileChipMenu(chip!);
    });
  }

  chip.innerHTML = "";
  const dotEl = make("span", { class: "profile-chip__dot", "aria-hidden": "true" });
  dotEl.style.backgroundColor = color;
  chip.append(
    dotEl,
    make("span", { class: "profile-chip__label" }, name),
  );
  if (canQuickSwitch) {
    chip.appendChild(make("span", { class: "profile-chip__caret", "aria-hidden": "true" }, "▾"));
  }

  chip.title = canQuickSwitch
    ? `Profile: ${name} — click to switch`
    : `Profile: ${name} — click to manage`;
  chip.setAttribute("aria-label", `Active profile: ${name}`);
  chip.setAttribute("aria-haspopup", canQuickSwitch ? "menu" : "false");
  if (!isProfileChipMenuOpen()) chip.setAttribute("aria-expanded", "false");

  const settingsAnchor = actions.querySelector<HTMLElement>("[aria-label='Open settings']");
  if (settingsAnchor) {
    actions.insertBefore(chip, settingsAnchor);
  } else if (!chip.isConnected) {
    actions.appendChild(chip);
  }
}

/** Test helper — reset module state between unit tests. */
export function resetProfileChipForTests(): void {
  closeProfileChipMenu();
  chipOpenSettings = null;
  chipDeps = undefined;
  chipListenersInstalled = false;
  document.getElementById("header-profile-chip")?.remove();
}
