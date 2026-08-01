import { test, expect } from "@playwright/test";
import { dbScalar } from "../helpers/db";
import { dbExecE2e } from "../helpers/db-write";
import { E2E_PREFIX } from "../helpers/app";

/**
 * Phase 6.1 — SupplierForm creates a person, never a bare supplier.
 *
 * Before this change the form did a direct INSERT into suppliers, producing
 * person_id = NULL rows (that is where the stray 'api' supplier came from).
 * Since migration 233 made suppliers.person_id NOT NULL, a regression here does
 * not silently create a bad row — it fails the insert outright.
 */

const NAME = `تست فرم تأمین ${E2E_PREFIX}${Date.now()}`;
const PHONE = "09123334455";

function cleanup(): void {
  dbExecE2e(`
    DELETE FROM public.person_context_links
     WHERE person_id IN (SELECT id FROM public.persons WHERE display_name LIKE '%${E2E_PREFIX}%');
    DELETE FROM public.person_merge_candidates
     WHERE person_id_a IN (SELECT id FROM public.persons WHERE display_name LIKE '%${E2E_PREFIX}%')
        OR person_id_b IN (SELECT id FROM public.persons WHERE display_name LIKE '%${E2E_PREFIX}%');
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
  expect(
    Number(dbScalar(`select count(*) from public.persons where display_name like '%${E2E_PREFIX}%'`)),
    "cleanup left E2E persons behind",
  ).toBe(0);
});

test("SupplierForm creates a supplier with a person and a context link", async ({ page }) => {
  // Create mode is /suppliers/new — the $supplierId route treats the literal
  // "new" as its create sentinel. There is no /suppliers/create.
  await page.goto("/suppliers/new");
  await page.waitForLoadState("networkidle");

  // If the create route lives elsewhere, fail loudly rather than silently pass.
  await expect(page.getByLabel("نام تأمین‌کننده")).toBeVisible({ timeout: 15_000 });

  await page.getByLabel("نام تأمین‌کننده").fill(NAME);
  await page.getByLabel("تلفن").fill(PHONE);
  await page.getByLabel("شخص تماس").fill("آقای تست");
  await page.getByRole("button", { name: /ثبت تأمین‌کننده/ }).click();

  // Success navigates to the suppliers list.
  await page.waitForURL(/\/suppliers(\?.*)?$/, { timeout: 20_000 });

  const row = dbScalar(`
    select s.person_id is not null
        || '|' || coalesce(s.contact_name, '<none>')
        || '|' || coalesce((select i.value_normalized from public.person_identifiers i
                             where i.person_id = s.person_id and i.kind='mobile_e164' limit 1), 'NONE')
        || '|' || (select count(*) from public.person_context_links l
                    where l.person_id = s.person_id and l.ref_id = s.id and l.ref_table='suppliers')
      from public.suppliers s where s.name = '${NAME}'
  `);
  expect(row, `no supplier named ${NAME} was created`).toBeTruthy();

  const [hasPerson, contactName, normalized, ctxLinks] = row.split("|");
  expect(hasPerson, "supplier has a person_id").toBe("true");
  expect(contactName, "contact_name survived the RPC whitelist").toBe("آقای تست");
  expect(normalized, "phone stored as a normalized identifier").toBe("+989123334455");
  expect(ctxLinks, "context link created").toBe("1");
});
