/**
 * play.spec.ts — E2E journey: Click a game card to start emulation.
 *
 * Flow:
 *   1. Drop a fake ROM to populate the library.
 *   2. Click the resulting game card.
 *   3. Verify the emulator canvas becomes visible.
 *   4. Verify Escape returns to library (EmulatorJS handles in-game controls).
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

  test("Escape returns to library directly (EmulatorJS handles in-game controls)", async ({ appPage: page }) => {
    await dropFakeRom(page, { fileName: "sonic.nes" });
    await expect(page.locator("#ejs-container")).toBeVisible({ timeout: 15_000 });

    // Escape now returns to library directly — no custom overlay menu
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.body.classList.contains("is-playing"), { timeout: 15_000 });

    await expect(
      page.locator("#landing")
    ).not.toHaveClass("hidden", { timeout: 10_000 });
  });
});
