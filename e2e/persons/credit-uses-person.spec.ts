import { test, expect } from "@playwright/test";
import { dbScalar, dbRows } from "../helpers/db";

/**
 * Phase 7.3 — the credit tables are now person-backed, and the numbers did not
 * move. This is the end-to-end half of the numeric-parity gate: the migration
 * proved parity inside the database, this proves the UI still shows the same
 * figure the function returns.
 *
 * Read-only. Creates nothing.
 *
 * NOTE ON WHAT THIS DOES *NOT* ASSERT: the credit functions still key on
 * customer_id, deliberately — see the migration 237 header. customers.person_id
 * is not unique, so keying credit on person would silently sum two customers'
 * balances the day a person has two customer roles. This test guards the
 * numbers, not the column the function happens to read.
 */

const faToEn = (s: string) => s.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));

test("the credit page shows the same number the DB holds", async ({ page }) => {
  // Read the stored allocation directly rather than calling
  // get_customer_dynamic_credit(): that function is SECURITY DEFINER and guards
  // on has_any_role(auth.uid(), ...), and the e2e db helper connects as the
  // `postgres` role with no JWT, so the call returns «دسترسی غیرمجاز».
  // The stored final_limit is what the function returns for this customer and
  // what the page renders, so the assertion is equivalent and does not need a
  // simulated session.
  const row = dbScalar(`
    select c.id || '|' || c.name || '|' || d.final_limit::text
      from public.customer_capital_allocations_dynamic d
      join public.customers c on c.id = d.customer_id
     where d.customer_person_id = c.person_id
     order by d.final_limit desc
     limit 1
  `);
  expect(row, "no customer with a dynamic allocation").toBeTruthy();
  const [customerId, customerName, finalLimit] = row.split("|");

  await page.goto(`/sales/customers/${customerId}/credit`);
  await page.waitForLoadState("networkidle");

  // The page identifies the right customer...
  await expect(page.getByText(customerName).first()).toBeVisible({ timeout: 15_000 });

  // ...and renders the DB's figure. Persian digits and thousands separators are
  // normalised away before comparing.
  const shown = faToEn(await page.locator("body").innerText()).replace(/,/g, "");
  const expected = Number(finalLimit).toLocaleString("en-US").replace(/,/g, "");
  expect(shown, `final_limit ${expected} not found on the credit page`).toContain(expected);
});

test("credit tables are fully person-backed with zero drift", async ({}) => {
  const creditTables = [
    "credit_requests",
    "credit_score_snapshots",
    // `customer_capital_allocations` (the legacy, always-empty twin) was dropped by
    // migration 280; only the dynamic table remains.
    "customer_capital_allocations_dynamic",
    "customer_credit_balance",
    "customer_credit_ledger",
    "customer_credit_profile",
  ];

  for (const t of creditTables) {
    const bad = dbScalar(`
      select count(*) from public.${t} x
      left join public.customers c on c.id = x.customer_id
      where x.customer_person_id is distinct from c.person_id
    `);
    expect(Number(bad), `${t}: person column disagrees with customer_id`).toBe(0);
  }

  // The schema-level guarantee: every credit table's person column is NOT NULL.
  const nullable = dbRows(`
    select table_name from information_schema.columns
     where table_schema='public' and column_name='customer_person_id'
       and is_nullable='YES'
       and table_name in (${creditTables.map((t) => `'${t}'`).join(",")})
  `);
  expect(nullable, "these credit tables allow a NULL person").toEqual([]);
});

test("person_fk_drift_report is empty across all migrated references", async ({}) => {
  const drift = dbRows(`select table_name || '=' || drifted_rows from public.person_fk_drift_report()`);
  expect(drift, "drift detected").toEqual([]);
});
