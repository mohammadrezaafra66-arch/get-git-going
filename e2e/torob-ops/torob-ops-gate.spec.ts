/**
 * Torob Ops Path B — module password gate on /torob-ops.
 *
 * LAN target: http://192.168.170.8:3100 (E2E_BASE_URL). Requires a web image
 * that includes commit 97c155cd or later (APP_GIT_SHA on afrakala-lan-web).
 *
 * Asserts the unlock form («ورود به عملیات ترب» / «رمز ماژول») when the browser
 * has an app session but no Torob Ops module session. Does not unlock via a
 * real credential (that needs admin credential CRUD + a known password on the
 * test DB — covered as skipped smoke in the admin-access companion spec).
 *
 * Auth: minted admin JWT via storageStateForRole — does not mutate
 * e2e/auth/admin.storage.json [E-1].
 */
import { expect, test, type Page } from "@playwright/test";

import { lanEnv } from "../helpers/pgrest";
import { storageStateForRole } from "../helpers/role-session";

/** Prefer explicit E2E_BASE_URL; default LAN :3100. */
const BASE_URL = process.env.E2E_BASE_URL ?? "http://192.168.170.8:3100";
const SUPABASE_URL = `http://192.168.170.8:${lanEnv().SUPABASE_API_PORT}`;

const GATE_TITLE = "ورود به عملیات ترب";
const PASSWORD_LABEL = "رمز ماژول";
const DASHBOARD_TITLE = "عملیات ترب";

test.describe.configure({ mode: "serial" });

async function settleGateShell(page: Page) {
  await expect(page.getByTestId("route-gate-checking")).toHaveCount(0, { timeout: 20_000 });
  // Gate mounts after a short client-ready tick («در حال آماده‌سازی…»).
  await expect(page.getByText("در حال آماده‌سازی…")).toHaveCount(0, { timeout: 15_000 });
}

test.describe("Torob Ops gate — no module session", () => {
  test.use({
    storageState: storageStateForRole("admin", BASE_URL, SUPABASE_URL),
    baseURL: BASE_URL,
    locale: "fa-IR",
    timezoneId: "Asia/Tehran",
  });

  test("admin without module session sees unlock form on /torob-ops", async ({ page }) => {
    await page.goto("/torob-ops", { waitUntil: "domcontentloaded" });
    await settleGateShell(page);

    await expect(page.getByText(GATE_TITLE)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByLabel(PASSWORD_LABEL)).toBeVisible();
    await expect(page.locator("#torob-ops-password")).toHaveAttribute("type", "password");
    // Dashboard body must not render while locked.
    await expect(page.getByRole("heading", { name: DASHBOARD_TITLE })).toHaveCount(0);
  });

  test("admin without module session still sees gate on /torob-ops/runs and /findings", async ({
    page,
  }) => {
    for (const route of ["/torob-ops/runs", "/torob-ops/findings"] as const) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await settleGateShell(page);
      await expect(page.getByText(GATE_TITLE), `${route} must show gate`).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByLabel(PASSWORD_LABEL), `${route} password field`).toBeVisible();
    }
  });

  test("wrong module password keeps gate visible (no dashboard)", async ({ page }) => {
    await page.goto("/torob-ops", { waitUntil: "domcontentloaded" });
    await settleGateShell(page);

    await page.getByLabel(PASSWORD_LABEL).fill("definitely-not-a-real-module-password");
    await page.getByRole("button", { name: /^ورود$/ }).click();

    // Unlock failure stays on the gate; dashboard title must not appear.
    await expect(page.getByText(GATE_TITLE)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: DASHBOARD_TITLE })).toHaveCount(0);
  });
});

test.describe("Torob Ops gate — cold / unauthenticated", () => {
  // No storageState: prove we are not accidentally relying on a warm admin cookie jar.
  test.use({
    storageState: { cookies: [], origins: [] },
    baseURL: BASE_URL,
    locale: "fa-IR",
    timezoneId: "Asia/Tehran",
  });

  test("unauthenticated visit does not expose unlocked dashboard", async ({ page }) => {
    await page.goto("/torob-ops", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2_000);

    // App auth may redirect to /login, or the role gate may deny, or the module
    // gate may render. None of those paths may show the unlocked dashboard.
    await expect(page.getByRole("heading", { name: DASHBOARD_TITLE })).toHaveCount(0);

    const onLogin = /\/login(?:$|\?)/.test(page.url());
    const gateVisible = (await page.getByText(GATE_TITLE).count()) > 0;
    const denied = (await page.getByTestId("route-gate-denied").count()) > 0;
    expect(
      onLogin || gateVisible || denied,
      `expected login, module gate, or route denial; url=${page.url()}`,
    ).toBe(true);

    if (gateVisible) {
      await expect(page.getByLabel(PASSWORD_LABEL)).toBeVisible();
    }
  });
});
