import { test, expect } from "@playwright/test";
import { dbScalar } from "../helpers/db";

/**
 * Phase 7.1 + 7.5 — a product's supplier link resolves to the unified person,
 * and the product page exposes it. Read-only.
 */

test("a product's supplier links through to the unified person", async ({ page }) => {
  const row = dbScalar(`
    select ps.product_id || '|' || ps.supplier_person_id || '|' || s.name
      from public.product_suppliers ps
      join public.suppliers s on s.id = ps.supplier_id
     where ps.supplier_person_id is not null
     order by ps.created_at desc
     limit 1
  `);
  expect(row, "no product_suppliers row with a person").toBeTruthy();
  const [productId, personId, supplierName] = row.split("|");

  await page.goto(`/products/${productId}`);
  await page.waitForLoadState("networkidle");

  // The supplier is listed...
  await expect(page.getByText(supplierName).first()).toBeVisible({ timeout: 15_000 });

  // ...and its person is reachable (Phase 7.5 added this alongside the existing
  // supplier link, which still points at the supplier page).
  const personLink = page.locator(`a[href="/persons/${personId}/edit"]`);
  await expect(personLink).toBeVisible();

  await personLink.click();
  await page.waitForLoadState("networkidle");
  expect(page.url()).toContain(`/persons/${personId}`);
  await expect(page.getByText("ویرایش شخص").first()).toBeVisible();
});

test("product_suppliers is fully person-backed", async ({}) => {
  const bad = dbScalar(`
    select count(*) from public.product_suppliers ps
    left join public.suppliers s on s.id = ps.supplier_id
    where ps.supplier_person_id is distinct from s.person_id
  `);
  expect(Number(bad), "product_suppliers person/supplier mismatch").toBe(0);

  const nullable = dbScalar(`
    select is_nullable from information_schema.columns
     where table_schema='public' and table_name='product_suppliers'
       and column_name='supplier_person_id'
  `);
  expect(nullable, "supplier_person_id should be NOT NULL here").toBe("NO");
});
