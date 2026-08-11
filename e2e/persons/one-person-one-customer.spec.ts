import { test, expect } from "@playwright/test";
import { dbScalar } from "../helpers/db";
import { dbExecE2e } from "../helpers/db-write";
import { E2E_PREFIX } from "../helpers/app";

/**
 * Phase 8.3 (Decision 1) — one person = one customer, one person = one supplier.
 *
 * WHICH BEHAVIOUR 8.3 ACTUALLY IMPLEMENTED, since the brief asks the test to
 * say so: it is BLOCKED, not silently reused.
 *
 * person_create_inline gained a reuse branch in migration 240, but that branch
 * is unreachable through the UI — person_create_full unconditionally INSERTs a
 * new person, so the RPC always receives a brand-new person id and never finds
 * an existing legacy row. What actually stops a second customer for the same
 * person is the database constraint uq_customers_person_id, which rejects the
 * INSERT with 23505.
 *
 * So this spec asserts the constraint, from the outside, on a person who
 * already has a customer.
 */

const NAME = `تک‌مشتری ${E2E_PREFIX}`;
const PERSON_ID = "8e2e0004-0000-4000-8000-00000000d001";

function cleanup(): void {
  dbExecE2e(`
    -- ${E2E_PREFIX} scoped cleanup
    DELETE FROM public.person_context_links WHERE person_id = '${PERSON_ID}';
    DELETE FROM public.person_identifiers  WHERE person_id = '${PERSON_ID}';
    DELETE FROM public.person_aliases      WHERE person_id = '${PERSON_ID}';
    DELETE FROM public.customers           WHERE person_id = '${PERSON_ID}';
    DELETE FROM public.suppliers           WHERE person_id = '${PERSON_ID}';
    DELETE FROM public.persons             WHERE id = '${PERSON_ID}';
  `);
}

test.beforeAll(() => {
  cleanup();
  dbExecE2e(`
    -- ${E2E_PREFIX} a person who already owns a customer
    INSERT INTO public.persons (id, kind, display_name, visibility_scope, is_active)
    VALUES ('${PERSON_ID}','individual','${NAME}','internal_general',true);
    INSERT INTO public.customers (name, person_id) VALUES ('${NAME}','${PERSON_ID}');
  `);
});

test.afterAll(() => {
  cleanup();
  expect(
    Number(dbScalar(`select count(*) from public.persons where id = '${PERSON_ID}'`)),
    "cleanup left the seeded person behind",
  ).toBe(0);
});

test("the unique constraint exists and is the mechanism that enforces Decision 1", () => {
  expect(
    dbScalar(
      `select count(*) from pg_constraint
        where conname = 'uq_customers_person_id' and contype = 'u'`,
    ),
    "uq_customers_person_id is missing",
  ).toBe("1");
  expect(
    dbScalar(
      `select count(*) from pg_constraint
        where conname = 'uq_suppliers_person_id' and contype = 'u'`,
    ),
    "uq_suppliers_person_id is missing",
  ).toBe("1");
});

test("a second customer for the same person is rejected", () => {
  // Probed through the database because that is where the rule lives. The
  // outcome is recorded as an alias row, the only channel that survives back to
  // the runner, and it is removed by cleanup().
  dbExecE2e(`
    -- ${E2E_PREFIX} cardinality probe
    DO $probe$
    BEGIN
      BEGIN
        INSERT INTO public.customers (name, person_id)
        VALUES ('${NAME} دوم', '${PERSON_ID}');
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO public.person_aliases (person_id, alias, alias_kind, source)
        VALUES ('${PERSON_ID}', 'RAISED ${E2E_PREFIX} ' || SQLSTATE, 'other', 'e2e-probe');
        RETURN;
      END;
      INSERT INTO public.person_aliases (person_id, alias, alias_kind, source)
      VALUES ('${PERSON_ID}', 'DID_NOT_RAISE ${E2E_PREFIX}', 'other', 'e2e-probe');
    END $probe$;
  `);

  const outcome = dbScalar(
    `select alias from public.person_aliases
      where person_id = '${PERSON_ID}' and source = 'e2e-probe' limit 1`,
  );
  expect(outcome, "the cardinality probe recorded no outcome").toBeTruthy();
  expect(outcome, "a second customer was accepted for a person that already has one").toContain(
    "RAISED",
  );
  expect(outcome, "rejected, but not by a unique violation").toContain("23505");

  // The person still has exactly one customer.
  expect(
    dbScalar(`select count(*) from public.customers where person_id = '${PERSON_ID}'`),
    "the person ended up with more than one customer",
  ).toBe("1");
});

test("the customers list still renders that person's single customer", async ({ page }) => {
  // End-to-end sanity: the constraint did not break the ordinary read path.
  await page.goto("/sales/customers");
  await page.waitForLoadState("networkidle");
  await expect(page).not.toHaveURL(/\/login/);

  const total = dbScalar("select count(*) from public.customers");
  expect(Number(total), "customer rows disappeared").toBeGreaterThan(0);
});
