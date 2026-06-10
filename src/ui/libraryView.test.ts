import { describe, it, expect, beforeEach } from "vitest";
import { updateLibraryLandingState } from "./libraryView.js";

describe("updateLibraryLandingState", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="library-section">
        <div class="library-toolbar"></div>
        <div class="library-overview"></div>
        <div id="library-highlights"></div>
        <div id="library-continue-hero"></div>
        <div id="library-grid"></div>
        <div id="drop-zone"></div>
        <div id="onboarding"></div>
      </div>
      <span id="library-count"></span>
    `;
  });

  it("keeps onboarding visible when the library is empty", () => {
    const librarySection = document.getElementById("library-section")!;
    const onboarding = document.getElementById("onboarding")!;
    const dropZone = document.getElementById("drop-zone")!;
    const countEl = document.getElementById("library-count")!;

    updateLibraryLandingState({
      totalGames: 0,
      shownGames: 0,
      countEl,
      librarySectionEl: librarySection,
      dropZoneEl: dropZone,
      onboardingEl: onboarding,
    });

    expect(librarySection.classList.contains("hidden-section")).toBe(false);
    expect(onboarding.classList.contains("hidden-section")).toBe(false);
    expect(document.querySelector(".library-toolbar")?.classList.contains("hidden-section")).toBe(true);
    expect(dropZone.classList.contains("drop-zone--prominent")).toBe(true);
  });

  it("hides onboarding and shows browse chrome when games exist", () => {
    const librarySection = document.getElementById("library-section")!;
    const onboarding = document.getElementById("onboarding")!;
    const dropZone = document.getElementById("drop-zone")!;
    const countEl = document.getElementById("library-count")!;

    updateLibraryLandingState({
      totalGames: 3,
      shownGames: 3,
      countEl,
      librarySectionEl: librarySection,
      dropZoneEl: dropZone,
      onboardingEl: onboarding,
    });

    expect(onboarding.classList.contains("hidden-section")).toBe(true);
    expect(document.querySelector(".library-toolbar")?.classList.contains("hidden-section")).toBe(false);
    expect(dropZone.classList.contains("drop-zone--compact")).toBe(true);
    expect(countEl.textContent).toBe("3 games");
  });
});
