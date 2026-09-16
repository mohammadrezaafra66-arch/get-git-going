/**
 * Torob Ops Path B — admin credential CRUD page.
 *
 * LAN target: http://192.168.170.8:3100 (E2E_BASE_URL). Requires a web image
 * that includes commit 97c155cd or later (APP_GIT_SHA on afrakala-lan-web).
 *
 * Asserts /admin/torob-ops-access renders «دسترسی عملیات ترب» and the create /
 * renew form controls for an admin session. Does not write credentials into
 * the shared test DB (hashing goes through server fns; a leftover active row
 * would unlock Path B for a real user).
 *
 * Auth: minted admin JWT via storageStateForRole — does not overwrite
 * e2e/auth/admin.storage.json [E-1].
 */
import { expect, test, type Page } from "@playwright/test";

import { lanEnv } from "../helpers/pgrest";
import { storageStateForRole } from "../helpers/role-session";

/** Prefer explicit E2E_BASE_URL; default LAN :3100. */
const BASE_URL = process.env.E2E_BASE_URL ?? "http://192.168.170.8:3100";
const SUPABASE_URL = `http://192.168.170.8:${lanEnv().SUPABASE_API_PORT}`;

const ADMIN_TITLE = "دسترسی عملیات ترب";
const CREATE_CARD = "تعریف / تمدید رمز";
const PASSWORD_FIELD_LABEL = "رمز جدید (حداقل ۸ کاراکتر)";
const SAVE_BUTTON = "ذخیره رمز";

test.describe.configure({ mode: "serial" });

test.use({
  storageState: storageStateForRole("admin", BASE_URL, SUPABASE_URL),
  baseURL: BASE_URL,
  locale: "fa-IR",
  timezoneId: "Asia/Tehran",
});

async function settleAdminPage(page: Page) {
  await expect(page.getByTestId("route-gate-checking")).toHaveCount(0, { timeout: 20_000 });
}

test.describe("Torob Ops admin access", () => {
  test("/admin/torob-ops-access shows title and create form", async ({ page }) => {
    await page.goto("/admin/torob-ops-access", { waitUntil: "domcontentloaded" });
    await settleAdminPage(page);

    await expect(page.getByRole("heading", { name: ADMIN_TITLE })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(CREATE_CARD)).toBeVisible();
    await expect(page.getByText("کاربر", { exact: true }).first()).toBeVisible();
    await expect(page.getByLabel(PASSWORD_FIELD_LABEL)).toBeVisible();
    await expect(page.locator("#ops-pw")).toHaveAttribute("type", "password");
    await expect(page.getByRole("button", { name: SAVE_BUTTON })).toBeVisible();
    // Empty form: save stays disabled until user + 8-char password are set.
    await expect(page.getByRole("button", { name: SAVE_BUTTON })).toBeDisabled();
  });

  test("save enables only after user + long-enough password", async ({ page }) => {
    await page.goto("/admin/torob-ops-access", { waitUntil: "domcontentloaded" });
    await settleAdminPage(page);

    const save = page.getByRole("button", { name: SAVE_BUTTON });
    await expect(save).toBeDisabled();

    await page.getByLabel(PASSWORD_FIELD_LABEL).fill("short");
    await expect(save).toBeDisabled();

    await page.getByLabel(PASSWORD_FIELD_LABEL).fill("long-enough-password");
    // Still disabled without a selected user — proves both gates, not password alone.
    await expect(save).toBeDisabled();
  });
});

/**
 * Unlock → /runs + /findings smoke.
 *
 * Skipped: seeding `torob_ops_credentials` requires calling the admin upsert
 * server fn (or inserting a scrypt/bcrypt hash via service_role). Doing that on
 * the shared LAN test DB would leave a live module password for test.admin and
 * is not safe without an explicit disposable marker + teardown owned by ops.
 * Re-enable when a dedicated E2E credential helper with E2E_PREFIX cleanup exists.
 */
test.describe("Torob Ops unlock smoke (optional)", () => {
  test.skip(true, "skip unlock flow: no safe disposable module credential on shared test DB");

  test("after unlock, /torob-ops/runs and /findings show page titles", async () => {
    // Placeholder so the skip reason stays discoverable in the report.
    expect(true).toBe(true);
  });
});
