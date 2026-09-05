/**
 * Wave 1 / A-4 — the "inactive account" guard must stay attached.
 *
 * `public.tg_purchase_actor_active()` existed and was correct, but migration 437
 * found it attached to no trigger at all:
 *
 *   SELECT c.relname, t.tgname FROM pg_trigger t
 *     JOIN pg_class c ON c.oid = t.tgrelid
 *     JOIN pg_proc  p ON p.oid = t.tgfoid
 *    WHERE p.proname = 'tg_purchase_actor_active';
 *   -> (0 rows)                                        measured 2026-09-05
 *
 * A function that nothing calls is not a control. This spec is the regression
 * net for the attachment itself; the behavioural refusal (SQLSTATE 42501 for a
 * deactivated actor, acceptance for an active one) was proven at apply time
 * inside a BEGIN…ROLLBACK and is not repeated here, because a test that can
 * write is a test that can leave rows behind.
 *
 * Run:
 *   npx playwright test e2e/requirements/wave1-a4-purchase-actor-guard.spec.ts \
 *     --workers=1 --reporter=line
 */
import { test, expect } from "@playwright/test";

import { dbScalar, dbRows } from "../helpers/db";

test.describe("A-4 — tg_purchase_actor_active is wired to both purchase tables", () => {
  test("exactly two BEFORE INSERT triggers use it", () => {
    const rows = dbRows(
      `SELECT c.relname || '|' || t.tgname || '|' || t.tgtype
         FROM pg_trigger t
         JOIN pg_class c ON c.oid = t.tgrelid
         JOIN pg_proc  p ON p.oid = t.tgfoid
        WHERE p.proname = 'tg_purchase_actor_active'
          AND NOT t.tgisinternal
        ORDER BY c.relname`,
    );
    // tgtype 7 = ROW | BEFORE | INSERT. Anything else (UPDATE in particular)
    // would freeze every row whose original author was later deactivated.
    expect(rows).toEqual([
      "purchase_requests|trg_purchase_requests_actor_active|7",
      "purchases|trg_purchases_actor_active|7",
    ]);
  });

  test("the guard it enforces still refuses inactive accounts", () => {
    // is_active_actor is what the trigger body asks. If this ever returned true
    // for a deactivated profile the attachment above would be decoration.
    const verdict = dbScalar(
      `SELECT coalesce(bool_or(public.is_active_actor(id))::text, 'no-inactive-profiles')
         FROM public.profiles
        WHERE NOT (is_active AND status = 'active')`,
    );
    expect(verdict).toBe("false");
  });

  test("migration 437 is recorded in the ledger", () => {
    // Applying by psql does not write the ledger; the row is inserted by hand in
    // the same breath. A missing row makes 437 look outstanding to whoever reads
    // the ledger to decide what to run on production.
    const n = dbScalar(
      `SELECT count(*) FROM supabase_migrations.schema_migrations
        WHERE version = '20260905110000'`,
    );
    expect(n).toBe("1");
  });
});
