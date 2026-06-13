import { createElement as make } from "./dom.js";
import { ICON_SEARCH_SVG, ICON_USER_SVG } from "../chromeIcons.js";

const LIBRARY_BROWSE_SELECTORS = [
  ".library-toolbar",
  ".library-overview",
  "#library-highlights",
  "#library-grid",
] as const;

export function buildEmptySidebarMessage(): HTMLElement {
  return make("p", { class: "landing-sidebar__empty" },
    "Import a game to filter your library by platform.");
}

export function updateLibraryLandingState(opts: {
  totalGames: number;
  shownGames: number;
  countEl: HTMLElement;
  librarySectionEl: HTMLElement;
  dropZoneEl: HTMLElement;
  onboardingEl: HTMLElement | null;
  landingEl?: HTMLElement | null;
}): void {
  const { totalGames, shownGames, countEl, librarySectionEl, dropZoneEl, onboardingEl, landingEl } = opts;
  const isEmpty = totalGames === 0;

  landingEl?.classList.toggle("landing-empty", isEmpty);

  countEl.textContent = totalGames > 0
    ? `${totalGames} game${totalGames !== 1 ? "s" : ""}${shownGames !== totalGames ? ` · ${shownGames} shown` : ""}`
    : "";

  for (const selector of LIBRARY_BROWSE_SELECTORS) {
    librarySectionEl.querySelector(selector)?.classList.toggle("hidden-section", isEmpty);
  }

  dropZoneEl.classList.toggle("drop-zone--prominent", isEmpty);
  dropZoneEl.classList.toggle("drop-zone--compact", !isEmpty);

  const showOnboarding = isEmpty;
  if (onboardingEl) {
    onboardingEl.classList.toggle("hidden-section", !showOnboarding);
    onboardingEl.setAttribute("aria-hidden", String(!showOnboarding));
  }
}

export function buildFilteredLibraryEmptyState(opts: {
  searchQuery: string;
  activeSystemLabel: string;
  profileFilterActive?: boolean;
  backlogFilterActive?: boolean;
  profileName?: string;
  onReset(): void;
  onOpenProfileSettings?(): void;
}): HTMLElement {
  const {
    searchQuery,
    activeSystemLabel,
    profileFilterActive = false,
    backlogFilterActive = false,
    profileName = "",
    onReset,
    onOpenProfileSettings,
  } = opts;
  const empty = make("div", { class: "library-empty", role: "status", "aria-live": "polite" });
  const message = make("p");
  const hasSearch = searchQuery.trim().length > 0;

  if (backlogFilterActive && !hasSearch && !activeSystemLabel) {
    const label = profileName.trim() || "this profile";
    message.append(
      document.createTextNode(`No games in `),
      make("em", {}, label),
      document.createTextNode("'s backlog. Add games with the bookmark button on a game card, or reset filters to browse the full library."),
    );
  } else if (profileFilterActive && !hasSearch && !activeSystemLabel) {
    const label = profileName.trim() || "this profile";
    message.append(
      document.createTextNode(`No games tagged to `),
      make("em", {}, label),
      document.createTextNode(
        ". Import games while this profile is active, or turn off “Filter library to active profile” in Settings → Account → Profiles. Untagged games stay visible as shared library.",
      ),
    );
  } else if (hasSearch && activeSystemLabel) {
    message.append(
      document.createTextNode(`No ${activeSystemLabel} games match "`),
      make("em", {}, searchQuery),
      document.createTextNode('". Try a broader search, choose another system, or clear filters to see every game again.'),
    );
  } else if (hasSearch) {
    message.append(
      document.createTextNode('No games match "'),
      make("em", {}, searchQuery),
      document.createTextNode('". Try a broader search, choose another system, or clear filters to see every game again.'),
    );
  } else if (activeSystemLabel) {
    message.append(
      document.createTextNode("No games available for "),
      make("em", {}, activeSystemLabel),
      document.createTextNode(". Try a broader search, choose another system, or clear filters to see every game again."),
    );
  } else {
    message.textContent = "No games match your current filters. Try a broader search, choose another system, or clear filters to see every game again.";
  }

  const icon = make("div", { class: "library-empty__icon", "aria-hidden": "true" });
  icon.innerHTML = (profileFilterActive || backlogFilterActive) && !hasSearch && !activeSystemLabel ? ICON_USER_SVG : ICON_SEARCH_SVG;
  const actions = make("div", { class: "library-empty__actions" });
  if (profileFilterActive && onOpenProfileSettings) {
    const profileBtn = make("button", { class: "btn library-empty__profile", type: "button" }, "Profile settings");
    profileBtn.addEventListener("click", onOpenProfileSettings);
    actions.appendChild(profileBtn);
  }
  const resetBtn = make("button", { class: "btn library-empty__reset", type: "button" }, "Reset filters");
  resetBtn.addEventListener("click", onReset);
  actions.appendChild(resetBtn);
  empty.append(icon, message, actions);
  return empty;
}
