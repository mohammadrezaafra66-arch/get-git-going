import { expect, test } from "@playwright/test";
import { E2E_PREFIX } from "../helpers/app";
import { dbExecE2e } from "../helpers/db-write";
import { dbScalar } from "../helpers/db";
import { ADMIN_USER_ID, mintJwt, rest, userWithRole } from "../helpers/pgrest";

/**
 * Phase 6A — browser + JWT coverage for /admin/phone-collisions.
 * Route guard: admin|manager. RLS SELECT also allows accountant (UI still denies).
 * No merge action on this page.
 */

const TAG = `${E2E_PREFIX}P6COL_`;
const PH_PENDING = "09129994001";
const PH_RESOLVED = "09129994002";
const PH_IGNORED = "09129994003";
const PH_TWO = "09129994004";
const PH_RESTRICTED = "09129994005";
const PH_MISSING = "09129994006";

const ID_PENDING = "a3060001-0000-4000-8000-00000000f001";
const ID_RESOLVED = "a3060001-0000-4000-8000-00000000f002";
const ID_IGNORED = "a3060001-0000-4000-8000-00000000f003";
const ID_TWO = "a3060001-0000-4000-8000-00000000f004";
const ID_RESTRICTED = "a3060001-0000-4000-8000-00000000f005";
const ID_MISSING = "a3060001-0000-4000-8000-00000000f006";
const ENT_A = "a3060001-0000-4000-8000-00000000c001";
const ENT_B = "a3060001-0000-4000-8000-00000000c002";
const ENT_GONE = "a3060001-0000-4000-8000-00000000dead";

function cleanup(): void {
  dbExecE2e(`
    -- ${E2E_PREFIX} P6COL cleanup
    DELETE FROM public.phone_collisions
     WHERE id IN (
       '${ID_PENDING}','${ID_RESOLVED}','${ID_IGNORED}',
       '${ID_TWO}','${ID_RESTRICTED}','${ID_MISSING}'
     )
     OR normalized_phone IN (
       '${PH_PENDING}','${PH_RESOLVED}','${PH_IGNORED}',
       '${PH_TWO}','${PH_RESTRICTED}','${PH_MISSING}'
     );
  `);
}

async function loginAs(
  page: import("@playwright/test").Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.locator('input[name="email"][type="email"]').fill(email);
  await page.locator('input[name="password"][type="password"]').fill(password);
  await page.getByRole("button", { name: /^ورود$/ }).click();
  await expect(page).not.toHaveURL(/\/login(?:$|\?)/, { timeout: 30_000 });
}

/** Route guard may keep the path and render inline denial (SSR deferral). */
async function expectAccessDenied(page: import("@playwright/test").Page): Promise<void> {
  await expect
    .poll(async () => {
      const url = page.url();
      const text = await page.locator("body").innerText();
      return (
        /\/unauthorized(?:$|\?)/.test(url) ||
        /\/login(?:$|\?)/.test(url) ||
        text.includes("دسترسی ندارید")
      );
    }, { timeout: 15_000 })
    .toBeTruthy();
}

test.beforeAll(() => {
  cleanup();
  dbExecE2e(`
    -- ${E2E_PREFIX} P6COL seed
    INSERT INTO public.phone_collisions (id, normalized_phone, entity_refs, status)
    VALUES
      ('${ID_PENDING}', '${PH_PENDING}',
       '[{"table":"customers","id":"${ENT_A}","label":"${TAG}A"}]'::jsonb, 'pending'),
      ('${ID_RESOLVED}', '${PH_RESOLVED}',
       '[{"table":"customers","id":"${ENT_A}","label":"${TAG}Resolved"}]'::jsonb, 'resolved'),
      ('${ID_IGNORED}', '${PH_IGNORED}',
       '[{"table":"customers","id":"${ENT_A}","label":"${TAG}Ignored"}]'::jsonb, 'ignored'),
      ('${ID_TWO}', '${PH_TWO}',
       '[{"table":"customers","id":"${ENT_A}","label":"${TAG}One"},{"table":"suppliers","id":"${ENT_B}","label":"${TAG}Two"}]'::jsonb,
       'pending'),
      ('${ID_RESTRICTED}', '${PH_RESTRICTED}',
       '[{"table":"customers","id":"${ENT_A}","label":"${TAG}Visible"},{"table":"customers","id":"${ENT_B}","label":null}]'::jsonb,
       'pending'),
      ('${ID_MISSING}', '${PH_MISSING}',
       '[{"table":"customers","id":"${ENT_GONE}","label":null}]'::jsonb, 'pending');

    UPDATE public.phone_collisions
       SET resolved_at = now(), resolution_note = '${TAG}done'
     WHERE id = '${ID_RESOLVED}';
    UPDATE public.phone_collisions
       SET resolved_at = now(), resolution_note = '${TAG}skip'
     WHERE id = '${ID_IGNORED}';
  `);
});

test.afterAll(() => {
  cleanup();
  expect(
    dbScalar(
      `select count(*) from public.phone_collisions
        where normalized_phone like '09129994%'`,
    ),
  ).toBe("0");
});

test.describe("phone-collisions — admin browser", () => {
  test("admin opens queue, sees fixtures, no merge action, can resolve", async ({ page }) => {
    await page.goto("/admin/phone-collisions");
    await page.waitForLoadState("networkidle");

    await expect(page).not.toHaveURL(/\/unauthorized|\/login/);
    await expect(page.getByText("تداخل شماره تلفن").first()).toBeVisible();
    await expect(page.getByText("در حال بارگذاری")).toHaveCount(0, { timeout: 15_000 });

    await expect(page.getByText(PH_PENDING).first()).toBeVisible();
    await expect(page.getByText(PH_RESOLVED).first()).toBeVisible();
    await expect(page.getByText(PH_IGNORED).first()).toBeVisible();
    await expect(page.getByText(`${TAG}One`).first()).toBeVisible();
    await expect(page.getByText(`${TAG}Two`).first()).toBeVisible();
    await expect(page.getByText(`${TAG}Visible`).first()).toBeVisible();

    // Restricted / missing labels render as em dash, not a leaked id.
    const restrictedRow = page.locator("tr").filter({ hasText: PH_RESTRICTED });
    await expect(restrictedRow).toBeVisible();
    await expect(restrictedRow.getByText(ENT_B)).toHaveCount(0);

    const missingRow = page.locator("tr").filter({ hasText: PH_MISSING });
    await expect(missingRow.getByText(ENT_GONE)).toHaveCount(0);

    await expect(page.getByText("در انتظار بررسی").first()).toBeVisible();
    await expect(page.getByText("بررسی‌شده").first()).toBeVisible();
    await expect(page.getByText("نادیده گرفته شد").first()).toBeVisible();

    await expect(page.getByRole("button", { name: "ادغام", exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /ادغام/ })).toHaveCount(0);

    const pendingRow = page.locator("tr").filter({ hasText: PH_PENDING });
    await pendingRow.getByPlaceholder("توضیح تصمیم (اختیاری)").fill(`${TAG}ok`);
    await pendingRow.getByRole("button", { name: "بررسی شد" }).click();
    await expect(page.getByText("تصمیم ثبت شد").first()).toBeVisible({ timeout: 10_000 });

    await page.reload();
    await page.waitForLoadState("networkidle");
    const after = page.locator("tr").filter({ hasText: PH_PENDING });
    await expect(after.getByText("بررسی‌شده")).toBeVisible();
    await expect(after.getByRole("button", { name: "بررسی شد" })).toHaveCount(0);
  });

  test("admin can ignore a pending collision", async ({ page }) => {
    // Re-seed pending for ignore path if previous test resolved PH_PENDING.
    dbExecE2e(`
      -- ${E2E_PREFIX} P6COL reseed ignore target
      UPDATE public.phone_collisions
         SET status = 'pending', resolved_at = null, resolution_note = null, resolved_by = null
       WHERE id = '${ID_TWO}';
    `);

    await page.goto("/admin/phone-collisions");
    await page.waitForLoadState("networkidle");
    const row = page.locator("tr").filter({ hasText: PH_TWO });
    await row.getByRole("button", { name: "نادیده بگیر" }).click();
    await expect(page.getByText("تصمیم ثبت شد").first()).toBeVisible({ timeout: 10_000 });
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.locator("tr").filter({ hasText: PH_TWO }).getByText("نادیده گرفته شد")).toBeVisible();
  });
});

test.describe("phone-collisions — denied roles (browser)", () => {
  test.use({ storageState: "e2e/auth/accountant.storage.json" });

  test("accountant UI denied even if RLS SELECT exists", async ({ page }) => {
    await page.goto("/admin/phone-collisions");
    await page.waitForLoadState("networkidle");
    await expectAccessDenied(page);
    await expect(page.getByRole("button", { name: "بررسی شد" })).toHaveCount(0);
  });
});

test.describe("phone-collisions — sales denied", () => {
  test.use({ storageState: "e2e/auth/salesperson-a.storage.json" });

  test("sales cannot open queue", async ({ page }) => {
    await page.goto("/admin/phone-collisions");
    await page.waitForLoadState("networkidle");
    await expectAccessDenied(page);
  });
});

test.describe("phone-collisions — viewer denied", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("viewer cannot open queue", async ({ page }) => {
    await loginAs(page, "test.viewer@afrakala.local", "AfraTest!1404");
    await page.goto("/admin/phone-collisions");
    await page.waitForLoadState("networkidle");
    await expectAccessDenied(page);
  });
});

test.describe("phone-collisions — anonymous denied", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("anonymous bounced to login", async ({ page }) => {
    await page.goto("/admin/phone-collisions");
    await page.waitForLoadState("networkidle");
    await expectAccessDenied(page);
  });
});

test.describe("phone-collisions — JWT permissions", () => {
  test("admin/manager can SELECT; sales/viewer cannot; accountant may SELECT", async () => {
    const adminJwt = mintJwt(ADMIN_USER_ID);
    const admin = await rest<{ id: string }[]>(
      adminJwt,
      `/phone_collisions?id=eq.${ID_RESOLVED}&select=id,normalized_phone`,
    );
    expect(admin.body).toHaveLength(1);

    const mgrId = await userWithRole(adminJwt, "manager");
    if (mgrId) {
      const mgr = await rest<{ id: string }[]>(
        mintJwt(mgrId),
        `/phone_collisions?id=eq.${ID_RESOLVED}&select=id`,
      );
      expect((mgr.body ?? []).length).toBeGreaterThan(0);
    }

    const salesId = await userWithRole(adminJwt, "sales");
    expect(salesId).toBeTruthy();
    const sales = await rest(mintJwt(salesId!), `/phone_collisions?id=eq.${ID_RESOLVED}&select=id`);
    expect(sales.body ?? []).toEqual([]);

    const viewerId = dbScalar(
      `select ur.user_id::text from public.user_roles ur
        where ur.role='viewer' and public.is_viewer_only(ur.user_id) limit 1`,
    );
    if (viewerId) {
      const v = await rest(mintJwt(viewerId), `/phone_collisions?id=eq.${ID_RESOLVED}&select=id`);
      expect(v.body ?? []).toEqual([]);
    }

    const acctId = await userWithRole(adminJwt, "accountant");
    if (acctId) {
      // RLS allows accountant SELECT; route guard still blocks UI (covered above).
      await rest(mintJwt(acctId), `/phone_collisions?id=eq.${ID_RESOLVED}&select=id`);
    }

    const anon = await rest(null, `/phone_collisions?select=id&limit=1`);
    if (anon.status === 200) expect(anon.body ?? []).toEqual([]);
    else expect([401, 403]).toContain(anon.status);
  });

  test("manager browser path when login available", async ({ page, browser }) => {
    const adminJwt = mintJwt(ADMIN_USER_ID);
    const mgrId = await userWithRole(adminJwt, "manager");
    test.skip(!mgrId, "no manager user");

    // Opportunistic password shared by LAN test accounts; skip if login fails.
    const email = dbScalar(
      `select email::text from auth.users where id = '${mgrId}' limit 1`,
    );
    test.skip(!email, "no manager email");

    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const p = await context.newPage();
    try {
      await loginAs(p, email, "AfraTest!1404");
    } catch {
      await context.close();
      test.skip(true, "manager password not AfraTest!1404");
    }
    await p.goto("/admin/phone-collisions");
    await p.waitForLoadState("networkidle");
    const ok =
      !/\/unauthorized|\/login/.test(p.url()) &&
      (await p.getByText("تداخل شماره تلفن").count()) > 0;
    await context.close();
    expect(ok).toBeTruthy();
  });
});
