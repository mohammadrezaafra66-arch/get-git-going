/**
 * OG-100 — migration 423: a purchase can never lose its settlement term.
 *
 * WHY THIS IS A DATABASE GATE AND NOT A FORM TEST. The form was never the hole.
 * Measured on 2026-09-04 before the migration: create_purchase already refused a NULL term
 * (23503) and an inactive one (22023), and `authenticated` has no INSERT grant on `purchases`,
 * so the RPC was the only way to CREATE one. But `authenticated` does hold UPDATE — including on
 * the payment_term_id column — so a plain PostgREST PATCH stripped the term from an existing
 * purchase, and one such UPDATE was measured changing exactly one row. A rule that only the
 * happy path obeys is not a rule, so it lives in the schema.
 *
 * WHAT A MISSING TERM ACTUALLY COSTS. vw_supplier_payables derives the due date as
 *   CASE WHEN pt.days IS NOT NULL THEN purchase_date + pt.days ELSE purchase_date END
 * so a term-less purchase is not shown as unknown — it is shown as due on the day it was bought,
 * and overdue from the next morning. Measured: deleting the term used by 286 of 303 purchases
 * stripped all 286 in a single statement, under the old ON DELETE SET NULL.
 *
 * EVERY TEST RUNS INSIDE A TRANSACTION THAT IS ALWAYS ROLLED BACK, so this spec writes nothing.
 * Each constraint gets three tests: it REFUSES the violation, it ACCEPTS the legitimate case,
 * and — the one that matters — a FORCED DISTURBANCE drops the constraint and shows the same
 * violation succeeding. Without that third test, a gate that was never wired would look
 * identical to a gate that works.
 */
import { expect, test } from "@playwright/test";

import { inRolledBackTx } from "../helpers/tx";

/** Trap a statement and report whether the database took it, with the SQLSTATE if it did not. */
const attempt = (label: string, stmt: string) => `
DO $probe$
BEGIN
  BEGIN
    ${stmt}
    INSERT INTO probe VALUES ('${label}=ACCEPTED');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO probe VALUES ('${label}=REFUSED ' || SQLSTATE);
  END;
END
$probe$;`;

/** A purchase id and a term id that is NOT the one that purchase already uses. */
const PICK = `
CREATE TEMP TABLE pick ON COMMIT DROP AS
  SELECT p.id AS purchase_id, p.payment_term_id AS current_term,
         (SELECT t.id FROM public.payment_terms t WHERE t.id <> p.payment_term_id AND t.is_active
           LIMIT 1) AS other_term
    FROM public.purchases p LIMIT 1;`;

test.describe("OG-100 — purchases.payment_term_id is NOT NULL", () => {
  test("REFUSES stripping the term from an existing purchase", () => {
    const out = inRolledBackTx(
      PICK +
        attempt(
          "strip",
          "UPDATE public.purchases SET payment_term_id = NULL WHERE id = (SELECT purchase_id FROM pick);",
        ),
    );
    // 23502 is not_null_violation. This is the PATCH that worked before migration 423.
    expect(out, "a PostgREST PATCH must not be able to null the term").toContain(
      "strip=REFUSED 23502",
    );
  });

  test("ACCEPTS moving a purchase to a different valid term", () => {
    const out = inRolledBackTx(
      PICK +
        attempt(
          "move",
          "UPDATE public.purchases SET payment_term_id = (SELECT other_term FROM pick) WHERE id = (SELECT purchase_id FROM pick);",
        ),
    );
    expect(out, "the constraint must forbid NULL, not forbid editing").toContain("move=ACCEPTED");
  });

  test("FORCED DISTURBANCE: without the constraint the same PATCH succeeds", () => {
    const out = inRolledBackTx(
      PICK +
        "ALTER TABLE public.purchases ALTER COLUMN payment_term_id DROP NOT NULL;" +
        attempt(
          "strip",
          "UPDATE public.purchases SET payment_term_id = NULL WHERE id = (SELECT purchase_id FROM pick);",
        ),
    );
    expect(
      out,
      "if this still refuses, something OTHER than the new constraint is doing the work and the first test proves nothing",
    ).toContain("strip=ACCEPTED");
  });
});

test.describe("OG-100 — payment_terms.days is NOT NULL and non-negative", () => {
  test("REFUSES a term with no day count", () => {
    const out = inRolledBackTx(
      attempt(
        "nullDays",
        "INSERT INTO public.payment_terms (name, days) VALUES ('OG100 probe null', NULL);",
      ),
    );
    expect(
      out,
      "an active term with NULL days was legal before 423, and create_purchase accepted it",
    ).toContain("nullDays=REFUSED 23502");
  });

  test("REFUSES a negative day count", () => {
    const out = inRolledBackTx(
      attempt(
        "negDays",
        "INSERT INTO public.payment_terms (name, days) VALUES ('OG100 probe neg', -1);",
      ),
    );
    // 23514 is check_violation.
    expect(out).toContain("negDays=REFUSED 23514");
  });

  test("ACCEPTS zero — that is cash, and it must stay legal", () => {
    const out = inRolledBackTx(
      attempt(
        "zeroDays",
        "INSERT INTO public.payment_terms (name, days) VALUES ('OG100 probe zero', 0);",
      ),
    );
    expect(out, "the live term نقدی has days = 0 and 286 purchases use it").toContain(
      "zeroDays=ACCEPTED",
    );
  });

  test("FORCED DISTURBANCE: without the constraints both violations succeed", () => {
    const out = inRolledBackTx(
      "ALTER TABLE public.payment_terms ALTER COLUMN days DROP NOT NULL;" +
        "ALTER TABLE public.payment_terms DROP CONSTRAINT payment_terms_days_check;" +
        attempt(
          "nullDays",
          "INSERT INTO public.payment_terms (name, days) VALUES ('OG100 probe null', NULL);",
        ) +
        attempt(
          "negDays",
          "INSERT INTO public.payment_terms (name, days) VALUES ('OG100 probe neg', -1);",
        ),
    );
    expect(out).toContain("nullDays=ACCEPTED");
    expect(out).toContain("negDays=ACCEPTED");
  });
});

test.describe("OG-100 — a settlement term in use cannot be deleted", () => {
  test("REFUSES deleting a term that a purchase points at", () => {
    const out = inRolledBackTx(
      attempt(
        "delUsed",
        "DELETE FROM public.payment_terms WHERE id = (SELECT payment_term_id FROM public.purchases LIMIT 1);",
      ),
    );
    // 23503 is foreign_key_violation — RESTRICT, not SET NULL.
    expect(out, "deleting a used term silently stripped 286 purchases before 423").toContain(
      "delUsed=REFUSED 23503",
    );
  });

  test("ACCEPTS deleting a term nothing uses — obsolete terms are still removable", () => {
    const out = inRolledBackTx(
      "INSERT INTO public.payment_terms (id, name, days) VALUES ('dddddddd-0000-4000-8000-000000000423','OG100 unused', 7);" +
        attempt(
          "delUnused",
          "DELETE FROM public.payment_terms WHERE id = 'dddddddd-0000-4000-8000-000000000423';",
        ),
    );
    expect(out, "RESTRICT must bite only on terms actually in use").toContain("delUnused=ACCEPTED");
  });

  test("FORCED DISTURBANCE: with ON DELETE SET NULL the delete succeeds and strips real purchases", () => {
    const out = inRolledBackTx(
      "ALTER TABLE public.purchases ALTER COLUMN payment_term_id DROP NOT NULL;" +
        "ALTER TABLE public.purchases DROP CONSTRAINT purchases_payment_term_id_fkey;" +
        "ALTER TABLE public.purchases ADD CONSTRAINT purchases_payment_term_id_fkey " +
        "FOREIGN KEY (payment_term_id) REFERENCES public.payment_terms(id) ON DELETE SET NULL;" +
        attempt(
          "delUsed",
          "DELETE FROM public.payment_terms WHERE id = (SELECT payment_term_id FROM public.purchases LIMIT 1);",
        ) +
        "INSERT INTO probe SELECT 'stripped=' || count(*) FROM public.purchases WHERE payment_term_id IS NULL;",
    );
    expect(out, "the old FK rule must be what the new one is replacing").toContain(
      "delUsed=ACCEPTED",
    );
    // The exact number is data-dependent; what matters is that it is not zero.
    const stripped = out.find((l) => l.startsWith("stripped="));
    expect(
      stripped,
      "the disturbance must actually strip purchases, or it proves nothing",
    ).toBeDefined();
    expect(
      Number(stripped?.split("=")[1]),
      "at least one real purchase loses its term",
    ).toBeGreaterThan(0);
  });
});

test.describe("OG-100 — the migration wrote what it said it wrote", () => {
  test("the three constraints are live in the schema, not merely in the file", () => {
    const out = inRolledBackTx(`
INSERT INTO probe SELECT 'purchases.payment_term_id nullable=' || is_nullable
  FROM information_schema.columns
 WHERE table_schema='public' AND table_name='purchases' AND column_name='payment_term_id';
INSERT INTO probe SELECT 'payment_terms.days nullable=' || is_nullable
  FROM information_schema.columns
 WHERE table_schema='public' AND table_name='payment_terms' AND column_name='days';
INSERT INTO probe SELECT 'fk=' || pg_get_constraintdef(oid)
  FROM pg_constraint WHERE conname='purchases_payment_term_id_fkey';
INSERT INTO probe SELECT 'ledger423=' || EXISTS(
  SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20260904113000')::text;`);
    expect(out).toContain("purchases.payment_term_id nullable=NO");
    expect(out).toContain("payment_terms.days nullable=NO");
    expect(out.join("\n"), "the FK must RESTRICT, not SET NULL").toContain("ON DELETE RESTRICT");
    // Rule 2b: applying by psql does not write the ledger, so the row is recorded deliberately.
    expect(out, "an unrecorded migration reads as outstanding and gets re-run").toContain(
      "ledger423=true",
    );
  });

  test("no purchase lost its term when the migration ran", () => {
    const out = inRolledBackTx(`
INSERT INTO probe SELECT 'purchases=' || count(*) FROM public.purchases;
INSERT INTO probe SELECT 'termless=' || count(*) FROM public.purchases WHERE payment_term_id IS NULL;
INSERT INTO probe SELECT 'terms=' || count(*) FROM public.payment_terms;`);
    expect(out, "423 touches no existing row").toContain("termless=0");
    expect(
      out.some((l) => l.startsWith("purchases=")),
      "purchases must still be countable",
    ).toBe(true);
  });
});
