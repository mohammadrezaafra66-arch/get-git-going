/**
 * Direction A visual gates. Run after 3100 has feature/deals-design (G10).
 * Screenshots land under research/deals-design/after/.
 */
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { lanEnv } from "../helpers/pgrest";
import { storageStateForRole } from "../helpers/role-session";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://192.168.170.8:3100";
const SUPABASE_URL = `http://192.168.170.8:${lanEnv().SUPABASE_API_PORT}`;
const OUT = path.resolve("D:/AfraKalaTest/research/deals-design/after");

mkdirSync(OUT, { recursive: true });

async function dismiss(page: Page) {
  const seen = page.getByRole("button", { name: "دیدم" });
  for (let i = 0; i < 3; i += 1) {
    if (!(await seen.isVisible().catch(() => false))) break;
    await seen.click();
    await page.waitForTimeout(200);
  }
}

async function shot(page: Page, name: string, width: number) {
  await page.setViewportSize({ width, height: width >= 1024 ? 900 : 844 });
  await page.screenshot({
    path: path.join(OUT, `${name}-${width}.png`),
    animations: "disabled",
  });
}

test.describe("deals design visual A", () => {
  test.use({
    storageState: storageStateForRole("admin", BASE_URL, SUPABASE_URL),
    baseURL: BASE_URL,
  });
  test.setTimeout(180_000);

  test("kanban list detail create have deal-surface", async ({ page }) => {
    await page.goto("/deal", { waitUntil: "domcontentloaded" });
    await dismiss(page);
    await expect(page.locator(".deal-surface").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "افزودن معامله" })).toBeVisible();
    for (const w of [390, 1024, 1440]) await shot(page, "kanban", w);

    await page.goto("/deal/filter", { waitUntil: "domcontentloaded" });
    await dismiss(page);
    await expect(page.locator(".deal-surface").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("تعداد کل").first()).toBeVisible();
    for (const w of [390, 1024, 1440]) await shot(page, "list", w);

    await page.goto("/deal", { waitUntil: "domcontentloaded" });
    await dismiss(page);
    await page.getByRole("button", { name: "همه" }).first().click();
    const detail = page.locator('a[href^="/deal/"]').first();
    await expect(detail).toBeVisible({ timeout: 20_000 });
    await detail.click();
    await expect(page.locator(".deal-surface").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(".bg-yellow-300")).toHaveCount(0);
    for (const w of [390, 1024, 1440]) await shot(page, "detail", w);

    await page.goto("/deal", { waitUntil: "domcontentloaded" });
    await dismiss(page);
    await page.getByRole("button", { name: "افزودن معامله" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.locator(".deal-surface").first()).toBeVisible();
    await expect(page.locator(".bg-green-200")).toHaveCount(0);
    for (const w of [390, 1024, 1440]) await shot(page, "create", w);
  });
});
