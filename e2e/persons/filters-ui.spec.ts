import { expect, test } from "@playwright/test";
import { E2E_PREFIX } from "../helpers/app";
import { dbExecE2e } from "../helpers/db-write";
import { dbScalar } from "../helpers/db";

/**
 * Phase 3 browser coverage — /persons filters + URL state.
 */

const TAG = `${E2E_PREFIX}UI299_`;
const P_CUST = "b2990001-0000-4000-8000-00000000a001";
const P_SUPP = "b2990001-0000-4000-8000-00000000a002";
const P_INACT = "b2990001-0000-4000-8000-00000000a003";
const P_MISS = "b2990001-0000-4000-8000-00000000a004";
const C_CUST = "b2990001-0000-4000-8000-00000000c001";
const S_SUPP = "b2990001-0000-4000-8000-00000000d001";

const NAME_CUST = `${TAG}CustPerson`;
const NAME_SUPP = `${TAG}SuppPerson`;
const NAME_INACT = `${TAG}InactPerson`;
const NAME_MISS = `${TAG}MissPerson`;

function cleanup(): void {
  dbExecE2e(`
    -- ${E2E_PREFIX} UI299 cleanup
    DELETE FROM public.person_context_links
     WHERE person_id IN ('${P_CUST}','${P_SUPP}','${P_INACT}','${P_MISS}');
    DELETE FROM public.customers WHERE id = '${C_CUST}';
    DELETE FROM public.suppliers WHERE id = '${S_SUPP}';
    DELETE FROM public.person_identifiers
     WHERE person_id IN ('${P_CUST}','${P_SUPP}','${P_INACT}','${P_MISS}');
    DELETE FROM public.persons
     WHERE id IN ('${P_CUST}','${P_SUPP}','${P_INACT}','${P_MISS}');
  `);
}

test.beforeAll(() => {
  cleanup();
  dbExecE2e(`
    -- ${E2E_PREFIX} UI299 seed
    INSERT INTO public.persons (id, kind, display_name, visibility_scope, is_active)
    VALUES
      ('${P_CUST}', 'individual', '${NAME_CUST}', 'internal_general', true),
      ('${P_SUPP}', 'individual', '${NAME_SUPP}', 'internal_general', true),
      ('${P_INACT}', 'individual', '${NAME_INACT}', 'internal_general', false),
      ('${P_MISS}', 'individual', '${NAME_MISS}', 'internal_general', true);

    INSERT INTO public.customers (id, name, person_id)
    VALUES ('${C_CUST}', '${TAG}c', '${P_CUST}');
    INSERT INTO public.suppliers (id, name, person_id)
    VALUES ('${S_SUPP}', '${TAG}s', '${P_SUPP}');

    INSERT INTO public.person_context_links
      (person_id, context_kind, ref_table, ref_id)
    VALUES
      ('${P_CUST}', 'customer', 'customers', '${C_CUST}'),
      ('${P_SUPP}', 'supplier', 'suppliers', '${S_SUPP}');

    INSERT INTO public.person_identifiers
      (person_id, kind, value_raw, status, is_primary)
    VALUES ('${P_CUST}', 'mobile_e164', '09128880001', 'confirmed', true);
  `);
});

test.afterAll(() => {
  cleanup();
  expect(dbScalar("select count(*) from public.person_fk_drift_report()")).toBe("0");
});

async function openFilterMenu(page: import("@playwright/test").Page, label: string) {
  await page.getByRole("button", { name: label }).click();
}

test("context, active, missing filters and clear-all", async ({ page }) => {
  await page.goto("/persons");
  await page.waitForLoadState("networkidle");

  await openFilterMenu(page, "نوع ارتباط");
  await page.getByRole("menuitemcheckbox", { name: "مشتری" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByText(NAME_CUST).first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(NAME_SUPP)).toHaveCount(0);

  await openFilterMenu(page, "نوع ارتباط");
  await page.getByRole("menuitemcheckbox", { name: "تأمین‌کننده" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByText(NAME_CUST).first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(NAME_SUPP).first()).toBeVisible({ timeout: 10_000 });

  await page.getByRole("button", { name: "پاک کردن فیلترها" }).click();
  await page.waitForLoadState("networkidle");

  await page.getByLabel("وضعیت").click();
  await page.getByRole("option", { name: "غیرفعال" }).click();
  await expect(page.getByText(NAME_INACT).first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(NAME_CUST)).toHaveCount(0);

  await page.getByRole("button", { name: "پاک کردن فیلترها" }).click();

  await openFilterMenu(page, "اطلاعات ناقص");
  await page.getByRole("menuitemcheckbox", { name: "بدون کد آسان" }).click();
  await page.keyboard.press("Escape");
  await page.getByPlaceholder("جستجو با نام، نام دیگر، موبایل، کد ملی یا کد آسان").fill(TAG);
  await expect(page.getByText(NAME_MISS).first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(NAME_CUST).first()).toBeVisible({ timeout: 10_000 });
});

test("URL state preserved on refresh; مشاهده opens profile", async ({ page }) => {
  await page.goto(`/persons?q=${encodeURIComponent(NAME_CUST)}&contexts=customer&active=active`);
  await page.waitForLoadState("networkidle");
  await expect(page.getByText(NAME_CUST).first()).toBeVisible({ timeout: 10_000 });
  await expect(page).toHaveURL(/contexts=customer/);
  await expect(page).toHaveURL(/active=active/);

  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(page.getByText(NAME_CUST).first()).toBeVisible({ timeout: 10_000 });
  await expect(page).toHaveURL(/contexts=customer/);

  await page.getByRole("link", { name: "مشاهده" }).first().click();
  await page.waitForLoadState("networkidle");
  await expect(page).toHaveURL(new RegExp(`/persons/${P_CUST}$`));
  await expect(page).not.toHaveURL(/\/unauthorized/);
});

test("mobile viewport shows filter controls", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/persons");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("button", { name: "نوع ارتباط" })).toBeVisible();
  await expect(page.getByLabel("وضعیت")).toBeVisible();
  await expect(page.getByRole("button", { name: "اطلاعات ناقص" })).toBeVisible();
});

test.describe("viewer privacy on list filters", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("viewer does not see missing-data filters", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await page.locator('input[name="email"][type="email"]').fill("test.viewer@afrakala.local");
    await page.locator('input[name="password"][type="password"]').fill("AfraTest!1404");
    await page.getByRole("button", { name: /^ورود$/ }).click();
    await expect(page).not.toHaveURL(/\/login(?:$|\?)/, { timeout: 30_000 });

    await page.goto("/persons");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("button", { name: "نوع ارتباط" })).toBeVisible();
    await expect(page.getByLabel("وضعیت")).toBeVisible();
    await expect(page.getByRole("button", { name: "اطلاعات ناقص" })).toHaveCount(0);
  });
});
