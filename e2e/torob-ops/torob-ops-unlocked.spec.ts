/**
 * Unlocked Torob Ops pages on :3100.
 * Requires TOROB_OPS_E2E_PASSWORD in the test env (never committed).
 * Assertions are page-body headings, not the lock-screen fallback.
 */
import { expect, test, type Page } from "@playwright/test";
import { lanEnv } from "../helpers/pgrest";
import { storageStateForRole } from "../helpers/role-session";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://192.168.170.8:3100";
const SUPABASE_URL = `http://192.168.170.8:${lanEnv().SUPABASE_API_PORT}`;
const MODULE_PASSWORD = process.env.TOROB_OPS_E2E_PASSWORD ?? "";

test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

test.use({
  storageState: storageStateForRole("admin", BASE_URL, SUPABASE_URL),
  baseURL: BASE_URL,
  locale: "fa-IR",
  timezoneId: "Asia/Tehran",
});

async function unlock(page: Page) {
  test.skip(!MODULE_PASSWORD, "TOROB_OPS_E2E_PASSWORD is not set");
  await page.goto("/torob-ops", { waitUntil: "domcontentloaded" });
  const gate = page.getByLabel("رمز ماژول");
  if (await gate.isVisible({ timeout: 8_000 }).catch(() => false)) {
    await gate.fill(MODULE_PASSWORD);
    await page.getByRole("button", { name: /^ورود$/ }).click();
  }
  await expect(page.getByRole("heading", { name: "عملیات ترب" })).toBeVisible({
    timeout: 20_000,
  });
}

test("settings heading is visible after unlock", async ({ page }) => {
  await unlock(page);
  await page.goto("/torob-ops/settings", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "تنظیمات عملیات ترب" })).toBeVisible({
    timeout: 20_000,
  });
});

test("runs page shows skip-reason copy, not only the gate", async ({ page }) => {
  await unlock(page);
  await page.goto("/torob-ops/runs", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "دستورهای اسکن ترب" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText("اگر یافته صفر باشد")).toBeVisible();
});

test("findings and history headings after unlock", async ({ page }) => {
  await unlock(page);
  await page.goto("/torob-ops/findings", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "صف بررسی یافته‌های ترب" })).toBeVisible({
    timeout: 20_000,
  });
  await page.goto("/torob-ops/history", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "تاریخچه قیمت ترب" })).toBeVisible({
    timeout: 20_000,
  });
});
