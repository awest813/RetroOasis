import { createElement as make } from "./dom.js";
import { getProfileManager } from "../profileManager.js";

/** Insert or refresh the active-profile chip in the header actions row. */
export function refreshProfileHeaderChip(openCloudLibrarySettings: () => void): void {
  const actions = document.getElementById("header-actions");
  if (!actions) return;

  const pm = getProfileManager();
  const name = pm.getActiveProfileName();
  const color = pm.getActiveProfileColor();
  let chip = document.getElementById("header-profile-chip") as HTMLButtonElement | null;

  if (!chip) {
    chip = make("button", {
      id: "header-profile-chip",
      class: "profile-chip btn btn--ghost btn--sm",
      type: "button",
      title: "Switch cloud profile — opens Cloud Library settings",
      "aria-label": `Active profile: ${name}. Open Cloud Library settings.`,
    }) as HTMLButtonElement;
    chip.addEventListener("click", openCloudLibrarySettings);
    const dot = make("span", { class: "profile-chip__dot", "aria-hidden": "true" });
    const label = make("span", { class: "profile-chip__label" });
    chip.append(dot, label);
  }

  const dotEl = chip.querySelector<HTMLElement>(".profile-chip__dot");
  const labelEl = chip.querySelector<HTMLElement>(".profile-chip__label");
  if (dotEl) dotEl.style.backgroundColor = color;
  if (labelEl) labelEl.textContent = name;
  chip.title = `Profile: ${name} — click to manage`;
  chip.setAttribute("aria-label", `Active profile: ${name}. Open Cloud Library settings.`);

  const settingsAnchor = actions.querySelector<HTMLElement>("[aria-label='Open settings']");
  if (settingsAnchor) {
    actions.insertBefore(chip, settingsAnchor);
  } else if (!chip.isConnected) {
    actions.appendChild(chip);
  }
}
