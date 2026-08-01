import { test, expect } from "@playwright/test";
import { dbScalar } from "../helpers/db";
import { dbExecE2e } from "../helpers/db-write";
import { E2E_PREFIX } from "../helpers/app";

/**
 * Phase 1-2 — create a person, then attach an identifier and prove the DATABASE
 * normalized it (migration 228: normalize_identifier + a BEFORE trigger, so the
 * DB wins regardless of what the client sent).
 *
 * DEVIATION FROM THE REQUESTED STEPS, and why:
 * the plan put the identifier fields on /persons/create. They are not there.
 * That page only has نوع شخص / سطح دسترسی / نام نمایشی / نام رسمی / یادداشت /
 * فعال. Identifiers live on the edit page, which is reached after the person
 * exists. So this walks create -> edit -> add identifier, which is the real
 * product flow.
 */

const NAME = `تست نرمال ${E2E_PREFIX}${Date.now()}`;
const RAW_MOBILE = "09121234567";
const EXPECTED_NORMALIZED = "+989121234567";

function cleanup(): void {
  dbExecE2e(`
    DELETE FROM public.person_context_links
     WHERE person_id IN (SELECT id FROM public.persons WHERE display_name LIKE '%${E2E_PREFIX}%');
    DELETE FROM public.person_identifiers
     WHERE person_id IN (SELECT id FROM public.persons WHERE display_name LIKE '%${E2E_PREFIX}%');
    DELETE FROM public.persons WHERE display_name LIKE '%${E2E_PREFIX}%';
  `);
}

test.afterAll(() => {
  cleanup();
  const left = dbScalar(
    `select count(*) from public.persons where display_name like '%${E2E_PREFIX}%'`,
  );
  expect(Number(left), "cleanup left E2E persons behind").toBe(0);
});

test("create a person, add an identifier, and see it normalized by the database", async ({
  page,
}) => {
  // 1-2. create the person
  await page.goto("/persons/create");
  await page.waitForLoadState("networkidle");
  // getByLabel works since Phase 6.5 wired htmlFor/id on PersonForm. Using it
  // here means this test also asserts the label-control association.
  await page.getByLabel("نام نمایشی *").fill(NAME);
  await page.getByRole("button", { name: "ایجاد شخص" }).click();

  // The app navigates to the new person's edit page on success.
  await page.waitForURL(/\/persons\/[0-9a-f-]{36}\/edit/, { timeout: 20_000 });
  await expect(page.getByText("ویرایش شخص").first()).toBeVisible();

  const personId = page.url().match(/\/persons\/([0-9a-f-]{36})\/edit/)![1];
  expect(dbScalar(`select display_name from public.persons where id = '${personId}'`)).toBe(NAME);

  // 3-4. identifier kind is already موبایل by default; fill the value
  const kindCombo = page.getByRole("combobox").nth(2);
  await expect(kindCombo).toContainText("موبایل");
  await page.getByPlaceholder("مقدار شناسه").fill(RAW_MOBILE);

  // 5. add it.
  // exact:true matters — getByRole name matching is substring by default, and
  // the sidebar contributes 11 buttons containing "افزودن" (افزودن محصول, ...).
  await page.getByRole("button", { name: "افزودن", exact: true }).first().click();

  // 6-7. the identifiers table shows the NORMALIZED value, not what we typed
  await expect(page.getByText(EXPECTED_NORMALIZED).first()).toBeVisible({ timeout: 15_000 });

  // The database is the authority (migration 228) — confirm at the source.
  const stored = dbScalar(
    `select value_raw || '|' || value_normalized
       from public.person_identifiers
      where person_id = '${personId}' and kind = 'mobile_e164'
      limit 1`,
  );
  const [raw, normalized] = stored.split("|");
  expect(raw, "raw value kept as entered").toBe(RAW_MOBILE);
  expect(normalized, "DB trigger normalized the identifier").toBe(EXPECTED_NORMALIZED);

  // 8-9. saving the record still succeeds with the identifier attached
  await page.getByRole("button", { name: "ذخیره تغییرات" }).click();
  await page.waitForLoadState("networkidle");
  await expect(page.getByText(EXPECTED_NORMALIZED).first()).toBeVisible();
});
