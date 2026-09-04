/**
 * D-4 — the mutual-settlement readers must not test a condition the schema
 * makes impossible.
 *
 * Migration 319 guarded `list_mutual_settlement_candidates` and
 * `person_settlement_position` against a person holding more than one customer
 * file or more than one supplier file. `uq_customers_person_id` and
 * `uq_suppliers_person_id` make that state unreachable, so the `= 1` predicate
 * only ever meant "has one" and the two `_n > 1` exceptions could never fire.
 *
 * The dead code is not harmless: two readers took the `= 1` for the rule that
 * excludes people from the candidate list. It is not — the AND is. Migration
 * 425 removes the dead predicates and says so in the comment.
 *
 * These assertions read the LIVE function bodies, because the file on disk is
 * not evidence of what the database will execute.
 *
 * Run:
 *   npx playwright test e2e/security/d4-settlement-dead-predicates.spec.ts
 */
import { test, expect } from "@playwright/test";

import { dbScalar } from "../helpers/db";

function liveBody(proname: string): string {
  return dbScalar(
    `SELECT pg_get_functiondef(p.oid) FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = '${proname}'`,
  );
}

test.describe("D-4 — the premise: a second file of either kind is impossible", () => {
  test("both UNIQUE constraints are in place", () => {
    const rows = dbScalar(
      `SELECT string_agg(conname || ' ' || pg_get_constraintdef(oid), ' | ' ORDER BY conname)
         FROM pg_constraint
        WHERE conname IN ('uq_customers_person_id', 'uq_suppliers_person_id')`,
    );
    expect(rows).toContain("uq_customers_person_id UNIQUE (person_id)");
    expect(rows).toContain("uq_suppliers_person_id UNIQUE (person_id)");
  });

  test("and no person in fact holds two of either", () => {
    const dupes = dbScalar(
      `SELECT (SELECT count(*) FROM (SELECT person_id FROM public.customers
                                      WHERE person_id IS NOT NULL
                                      GROUP BY person_id HAVING count(*) > 1) x)
            + (SELECT count(*) FROM (SELECT person_id FROM public.suppliers
                                      WHERE person_id IS NOT NULL
                                      GROUP BY person_id HAVING count(*) > 1) y)`,
    );
    expect(dupes).toBe("0");
  });
});

test.describe("D-4 — the dead predicates are gone from the live bodies", () => {
  test("list_mutual_settlement_candidates no longer counts files", () => {
    const body = liveBody("list_mutual_settlement_candidates");
    expect(body).not.toContain("FROM public.customers c WHERE c.person_id = p.id) = 1");
    expect(body).not.toContain("FROM public.suppliers s WHERE s.person_id = p.id) = 1");
    // …and still selects on the real rule, which is "holds both".
    expect(body).toContain("EXISTS (SELECT 1 FROM public.customers c WHERE c.person_id = p.id)");
    expect(body).toContain("EXISTS (SELECT 1 FROM public.suppliers s WHERE s.person_id = p.id)");
  });

  test("person_settlement_position no longer raises on a duplicate that cannot exist", () => {
    const body = liveBody("person_settlement_position");
    expect(body).not.toContain("IF _n > 1 THEN");
    expect(body).not.toContain("پروندهٔ مشتری دارد؛");
    expect(body).not.toContain("پروندهٔ تأمین‌کننده دارد؛");
    // The counter they used goes with them. Matched on the DECLARE line rather
    // than anywhere in the text, because the replacement body explains in a
    // comment what was removed and would otherwise match its own prose.
    expect(body).not.toMatch(/^\s*_n\s+int\s*;/m);
    expect(body).not.toMatch(/^\s*SELECT count\(\*\) INTO _n/m);
  });

  test("both keep their role gate, SECURITY DEFINER and pinned search_path", () => {
    for (const fn of ["list_mutual_settlement_candidates", "person_settlement_position"]) {
      const body = liveBody(fn);
      expect(body, fn).toContain("SECURITY DEFINER");
      expect(body, fn).toContain("SET search_path TO 'public'");
      expect(body, fn).toContain("has_any_role(auth.uid(), ARRAY['admin','accountant']::text[])");
    }
  });
});

test.describe("D-4 — the rewrite selects exactly the same persons", () => {
  /**
   * The safety net, not the red/green probe: this passes before AND after 425.
   * It is here because "behaviour-preserving" is a claim, and on live data the
   * two predicates must agree or the claim is false.
   */
  test("count(*) = 1 and EXISTS pick the identical set", () => {
    const disagreements = dbScalar(
      `SELECT count(*) FROM public.persons p
        WHERE (
                ((SELECT count(*) FROM public.customers c WHERE c.person_id = p.id) = 1
                 AND (SELECT count(*) FROM public.suppliers s WHERE s.person_id = p.id) = 1)
              ) IS DISTINCT FROM (
                (EXISTS (SELECT 1 FROM public.customers c WHERE c.person_id = p.id)
                 AND EXISTS (SELECT 1 FROM public.suppliers s WHERE s.person_id = p.id))
              )`,
    );
    expect(disagreements).toBe("0");
  });

  test("the candidate set is non-empty, so the assertion above is not vacuous", () => {
    const both = dbScalar(
      `SELECT count(*) FROM public.persons p
        WHERE EXISTS (SELECT 1 FROM public.customers c WHERE c.person_id = p.id)
          AND EXISTS (SELECT 1 FROM public.suppliers s WHERE s.person_id = p.id)`,
    );
    expect(Number(both)).toBeGreaterThan(0);
  });
});
