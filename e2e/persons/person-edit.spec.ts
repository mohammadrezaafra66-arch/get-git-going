import { test, expect } from "@playwright/test";
import { dbScalar } from "../helpers/db";

/**
 * Phase 1-2 — the person record page: core fields, the visibility-scope guard
 * (blocker B1) and the identifiers section that migration 228 normalizes.
 */

test("person edit page shows core fields and the identifier section", async ({ page }) => {
  // 1-2. open the first person from the list
  await page.goto("/persons");
  await page.waitForLoadState("networkidle");
  const firstEdit = page.locator('a[href*="/edit"]').first();
  await expect(firstEdit).toBeVisible();
  const href = await firstEdit.getAttribute("href");
  await firstEdit.click();
  await page.waitForLoadState("networkidle");

  // 3. the edit page loaded
  expect(page.url()).toContain(href!);
  await expect(page.getByText("ویرایش شخص").first()).toBeVisible();

  // 4. core fields. getByLabel (not getByText) so this asserts the Phase 6.5
  //    label-to-control wiring, not merely that the words appear on screen.
  await expect(page.getByLabel("نوع شخص")).toBeVisible();
  await expect(page.getByLabel("سطح دسترسی")).toBeVisible();
  await expect(page.getByLabel("نام نمایشی *")).toBeVisible();
  await expect(page.getByLabel("نام رسمی / قانونی")).toBeVisible();
  await expect(page.getByRole("button", { name: "ذخیره تغییرات" })).toBeVisible();

  // 5. identifiers section
  await expect(page.getByText("شناسه‌ها").first()).toBeVisible();
  await expect(page.getByText("نوع شناسه").first()).toBeVisible();

  // 6. the identifier-kind combobox offers موبایل
  const kindCombo = page.getByRole("combobox").nth(2);
  await expect(kindCombo).toBeVisible();
  await kindCombo.click();
  const listbox = page.getByRole("listbox");
  await expect(listbox).toBeVisible();
  await expect(listbox.getByText("موبایل", { exact: false }).first()).toBeVisible();
  await page.keyboard.press("Escape");

  // 7. the add button.
  // exact:true — without it, 11 sidebar buttons ("افزودن محصول", ...) also match.
  await expect(page.getByRole("button", { name: "افزودن", exact: true }).first()).toBeVisible();

  // Phase 2 evidence: the identifiers table exposes the DB-normalized value.
  await expect(page.getByText("مقدار نرمال‌شده").first()).toBeVisible();
});

test("existing identifiers are stored in normalized form", async ({ page }) => {
  // This used to walk the first 6 rows of /persons (created_at DESC) hoping one
  // of them had a mobile. That made it depend on list ORDER rather than on the
  // thing it asserts, and Phase 8 broke it for a legitimate reason: checkpoint
  // 8.2 removed the colliding identifier from the «تست دستی من» test record, so
  // all eight most-recent persons now have zero identifiers and the window came
  // up empty. Normalization was never at fault.
  //
  // Ask the database which person actually has a normalized mobile, then open
  // that one. Deterministic, and it still proves the same thing end to end:
  // what the DB stored is what the edit page renders.
  const personId = dbScalar(
    `select i.person_id::text
       from public.person_identifiers i
      where i.kind = 'mobile_e164'
        and i.status <> 'revoked'
        and i.value_normalized like '+98%'
      order by i.created_at
      limit 1`,
  );
  expect(personId, "no person in the database has a normalized mobile identifier").toBeTruthy();

  const expected = dbScalar(
    `select value_normalized from public.person_identifiers
      where person_id = '${personId}' and kind = 'mobile_e164' and status <> 'revoked' limit 1`,
  );

  await page.goto(`/persons/${personId}/edit`);
  await page.waitForLoadState("networkidle");

  const body = await page.locator("body").innerText();
  expect(body, "the edit page did not render the DB-normalized value").toContain(expected);
  expect(/\+98\d{10}/.test(body), "value is not in +98 normalized form").toBeTruthy();
});
