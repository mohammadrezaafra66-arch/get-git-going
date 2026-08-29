/**
 * Migration 414 — every person is a customer, from every creation path.
 *
 * WHY THIS EXISTS. Before 414 only `p_context_kind='customer'` produced a `customers` row, so a
 * person entered through the supplier form, the accounting-party form or the Asan batch import
 * had none. 56 of 86 persons were in that state: invisible on the credit page and refused by
 * `create_sales_quote_with_items` for "not being linked to a customer file".
 *
 * The behavioural proof ran in a rolled-back transaction before this gate was written: a person
 * created through the SUPPLIER path came back with `legacy_table=suppliers` (so the old branch
 * still works), had a customers row, appeared in `list_trusted_credit_customers`, and reached the
 * CREDIT evaluation inside `create_sales_quote_with_items` instead of the customer-file refusal.
 * Restoring the pre-414 function made that same probe fail at step 2, which is what makes this
 * gate worth trusting.
 *
 * This spec is the standing invariant. It is read-only: the behavioural probe cannot live here
 * because `e2e/helpers/db` refuses anything that is not a SELECT, which is the correct trade --
 * a test that can write is a test that can repair the state it is meant to check.
 */
import { expect, test } from "@playwright/test";
import { dbScalar } from "../helpers/db";

test.describe("migration 414 — every person is a customer", () => {
  test("no person is left without a customers row", () => {
    const orphans = dbScalar(
      `select count(*) from public.persons p
        where not exists (select 1 from public.customers c where c.person_id = p.id)`,
    );
    expect(orphans).toBe("0");
  });

  test("the invariant is measured against real rows, not an empty table", () => {
    // Without this, the assertion above passes trivially on an empty database.
    const persons = Number(dbScalar(`select count(*) from public.persons`));
    expect(persons).toBeGreaterThan(0);
  });

  test("person_create_inline creates a customer for every context, not just 'customer'", () => {
    // Asserts the guard itself, so reverting the function body fails here even if the data
    // happens to look right at that moment.
    const hasUnconditionalEnsure = dbScalar(
      `select case when pg_get_functiondef(p.oid) like '%414 -- EVERY person is a customer%'
                   or pg_get_functiondef(p.oid) like '%414 %EVERY person is a customer%'
              then 'yes' else 'no' end
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'person_create_inline'`,
    );
    expect(hasUnconditionalEnsure).toBe("yes");
  });

  test("the Asan import path keeps its SECURITY DEFINER posture", () => {
    // 414 deliberately did NOT convert this to INVOKER. Routing it through
    // person_create_inline would put RLS on a path that does not have it today -- a security
    // change that does not belong in a data-shape migration. If someone flips it, this fails
    // and they have to justify it.
    const secdef = dbScalar(
      `select case when p.prosecdef then 'definer' else 'invoker' end
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'asan_commit_person_batch'`,
    );
    expect(secdef).toBe("definer");
  });

  test("the other person roles were not collapsed into customers", () => {
    // A person can be a customer AND a supplier. If 414 had overwritten rather than added,
    // these would have gone to zero.
    const suppliers = Number(dbScalar(`select count(*) from public.suppliers`));
    const externals = Number(dbScalar(`select count(*) from public.external_parties`));
    expect(suppliers).toBeGreaterThan(0);
    expect(externals).toBeGreaterThan(0);
  });
});
