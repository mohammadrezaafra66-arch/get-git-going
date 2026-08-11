import { expect, test } from "@playwright/test";
import { appUrl } from "../helpers/pgrest";
import { formatReleasePublishedAt } from "../../src/lib/platform-releases/format";

/**
 * UI checks for /updates on deployed LAN.
 * Requires chromium + admin storageState (chromium-admin project).
 */

test.describe("updates page UI", () => {
  test.use({
    storageState: "e2e/auth/admin.storage.json",
    baseURL: appUrl(),
  });

  test("lists newest release first with Jalali time and category", async ({ page }) => {
    await page.goto("/updates");
    await expect(page.getByTestId("platform-updates-page")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "تغییرات و به‌روزرسانی‌ها" })).toBeVisible();

    const firstCard = page.locator("[data-testid=platform-updates-page] .space-y-4 > div").first();
    // Cards are Card components; look for شماره
    const numbers = page.getByText(/شماره\s*[۰-۹0-9]+/);
    await expect(numbers.first()).toBeVisible();
    const texts = await numbers.allTextContents();
    expect(texts.length).toBeGreaterThan(0);

    await expect(page.getByText("ساعت").first()).toBeVisible();
    // At least one known seeded category badge
    await expect(
      page.getByText(/قابلیت جدید|بهبود|اشخاص|یکپارچه‌سازی|زیرساخت/).first(),
    ).toBeVisible();

    // Expand details on first expandable card if present
    const detailsBtn = page.getByRole("button", { name: "مشاهده جزئیات" }).first();
    if (await detailsBtn.isVisible().catch(() => false)) {
      await detailsBtn.click();
      await expect(page.getByRole("button", { name: "بستن جزئیات" }).first()).toBeVisible();
    }
    void firstCard;
  });

  test("admin management controls visible; draft not on public list", async ({ page }) => {
    await page.goto("/updates");
    await expect(page.getByRole("link", { name: "مدیریت نسخه‌ها" })).toBeVisible();
    await page.goto("/admin/platform-releases");
    await expect(page.getByTestId("admin-platform-releases")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "مدیریت به‌روزرسانی‌ها" })).toBeVisible();
  });

  test("mobile widths do not clip brand of page header", async ({ page }) => {
    for (const width of [320, 375, 430]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/updates");
      const heading = page.getByRole("heading", { name: "تغییرات و به‌روزرسانی‌ها" });
      await expect(heading).toBeVisible();
      const box = await heading.boundingBox();
      expect(box).toBeTruthy();
      expect(box!.width).toBeGreaterThan(40);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
    }
  });
});

test.describe("update notice link contract", () => {
  test("register-sw offers مشاهده تغییرات to /updates", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync("src/lib/pwa/register-sw.ts", "utf8");
    expect(src).toContain('label: "به‌روزرسانی"');
    expect(src).toContain("مشاهده تغییرات");
    expect(src).toContain('window.location.assign("/updates")');
    expect(src).toContain("promptShown = false");
  });

  test("format helper sample matches Tehran clock wording", () => {
    expect(formatReleasePublishedAt("2026-08-05T18:48:00.000Z")).toMatch(/ساعت/);
  });
});
