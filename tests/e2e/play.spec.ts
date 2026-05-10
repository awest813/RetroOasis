/**
 * play.spec.ts — E2E journey: Click a game card to start emulation.
 *
 * Flow:
 *   1. Drop a fake ROM to populate the library.
 *   2. Click the resulting game card.
 *   3. Verify the emulator canvas becomes visible.
 *   4. Verify the in-game toolbar appears.
 *
 * EmulatorJS is stubbed — we only verify the DOM transitions, not real emulation.
 */

import { test, expect, dropFakeRom, dropFakeTarRom, dropFakeZipRom } from "./fixtures.js";

test.describe("Play journey", () => {
  test("emulator view appears after dropping a ROM", async ({ appPage: page }) => {
    await dropFakeRom(page, { fileName: "sonic.nes" });

    await expect(page.locator("#ejs-container")).toBeVisible({ timeout: 15_000 });
  });

  test("emulator view appears after dropping a ZIP archive containing a ROM", async ({ appPage: page }) => {
    await dropFakeZipRom(page, {
      archiveName: "nes-bundle.zip",
      romName: "archive-sonic.nes",
      content: "NES\x1a\x01\x01\x00\x00",
    });

    await expect(page.locator("#ejs-container")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".game-card, .library-game-card, [data-game-id]").first()).toContainText(
      /archive-sonic/i,
      { timeout: 10_000 },
    );
  });

  test("emulator view appears after dropping a TAR archive containing a ROM", async ({ appPage: page }) => {
    await dropFakeTarRom(page, {
      archiveName: "nes-bundle.tar",
      romName: "tar-sonic.nes",
      content: "NES\x1a\x01\x01\x00\x00",
    });

    await expect(page.locator("#ejs-container")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".game-card, .library-game-card, [data-game-id]").first()).toContainText(
      /tar-sonic/i,
      { timeout: 10_000 },
    );
  });

  test("Escape opens in-game menu; Back to Library returns to library", async ({ appPage: page }) => {
    await dropFakeRom(page, { fileName: "sonic.nes" });
    await expect(page.locator("#ejs-container")).toBeVisible({ timeout: 15_000 });

    // Immersive play hides the header; Escape opens the in-game menu (not an instant library exit).
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "In-Game Menu" })).toBeVisible({ timeout: 8_000 });
    await expect(page.locator(".ingame-menu__saves-grid")).toBeVisible({ timeout: 15_000 });

    await page
      .locator('.ingame-menu__sidebar-btn[data-tab="library"]')
      .evaluate((btn) => (btn as HTMLButtonElement).click());
    await page.waitForFunction(() => !document.body.classList.contains("is-playing"), { timeout: 15_000 });

    await expect(
      page.locator("#landing")
    ).not.toHaveClass("hidden", { timeout: 10_000 });
  });

  test("in-game menu actions are usable without duplicate sidebar entries", async ({ appPage: page }) => {
    test.setTimeout(60_000);
    await dropFakeRom(page, { fileName: "menu-audit.nes" });
    await expect(page.locator("#ejs-container")).toBeVisible({ timeout: 15_000 });

    // Header / #header-actions is hidden during immersive play (`body.is-playing`).
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "In-Game Menu" })).toBeVisible({ timeout: 8_000 });
    await expect(page.locator(".ingame-menu__saves-grid")).toBeVisible({ timeout: 15_000 });

    await expect(page.locator('.ingame-menu__sidebar-btn[data-tab="saves"]')).toHaveCount(1);
    await expect(page.locator('.ingame-menu__sidebar-btn[data-tab="settings"]')).toHaveCount(1);
    await expect(page.locator('.ingame-menu__sidebar-btn[data-tab="multiplayer"]')).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Quit game and return to library" })).toHaveCount(0);

    await page.locator('.ingame-menu__sidebar-btn[data-tab="settings"]').evaluate((btn) =>
      (btn as HTMLButtonElement).click()
    );
    await expect(page.getByLabel("Master Volume")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByLabel("Performance Profile")).toBeVisible({ timeout: 15_000 });

    await page.locator('.ingame-menu__sidebar-btn[data-tab="saves"]').evaluate((btn) =>
      (btn as HTMLButtonElement).click()
    );
    await expect(page.getByRole("button", { name: "Save to Slot 1" })).toBeVisible({ timeout: 15_000 });

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "In-Game Menu" })).toBeHidden();
  });
});
