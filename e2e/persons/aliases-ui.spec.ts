import { expect, test } from "@playwright/test";
import { E2E_PREFIX } from "../helpers/app";
import { dbExecE2e } from "../helpers/db-write";
import { dbScalar } from "../helpers/db";

/**
 * Phase 4 browser — PersonAliasesManager on profile + search integration.
 */

const TAG = `${E2E_PREFIX}UI300_`;
const PERSON = "b3000001-0000-4000-8000-00000000a001";
const NAME = `${TAG}AliasHost`;
const ALIAS1 = `${TAG}FirstAlias`;
const ALIAS2 = `${TAG}SecondAlias`;

function cleanup(): void {
  dbExecE2e(`
    -- ${E2E_PREFIX} UI300 cleanup
    DELETE FROM public.person_aliases WHERE person_id = '${PERSON}';
    DELETE FROM public.persons WHERE id = '${PERSON}';
  `);
}

test.beforeAll(() => {
  cleanup();
  dbExecE2e(`
    -- ${E2E_PREFIX} UI300 seed
    INSERT INTO public.persons (id, kind, display_name, visibility_scope, is_active)
    VALUES ('${PERSON}', 'individual', '${NAME}', 'internal_general', true);
  `);
});

test.afterAll(() => {
  cleanup();
  expect(dbScalar("select count(*) from public.person_fk_drift_report()")).toBe("0");
});

test("admin adds, updates, deletes alias; search tracks changes", async ({ page }) => {
  await page.goto(`/persons/${PERSON}`);
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("نام‌های دیگر").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "افزودن نام دیگر" })).toBeVisible();

  await page.getByRole("button", { name: "افزودن نام دیگر" }).click();
  await page.locator("#alias-text").fill(ALIAS1);
  await page.getByRole("button", { name: "ذخیره" }).click();
  await expect(page.getByText(ALIAS1).first()).toBeVisible({ timeout: 10_000 });

  await page.goto("/persons");
  await page.waitForLoadState("networkidle");
  await page
    .getByPlaceholder("جستجو با نام، نام دیگر، موبایل، کد ملی یا کد آسان")
    .fill(ALIAS1);
  await expect(page.getByText(NAME).first()).toBeVisible({ timeout: 10_000 });

  await page.goto(`/persons/${PERSON}`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "ویرایش نام دیگر" }).first().click();
  await page.locator("#alias-text").fill(ALIAS2);
  await page.getByRole("button", { name: "ذخیره" }).click();
  await expect(page.getByText(ALIAS2).first()).toBeVisible({ timeout: 10_000 });

  await page.goto(`/persons?q=${encodeURIComponent(ALIAS1)}`);
  await page.waitForLoadState("networkidle");
  await expect(page.getByText(NAME)).toHaveCount(0);

  await page.goto(`/persons?q=${encodeURIComponent(ALIAS2)}`);
  await page.waitForLoadState("networkidle");
  await expect(page.getByText(NAME).first()).toBeVisible({ timeout: 10_000 });

  await page.goto(`/persons/${PERSON}`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "حذف نام دیگر" }).first().click();
  await page.getByRole("button", { name: "حذف", exact: true }).click();
  await expect(page.getByText("هیچ نام دیگری ثبت نشده است.")).toBeVisible({ timeout: 10_000 });

  await page.goto(`/persons?q=${encodeURIComponent(ALIAS2)}`);
  await page.waitForLoadState("networkidle");
  await expect(page.getByText(NAME)).toHaveCount(0);
});

test.describe("read-only roles", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("accountant sees aliases read-only", async ({ page }) => {
    dbExecE2e(`
      INSERT INTO public.person_aliases (person_id, alias, alias_kind)
      SELECT '${PERSON}', '${TAG}Readonly', 'other'
      WHERE NOT EXISTS (
        SELECT 1 FROM public.person_aliases
         WHERE person_id = '${PERSON}' AND alias = '${TAG}Readonly'
      );
    `);

    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    const email = "test.accountant@afrakala.local";
    const password = "AfraTest!1404";
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await page.locator('input[name="email"][type="email"]').fill(email);
    await page.locator('input[name="password"][type="password"]').fill(password);
    await page.getByRole("button", { name: /^ورود$/ }).click();
    const landed = await page
      .waitForURL((u) => !u.pathname.includes("/login"), { timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!landed, "accountant login unavailable");

    await page.goto(`/persons/${PERSON}`);
    await page.waitForLoadState("networkidle");
    await expect(page).not.toHaveURL(/\/unauthorized/);
    await expect(page.getByText("نام‌های دیگر").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "افزودن نام دیگر" })).toHaveCount(0);
  });
});

test("mobile viewport shows alias section", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/persons/${PERSON}`);
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("نام‌های دیگر").first()).toBeVisible();
});
