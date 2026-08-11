import { test, expect } from "@playwright/test";
import { dbScalar } from "../helpers/db";

/**
 * Phase 7.1 — purchase_prices.supplier_person_id.
 *
 * THIS IS A DB-PROBE SPEC, NOT A UI SPEC, and that is a deliberate choice the
 * Phase 7 plan explicitly allows. /pricing/purchase-prices lists prices with a
 * supplier NAME but exposes no per-row supplier navigation, so there is nothing
 * to click through to a person. Rather than add a UI affordance nobody asked for
 * just to have something to assert, the invariant is checked at the source.
 *
 * Read-only. Creates nothing.
 */

test("every purchase price with a supplier resolves to that supplier's person", async ({}) => {
  const stats = dbScalar(`
    select count(*) || '|' ||
           count(supplier_id) || '|' ||
           count(supplier_person_id) || '|' ||
           count(*) FILTER (WHERE supplier_id IS NOT NULL AND supplier_person_id IS NULL)
      from public.purchase_prices
  `);
  const [total, withSupplier, withPerson, orphans] = stats.split("|").map(Number);

  // Most rows genuinely have no supplier; those must stay NULL, not be invented.
  expect(orphans, "purchase_prices rows with a supplier but no person").toBe(0);
  expect(withPerson, "person count must equal supplier count").toBe(withSupplier);
  expect(total, "purchase_prices should not be empty").toBeGreaterThan(0);

  const mismatched = dbScalar(`
    select count(*) from public.purchase_prices pp
    join public.suppliers s on s.id = pp.supplier_id
    where pp.supplier_person_id is distinct from s.person_id
  `);
  expect(Number(mismatched), "supplier_person_id disagrees with suppliers.person_id").toBe(0);
});

test("the consistency guard rejects a person without a supplier", async ({}) => {
  // purchase_prices.supplier_id is nullable, so the person column gets a CHECK
  // rather than NOT NULL. Confirm the constraint actually exists.
  const def = dbScalar(`
    select pg_get_constraintdef(oid) from pg_constraint
     where conname = 'purchase_prices_supplier_person_requires_supplier_chk'
  `);
  expect(def, "guard constraint missing").toContain("supplier_person_id IS NULL");
});

test("external parties and their receipts are person-backed", async ({}) => {
  // Phase 7.2 prerequisite: external_parties gained person_id so receipt and
  // voucher party references have something to resolve to.
  const ep = dbScalar(`select count(*) FILTER (WHERE person_id IS NULL) from public.external_parties`);
  expect(Number(ep), "external parties without a person").toBe(0);

  const receipts = dbScalar(`
    select count(*) from public.payment_receipts pr
    left join public.external_parties e on e.id = pr.receiver_party_id
    where pr.receiver_party_person_id is distinct from e.person_id
  `);
  expect(Number(receipts), "receipt receiver person mismatch").toBe(0);
});
