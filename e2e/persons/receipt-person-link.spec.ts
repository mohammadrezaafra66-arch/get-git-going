import { test, expect } from "@playwright/test";
import { dbScalar } from "../helpers/db";

/**
 * Phase 7.2 + 7.5 — a payment receipt carries the unified person behind its
 * paying customer, and the detail page links straight through to it.
 *
 * Read-only: uses receipts that already exist, creates nothing.
 */

test("receipt detail links the paying customer to their person record", async ({ page }) => {
  const row = dbScalar(`
    select pr.id || '|' || pr.customer_person_id || '|' || c.name
      from public.payment_receipts pr
      join public.customers c on c.id = pr.customer_id
     where pr.customer_person_id is not null
     order by pr.created_at desc
     limit 1
  `);
  expect(row, "no payment receipt with a customer_person_id exists").toBeTruthy();
  const [receiptId, personId] = row.split("|");

  await page.goto(`/accounting/receipts/${receiptId}`);
  await page.waitForLoadState("networkidle");

  const personLink = page.locator(`a[href="/persons/${personId}/edit"]`);
  await expect(personLink).toBeVisible({ timeout: 15_000 });

  await personLink.click();
  await page.waitForLoadState("networkidle");
  expect(page.url()).toContain(`/persons/${personId}`);
  await expect(page.getByText("ویرایش شخص").first()).toBeVisible();
});

test("every receipt's person matches the person of its legacy customer", async ({}) => {
  // The DB-side invariant behind the link above. Cheap, and it fails loudly if a
  // future write path ever bypasses the derivation trigger.
  const mismatches = dbScalar(`
    select count(*)
      from public.payment_receipts pr
      left join public.customers c on c.id = pr.customer_id
     where pr.customer_person_id is distinct from c.person_id
  `);
  expect(Number(mismatches), "payment_receipts person/customer mismatch").toBe(0);
});
