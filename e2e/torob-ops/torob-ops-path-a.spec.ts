/**
 * Torob Ops Path A — gate on new routes + preview blocked copy on findings shell.
 */
import { expect, test, type Page } from "@playwright/test";

import { lanEnv } from "../helpers/pgrest";
import { storageStateForRole } from "../helpers/role-session";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://192.168.170.8:3100";
const SUPABASE_URL = `http://192.168.170.8:${lanEnv().SUPABASE_API_PORT}`;

const GATE_TITLE = "ورود به عملیات ترب";
const PASSWORD_LABEL = "رمز ماژول";

test.describe.configure({ mode: "serial" });

async function settleGateShell(page: Page) {
  await expect(page.getByTestId("route-gate-checking")).toHaveCount(0, { timeout: 20_000 });
  await expect(page.getByText("در حال آماده‌سازی…")).toHaveCount(0, { timeout: 15_000 });
}

test.describe("Torob Ops Path A — gated surfaces", () => {
  test.use({
    storageState: storageStateForRole("admin", BASE_URL, SUPABASE_URL),
    baseURL: BASE_URL,
    locale: "fa-IR",
    timezoneId: "Asia/Tehran",
  });

  test("shops / settings / accounts show module gate without ops session", async ({ page }) => {
    for (const route of [
      "/torob-ops/shops",
      "/torob-ops/settings",
      "/torob-ops/accounts",
    ] as const) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await settleGateShell(page);
      await expect(page.getByText(GATE_TITLE), `${route} gate`).toBeVisible({ timeout: 15_000 });
      await expect(page.getByLabel(PASSWORD_LABEL)).toBeVisible();
    }
  });

  test("findings page gate still present (preview requires unlock)", async ({ page }) => {
    await page.goto("/torob-ops/findings", { waitUntil: "domcontentloaded" });
    await settleGateShell(page);
    await expect(page.getByText(GATE_TITLE)).toBeVisible({ timeout: 15_000 });
    // Unlocked findings title must not leak
    await expect(page.getByRole("heading", { name: "صف بررسی یافته‌های ترب" })).toHaveCount(0);
  });
});
