import { test, expect } from "@playwright/test";
import { dbScalar } from "../helpers/db";
import { dbExecE2e } from "../helpers/db-write";
import { E2E_PREFIX } from "../helpers/app";

/** Phase 6.2 — CustomerForm creates a person, never a bare customer. */

const NAME = `تست فرم مشتری ${E2E_PREFIX}${Date.now()}`;
const PHONE = "09124445566";

function cleanup(): void {
  dbExecE2e(`
    DELETE FROM public.person_context_links
     WHERE person_id IN (SELECT id FROM public.persons WHERE display_name LIKE '%${E2E_PREFIX}%');
    DELETE FROM public.person_merge_candidates
     WHERE person_id_a IN (SELECT id FROM public.persons WHERE display_name LIKE '%${E2E_PREFIX}%')
        OR person_id_b IN (SELECT id FROM public.persons WHERE display_name LIKE '%${E2E_PREFIX}%');
    DELETE FROM public.person_identifiers
     WHERE person_id IN (SELECT id FROM public.persons WHERE display_name LIKE '%${E2E_PREFIX}%');
    DELETE FROM public.customers
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

test("CustomerForm creates a customer with a person and a context link", async ({ page }) => {
  await page.goto("/sales/customers/create");
  await page.waitForLoadState("networkidle");

  const nameField = page.getByLabel("نام", { exact: false }).first();
  await expect(nameField).toBeVisible({ timeout: 15_000 });
  await nameField.fill(NAME);

  const phoneField = page.getByLabel(/موبایل|تلفن|شماره/).first();
  if (await phoneField.count()) await phoneField.fill(PHONE);

  await page.getByRole("button", { name: /ثبت مشتری|ذخیره/ }).first().click();
  await page.waitForURL(/\/sales\/customers(\?.*)?$/, { timeout: 20_000 });

  const row = dbScalar(`
    select c.person_id is not null
        || '|' || coalesce((select i.value_normalized from public.person_identifiers i
                             where i.person_id = c.person_id and i.kind='mobile_e164' limit 1), 'NONE')
        || '|' || (select count(*) from public.person_context_links l
                    where l.person_id = c.person_id and l.ref_id = c.id and l.ref_table='customers')
      from public.customers c where c.name = '${NAME}'
  `);
  expect(row, `no customer named ${NAME} was created`).toBeTruthy();

  const [hasPerson, normalized, ctxLinks] = row.split("|");
  expect(hasPerson, "customer has a person_id").toBe("true");
  expect(normalized, "phone stored as a normalized identifier").toBe("+989124445566");
  expect(ctxLinks, "context link created").toBe("1");
});
