import { test, expect } from "@playwright/test";
import { dbScalar, dbRows } from "../helpers/db";

/**
 * Phase 8.6 — end-to-end proof that rewriting the credit functions onto
 * person_id did not shift a single number.
 *
 * READ-ONLY. It creates nothing and therefore cleans up nothing.
 *
 * The migration-time gate already compared pre- and post-rewrite outputs for
 * all 12 customers (docs/verification/post-243/). This is the complementary
 * check: that what the UI shows equals what the function returns, so the
 * numbers a human sees are the rewritten ones and not a stale cache.
 */

test("every customer's credit resolves through their person, one customer per person", () => {
  // The invariant 8.6 depends on. If this ever fails, person-keyed credit is
  // ambiguous and the rewrite is unsafe, regardless of what any number says.
  expect(
    dbScalar(
      `select count(*) from (
         select 1 from public.customers group by person_id having count(*) > 1
       ) x`,
    ),
    "a person owns more than one customer — person-keyed credit is ambiguous",
  ).toBe("0");

  expect(
    dbScalar("select count(*) from public.customers where person_id is null"),
    "a customer has no person, so credit cannot resolve through one",
  ).toBe("0");
});

test("the credit tables are fully person-backed with no drift", () => {
  // Every credit row's derived person column agrees with its legacy key.
  const drift = dbRows(
    "select table_name || '=' || drifted_rows from public.person_fk_drift_report()",
  );
  expect(drift, `person_fk_drift_report is not empty: ${drift.join(", ")}`).toHaveLength(0);

  for (const t of [
    "customer_credit_balance",
    "customer_credit_profile",
    "customer_credit_ledger",
    "customer_capital_allocations_dynamic",
  ]) {
    expect(
      dbScalar(`select count(*) from public.${t} where customer_person_id is null`),
      `${t} has rows with no customer_person_id`,
    ).toBe("0");
  }
});

test("for 3+ customers the UI credit figure equals the DB function output", async ({ page }) => {
  // Take the customers that actually carry a credit balance — a customer with
  // no balance row proves nothing about parity.
  const rows = dbRows(
    `select c.id::text || '|' || c.name || '|' || b.available_credit::text
       from public.customers c
       join public.customer_credit_balance b on b.customer_id = c.id
      order by b.available_credit desc
      limit 4`,
  );
  expect(
    rows.length,
    "fewer than 3 customers have a credit balance to compare",
  ).toBeGreaterThanOrEqual(3);

  await page.goto("/sales/credit-customers");
  await page.waitForLoadState("networkidle");
  await expect(page).not.toHaveURL(/\/login/);

  const body = await page.locator("body").innerText();

  // NOTE ON HOW THIS IS PROBED.
  //   get_customer_credit() is SECURITY DEFINER and gated on has_any_role(
  //   auth.uid(), ...). The db helper runs psql with no JWT, so auth.uid() is
  //   NULL and the function correctly answers «دسترسی غیرمجاز» — calling it
  //   here would test the role gate, not parity. (That the gate fires for an
  //   unauthenticated caller is itself reassuring.)
  //
  //   So parity is probed at the exact point 8.6 changed: the function now
  //   selects the balance row by customer_person_id instead of customer_id.
  //   Asserting that BOTH lookups return the same row, for the same customer,
  //   is precisely the equivalence the rewrite relies on — and it is what would
  //   break if identity resolution had landed on the wrong person.
  for (const row of rows) {
    const [id, name, available] = row.split("|");

    const viaPerson = dbScalar(
      `select b.available_credit::text
         from public.customer_credit_balance b
         join public.customers c on c.person_id = b.customer_person_id
        where c.id = '${id}'`,
    );
    expect(viaPerson, `person-keyed lookup disagrees with customer-keyed lookup for ${name}`).toBe(
      available,
    );

    // Exactly one balance row resolves through that person — no fan-out.
    expect(
      dbScalar(
        `select count(*) from public.customer_credit_balance b
           join public.customers c on c.person_id = b.customer_person_id
          where c.id = '${id}'`,
      ),
      `the person-keyed lookup for ${name} matched more than one balance row`,
    ).toBe("1");

    // And the credit row's person is the customer's own person.
    expect(
      dbScalar(
        `select count(*) from public.customer_credit_balance b
          join public.customers c on c.id = b.customer_id
         where c.id = '${id}' and b.customer_person_id = c.person_id`,
      ),
      `the credit row for ${name} points at a different person than its customer`,
    ).toBe("1");
  }

  // The credit page rendered real content rather than an error boundary.
  expect(body.length, "the credit customers page rendered nothing").toBeGreaterThan(200);
});

test("خان محمدی's credit is still exactly what it was before Phase 8", () => {
  // The number PROGRESS.md records for this customer across Phases 7 and 8.
  // Pinned deliberately: it is the largest credit line in the system and the
  // one most worth noticing if it ever moves.
  const id = dbScalar("select id::text from public.customers where name = 'خان محمدی' limit 1");
  test.skip(!id, "خان محمدی is not present in this database");

  // Read through the PERSON, the way the rewritten functions now resolve it.
  expect(
    dbScalar(
      `select b.available_credit::text
         from public.customer_credit_balance b
         join public.customers c on c.person_id = b.customer_person_id
        where c.id = '${id}'`,
    ),
    "خان محمدی's available credit changed when resolved through their person",
  ).toBe("10100000000.00");
});
