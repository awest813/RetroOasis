import { createElement as make } from "./dom.js";
import { getProfileManager, type ProfileApplyDeps } from "../profileManager.js";
import { showError, showInfoToast } from "./toasts.js";

export interface ProfileChipOpts {
  openAccountSettings: () => void;
  deps?: ProfileApplyDeps;
}

const MENU_ID = "header-profile-chip-menu";

let chipOpenSettings: (() => void) | null = null;
let chipDeps: ProfileApplyDeps | undefined;
let chipListenersInstalled = false;
let chipSwitching = false;

function closeProfileChipMenu(returnFocus = false): void {
  const chip = document.getElementById("header-profile-chip") as HTMLButtonElement | null;
  document.getElementById(MENU_ID)?.remove();
  chip?.setAttribute("aria-expanded", "false");
  if (returnFocus) chip?.focus();
}

function isProfileChipMenuOpen(): boolean {
  return document.getElementById(MENU_ID) !== null;
}

function focusMenuItem(items: HTMLButtonElement[], index: number): void {
  if (items.length === 0) return;
  const nextIndex = Math.max(0, Math.min(index, items.length - 1));
  const next = items[nextIndex]!;
  items.forEach((item, i) => { item.tabIndex = i === nextIndex ? 0 : -1; });
  next.focus();
}

function openProfileChipMenu(chip: HTMLButtonElement): void {
  if (!chipDeps || !chipOpenSettings || chipSwitching) return;
  closeProfileChipMenu();
  const pm = getProfileManager();
  const activeId = pm.getActiveProfileId();

  const menu = make("div", {
    id: MENU_ID,
    class: "profile-chip-menu",
    role: "menu",
    "aria-label": "Switch profile",
  });

  const menuItems: HTMLButtonElement[] = [];

  for (const meta of pm.listProfiles()) {
    const item = make("button", {
      type: "button",
      class: `profile-chip-menu__item${meta.id === activeId ? " profile-chip-menu__item--active" : ""}`,
      role: "menuitemradio",
      "aria-checked": meta.id === activeId ? "true" : "false",
      tabindex: meta.id === activeId ? "0" : "-1",
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
        if (meta.id === activeId || chipSwitching) return;
        chipSwitching = true;
        chip.setAttribute("aria-busy", "true");
        const result = await pm.switchProfile(meta.id, chipDeps!);
        chipSwitching = false;
        chip.removeAttribute("aria-busy");
        if (result === true) {
          showInfoToast(`Switched to profile "${meta.name}".`, "success");
          refreshProfileHeaderChip({ openAccountSettings: chipOpenSettings!, deps: chipDeps });
        } else if (result !== false) {
          showError(result);
        }
      })();
    });
    menu.appendChild(item);
    menuItems.push(item);
  }

  const manage = make("button", {
    type: "button",
    class: "profile-chip-menu__manage",
    role: "menuitem",
    tabindex: "-1",
  }, "Manage profiles…") as HTMLButtonElement;
  manage.addEventListener("click", () => {
    closeProfileChipMenu();
    chipOpenSettings?.();
  });
  menu.appendChild(manage);
  menuItems.push(manage);

  menu.addEventListener("keydown", (e) => {
    const currentIndex = menuItems.findIndex((item) => item === document.activeElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusMenuItem(menuItems, currentIndex < 0 ? 0 : currentIndex + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusMenuItem(menuItems, currentIndex < 0 ? menuItems.length - 1 : currentIndex - 1);
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeProfileChipMenu(true);
    } else if (e.key === "Home") {
      e.preventDefault();
      focusMenuItem(menuItems, 0);
    } else if (e.key === "End") {
      e.preventDefault();
      focusMenuItem(menuItems, menuItems.length - 1);
    }
  });

  const rect = chip.getBoundingClientRect();
  menu.style.position = "fixed";
  menu.style.top = `${rect.bottom + 6}px`;
  menu.style.right = `${Math.max(8, window.innerWidth - rect.right)}px`;
  menu.style.zIndex = "10000";
  document.body.appendChild(menu);
  chip.setAttribute("aria-expanded", "true");
  const activeIndex = Math.max(0, menuItems.findIndex((item) => item.getAttribute("aria-checked") === "true"));
  focusMenuItem(menuItems, activeIndex);
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
    if (e.key === "Escape" && isProfileChipMenuOpen()) {
      closeProfileChipMenu(true);
    }
  });
}

/** Insert or refresh the active-profile chip in the header actions row. */
export function refreshProfileHeaderChip(
  opts: ProfileChipOpts | (() => void),
): void {
  chipOpenSettings = typeof opts === "function" ? opts : opts.openAccountSettings;
  chipDeps = typeof opts === "function" ? undefined : opts.deps;
  ensureChipDismissListeners();

  const actions = document.getElementById("header-actions");
  if (!actions) return;

  const pm = getProfileManager();
  const name = pm.getActiveProfileName();
  const color = pm.getActiveProfileColor();
  const canOpenMenu = Boolean(chipDeps);
  const profileCount = pm.listProfiles().length;

  let chip = document.getElementById("header-profile-chip") as HTMLButtonElement | null;

  if (!chip) {
    chip = make("button", {
      id: "header-profile-chip",
      class: "profile-chip btn btn--ghost btn--sm",
      type: "button",
    }) as HTMLButtonElement;
    chip.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!chipDeps) {
        closeProfileChipMenu();
        chipOpenSettings?.();
        return;
      }
      if (isProfileChipMenuOpen()) {
        closeProfileChipMenu(true);
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
  if (canOpenMenu) {
    chip.appendChild(make("span", { class: "profile-chip__caret", "aria-hidden": "true" }, "▾"));
  }

  chip.title = canOpenMenu
    ? (profileCount > 1
      ? `Profile: ${name} — click to switch`
      : `Profile: ${name} — click for profile options`)
    : `Profile: ${name} — click to manage`;
  chip.setAttribute("aria-label", `Active profile: ${name}`);
  chip.setAttribute("aria-haspopup", canOpenMenu ? "menu" : "false");
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
  chipSwitching = false;
  document.getElementById("header-profile-chip")?.remove();
}
