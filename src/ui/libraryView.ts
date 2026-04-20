import { createElement as make } from "./dom.js";

export function updateLibraryLandingState(opts: {
  totalGames: number;
  shownGames: number;
  countEl: HTMLElement;
  librarySectionEl: HTMLElement;
  dropZoneEl: HTMLElement;
  onboardingEl: HTMLElement | null;
}): void {
  const { totalGames, shownGames, countEl, librarySectionEl, dropZoneEl, onboardingEl } = opts;

  countEl.textContent = totalGames > 0
    ? `${totalGames} game${totalGames !== 1 ? "s" : ""}${shownGames !== totalGames ? ` · ${shownGames} shown` : ""}`
    : "";

  librarySectionEl.classList.toggle("hidden-section", totalGames === 0);
  dropZoneEl.classList.toggle("drop-zone--prominent", totalGames === 0);
  dropZoneEl.classList.toggle("drop-zone--compact", totalGames > 0);

  const showOnboarding = totalGames === 0;
  if (onboardingEl) {
    onboardingEl.classList.toggle("hidden-section", !showOnboarding);
    onboardingEl.setAttribute("aria-hidden", String(!showOnboarding));
  }
}

export function buildFilteredLibraryEmptyState(opts: {
  searchQuery: string;
  activeSystemLabel: string;
  onReset(): void;
}): HTMLElement {
  const { searchQuery, activeSystemLabel, onReset } = opts;
  const empty = make("div", { class: "library-empty", role: "status", "aria-live": "polite" });
  const message = make("p");
  const hasSearch = searchQuery.trim().length > 0;

  if (hasSearch && activeSystemLabel) {
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

  const resetBtn = make("button", { class: "btn library-empty__reset", type: "button" }, "Reset filters");
  resetBtn.addEventListener("click", onReset);
  empty.append(message, resetBtn);
  return empty;
}
