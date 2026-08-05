import { expect, test } from "@playwright/test";
import { E2E_PREFIX } from "../helpers/app";
import { dbExecE2e } from "../helpers/db-write";
import { dbScalar } from "../helpers/db";

/**
 * Phase 2 browser coverage — /persons uses search_visible_persons.
 */

const TAG = `${E2E_PREFIX}UI298_`;
const PERSON_ID = "b2980001-0000-4000-8000-00000000a001";
const ID_MOBILE = "b2980001-0000-4000-8000-00000000d001";
const ID_ASAN = "b2980001-0000-4000-8000-00000000d002";
const ALIAS_ID = "b2980001-0000-4000-8000-00000000e001";
const NAME = `${TAG}BrowserPerson`;
const ALIAS = `${TAG}BrowserAlias`;
const MOBILE = "09123334455";
const ASAN = "997701";

function cleanup(): void {
  dbExecE2e(`
    -- ${E2E_PREFIX} UI298 cleanup
    DELETE FROM public.person_identifiers WHERE person_id = '${PERSON_ID}';
    DELETE FROM public.person_aliases WHERE person_id = '${PERSON_ID}';
    DELETE FROM public.persons WHERE id = '${PERSON_ID}';
  `);
}

test.beforeAll(() => {
  cleanup();
  dbExecE2e(`
    -- ${E2E_PREFIX} UI298 seed
    INSERT INTO public.persons (id, kind, display_name, visibility_scope, is_active)
    VALUES ('${PERSON_ID}', 'individual', '${NAME}', 'internal_general', true);
    INSERT INTO public.person_aliases (id, person_id, alias)
    VALUES ('${ALIAS_ID}', '${PERSON_ID}', '${ALIAS}');
    INSERT INTO public.person_identifiers (id, person_id, kind, value_raw, status, is_primary)
    VALUES
      ('${ID_MOBILE}', '${PERSON_ID}', 'mobile_e164', '${MOBILE}', 'confirmed', true),
      ('${ID_ASAN}', '${PERSON_ID}', 'asan_person_code', '${ASAN}', 'confirmed', false);
  `);
});

test.afterAll(() => {
  cleanup();
  expect(dbScalar("select count(*) from public.person_fk_drift_report()")).toBe("0");
});

async function searchAndExpect(page: import("@playwright/test").Page, q: string) {
  await page.goto("/persons");
  await page.waitForLoadState("networkidle");
  const box = page.getByPlaceholder("جستجو با نام، نام دیگر، موبایل، کد ملی یا کد آسان");
  await box.fill(q);
  await expect(page.getByText(NAME).first()).toBeVisible({ timeout: 10_000 });
}

test("list search finds by name, alias, mobile, and Asan code", async ({ page }) => {
  await searchAndExpect(page, NAME);
  await searchAndExpect(page, ALIAS);
  await searchAndExpect(page, MOBILE);
  await searchAndExpect(page, ASAN);
});

test("clear restores the directory and مشاهده opens the profile", async ({ page }) => {
  await page.goto("/persons");
  await page.waitForLoadState("networkidle");
  const box = page.getByPlaceholder("جستجو با نام، نام دیگر، موبایل، کد ملی یا کد آسان");
  await box.fill(NAME);
  await expect(page.getByText(NAME).first()).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "پاک کردن" }).click();
  await expect(box).toHaveValue("");
  await expect(page.getByRole("link", { name: "مشاهده" }).first()).toBeVisible();

  await box.fill(NAME);
  await expect(page.getByText(NAME).first()).toBeVisible({ timeout: 10_000 });
  await page.getByRole("link", { name: "مشاهده" }).first().click();
  await page.waitForLoadState("networkidle");
  await expect(page).toHaveURL(new RegExp(`/persons/${PERSON_ID}$`));
  await expect(page).not.toHaveURL(/\/unauthorized/);
});
