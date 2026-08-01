import { test, expect } from "@playwright/test";
import { dbScalar } from "../helpers/db";

/**
 * Phase 5 (migration 231) — a sales quote carries the unified person behind its
 * customer, and the quote detail page links straight through to that person.
 *
 * DEVIATION FROM THE REQUESTED STEPS, and why:
 * the plan said "click the first quote row to open the detail page". You cannot.
 * /sales/quotes renders no link to /sales/quotes/{id} at all — the only anchor
 * on the page is /sales/quotes/new, and the row's five buttons are all status
 * actions (ثبت شد / ارسال شد / ارسال / لغو / ارسال پیش‌فاکتور). The detail route
 * exists and works, it is simply unreachable from the list. That gap is reported
 * as a UI finding; this spec navigates to the detail route directly so the
 * Phase 5 behaviour itself still gets tested.
 */

test("quote detail links the customer to their unified person record", async ({ page }) => {
  // Pick a real quote that actually has a person, straight from the database.
  const row = dbScalar(
    `select q.id || '|' || q.quote_number || '|' || q.customer_name || '|' || q.customer_person_id
       from public.sales_quotes q
      where q.customer_person_id is not null
      order by q.created_at desc
      limit 1`,
  );
  const [quoteId, quoteNumber, customerName, personId] = row.split("|");
  expect(quoteId, "no quote with a customer_person_id exists").toBeTruthy();

  await page.goto(`/sales/quotes/${quoteId}`);
  await page.waitForLoadState("networkidle");

  // 3. the customer name is displayed
  await expect(page.getByText(quoteNumber).first()).toBeVisible();
  await expect(page.getByText(customerName).first()).toBeVisible();

  // 4. the customer name is a link pointing at that person
  const personLink = page.locator(`a[href="/persons/${personId}/edit"]`);
  await expect(personLink).toBeVisible();
  await expect(personLink).toContainText(customerName);

  // 5-6. clicking it navigates to the person record
  await personLink.click();
  await page.waitForLoadState("networkidle");
  expect(page.url()).toContain(`/persons/${personId}`);

  // 7. the person page loaded
  await expect(page.getByText("ویرایش شخص").first()).toBeVisible();
  await expect(page.getByText("شناسه‌ها").first()).toBeVisible();
});

test("a quote with no customer shows a plain name, not a broken link", async ({ page }) => {
  // SQ-2026-000002 is the canceled quote with customer_id IS NULL — the one row
  // that made NOT NULL impossible in migration 231. It must not render a link.
  const quoteId = dbScalar(
    `select id from public.sales_quotes where customer_person_id is null limit 1`,
  );
  test.skip(!quoteId, "no quote without a person exists");

  await page.goto(`/sales/quotes/${quoteId}`);
  await page.waitForLoadState("networkidle");
  await expect(page.locator('a[href*="/persons/"]')).toHaveCount(0);
});
