import { test, expect } from "@playwright/test";
import { dbScalar } from "../helpers/db";
import { dbExecE2e } from "../helpers/db-write";
import { E2E_PREFIX } from "../helpers/app";

/**
 * Phase 3 (migration 229) — create a supplier inline from the purchase form.
 * One RPC (person_create_inline) writes person + identifier + legacy supplier
 * row + context link in a single transaction.
 *
 * The created person carries E2E_PREFIX in its display name so the write helper
 * accepts the cleanup SQL and so any leftover is obvious in the persons list.
 */

const NAME = `تست تامین‌کننده ${E2E_PREFIX}${Date.now()}`;
const MOBILE = "09121112233";

function cleanup(): void {
  dbExecE2e(`
    DELETE FROM public.person_context_links
     WHERE person_id IN (SELECT id FROM public.persons WHERE display_name LIKE '%${E2E_PREFIX}%');
    DELETE FROM public.person_identifiers
     WHERE person_id IN (SELECT id FROM public.persons WHERE display_name LIKE '%${E2E_PREFIX}%');
    DELETE FROM public.suppliers
     WHERE person_id IN (SELECT id FROM public.persons WHERE display_name LIKE '%${E2E_PREFIX}%')
        OR name LIKE '%${E2E_PREFIX}%';
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

test("inline supplier creation from the purchase form", async ({ page }) => {
  await page.goto("/purchases/create");
  await page.waitForLoadState("networkidle");

  // 2-3. the inline-create trigger next to the supplier selector.
  // Note the ZWNJ + heh-hamza: "تأمین‌کنندهٔ جدید", not "تأمین‌کننده جدید".
  const newSupplierBtn = page.getByRole("button", { name: /تأمین‌کنندهٔ جدید/ });
  await expect(newSupplierBtn).toBeVisible();
  await newSupplierBtn.click();

  // 4. PersonModal opened
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("شخص جدید ثبت می‌شود و بلافاصله در همین فرم قابل انتخاب است.")).toBeVisible();

  // 5-6. name + mobile identifier
  await dialog.getByLabel("نام *").fill(NAME);
  await dialog.getByLabel("شمارهٔ موبایل").fill(MOBILE);

  // 7. submit
  await dialog.getByRole("button", { name: "ذخیرهٔ شخص و ادامه" }).click();

  // 8. modal closes
  await expect(dialog).toBeHidden({ timeout: 15_000 });

  // 9. the new supplier appears in the dropdown (the list refetched)
  const supplierCombo = page.getByRole("combobox").nth(1);
  await supplierCombo.click();
  const listbox = page.getByRole("listbox");
  await expect(listbox.getByRole("option", { name: NAME })).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press("Escape");

  // The database side: person, supplier row, context link and a NORMALIZED
  // identifier (Phase 2 rules turn 09121112233 into +989121112233).
  const check = dbScalar(`
    select (select count(*) from public.persons where display_name = '${NAME}')
        || '|' || (select count(*) from public.suppliers s
                     join public.persons p on p.id = s.person_id
                    where p.display_name = '${NAME}')
        || '|' || coalesce((select i.value_normalized from public.person_identifiers i
                              join public.persons p on p.id = i.person_id
                             where p.display_name = '${NAME}' and i.kind = 'mobile_e164' limit 1), 'NONE')
        || '|' || (select count(*) from public.person_context_links l
                     join public.persons p on p.id = l.person_id
                    where p.display_name = '${NAME}')
  `);
  const [persons, suppliers, normalized, links] = check.split("|");
  expect(persons, "person row").toBe("1");
  expect(suppliers, "linked supplier row").toBe("1");
  expect(normalized, "identifier normalized by the DB trigger").toBe("+989121112233");
  expect(Number(links), "context link created").toBeGreaterThanOrEqual(1);
});

/**
 * Regression guard for the auto-select race.
 *
 * PersonModal promises "بلافاصله در همین فرم قابل انتخاب است". The original
 * implementation did `await refetchSuppliers()` then `form.setValue(...)` in the
 * same tick: the await resolves when the DATA arrives, before React re-renders
 * the <SelectItem>s. Radix Select falls back to its placeholder when `value`
 * matches no rendered item and never re-resolves, so the supplier was created
 * and listed but the field stayed on "انتخاب تأمین‌کننده".
 *
 * PurchaseForm now records a pendingSupplierId and selects it from an effect,
 * which runs after the commit that renders the option. This test failed before
 * that change and passes after it.
 */
test("newly created supplier is auto-selected in the purchase form", async ({ page }) => {
  const name = `تست تامین‌کننده ${E2E_PREFIX}auto${Date.now()}`;

  await page.goto("/purchases/create");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /تأمین‌کنندهٔ جدید/ }).click();

  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("نام *").fill(name);
  await dialog.getByRole("button", { name: "ذخیرهٔ شخص و ادامه" }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });

  // The trigger must now show the new supplier's name, not the placeholder.
  const supplierCombo = page.getByRole("combobox").nth(1);
  await expect(supplierCombo).toContainText(name, { timeout: 10_000 });
  await expect(supplierCombo).not.toContainText("انتخاب تأمین‌کننده");
});
