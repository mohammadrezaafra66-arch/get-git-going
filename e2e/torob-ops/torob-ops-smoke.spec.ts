/**
 * Torob Ops Path B — smoke on LAN :3100
 *
 *   E2E_BASE_URL=http://192.168.170.8:3100 npx playwright test e2e/torob-ops --workers=1 --reporter=line
 *
 * Auth: minted JWT via storageStateForRole — no password mutation.
 */
import { expect, test } from "@playwright/test";
import { lanEnv } from "../helpers/pgrest";
import { storageStateForRole } from "../helpers/role-session";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://192.168.170.8:3100";
const SUPABASE_URL = `http://192.168.170.8:${lanEnv().SUPABASE_API_PORT}`;

test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

test.use({
  storageState: storageStateForRole("admin", BASE_URL, SUPABASE_URL),
  baseURL: BASE_URL,
  locale: "fa-IR",
  timezoneId: "Asia/Tehran",
});

test("admin /admin/torob-ops-access loads credential management", async ({ page }) => {
  const res = await page.goto("/admin/torob-ops-access", { waitUntil: "domcontentloaded" });
  expect(res?.status() ?? 0).toBeLessThan(400);
  await expect(page.getByRole("heading", { name: "دسترسی عملیات ترب" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText("تعریف / تمدید رمز")).toBeVisible();
  await expect(page.getByLabel("رمز جدید (حداقل ۸ کاراکتر)")).toBeVisible();
});

test("/torob-ops shows module password gate", async ({ page }) => {
  const res = await page.goto("/torob-ops", { waitUntil: "domcontentloaded" });
  expect(res?.status() ?? 0).toBeLessThan(400);
  await expect(page.getByRole("heading", { name: "ورود به عملیات ترب" }).or(page.getByText("ورود به عملیات ترب").first())).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByLabel("رمز ماژول")).toBeVisible();
  await expect(page.getByRole("button", { name: "ورود" })).toBeVisible();
});

test("/torob-ops/runs and /findings are not 404 (gate or content)", async ({ page }) => {
  for (const path of ["/torob-ops/runs", "/torob-ops/findings"] as const) {
    const res = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(res?.status() ?? 0, path).toBeLessThan(400);
    const gate = page.getByText("ورود به عملیات ترب").first();
    const runs = page.getByRole("heading", { name: "دستورهای اسکن ترب" });
    const findings = page.getByRole("heading", { name: "صف بررسی یافته‌های ترب" });
    await expect(gate.or(runs).or(findings)).toBeVisible({ timeout: 30_000 });
  }
});

test("nav includes عملیات ترب for admin", async ({ page }) => {
  await page.goto("/torob-ops", { waitUntil: "domcontentloaded" });
  await expect(page.getByText(/عملیات ترب|ورود به عملیات ترب/).first()).toBeVisible({
    timeout: 30_000,
  });
});
