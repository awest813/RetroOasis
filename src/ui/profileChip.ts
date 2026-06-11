import { createElement as make } from "./dom.js";
import { getProfileManager } from "../profileManager.js";

/** Insert or refresh the active-profile chip in the header actions row. */
export function refreshProfileHeaderChip(openCloudLibrarySettings: () => void): void {
  const actions = document.getElementById("header-actions");
  if (!actions) return;

  const name = getProfileManager().getActiveProfileName();
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
  }

  chip.textContent = name;
  chip.title = `Profile: ${name} — click to manage`;
  chip.setAttribute("aria-label", `Active profile: ${name}. Open Cloud Library settings.`);

  const settingsAnchor = actions.querySelector<HTMLElement>("[aria-label='Open settings']");
  if (settingsAnchor) {
    actions.insertBefore(chip, settingsAnchor);
  } else if (!chip.isConnected) {
    actions.appendChild(chip);
  }
}
