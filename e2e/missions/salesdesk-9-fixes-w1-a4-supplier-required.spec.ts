/**
 * Wave 1 / A4 · FIX — supplier required on purchases INSERT / clear-on-UPDATE.
 *
 * Before migration 561 a rolled-back NULL insert was ACCEPTED (see
 * docs/missions/salesdesk-9-fixes/evidence/W1/a4-before.txt). After the
 * trigger, the same statement must refuse with ASCII message SUPPLIER_REQUIRED
 * (SQLSTATE P0001). Legacy NULL rows stay editable for other columns.
 *
 * Writes run only inside BEGIN…ROLLBACK via inRolledBackTx (rule 12).
 *
 * Run:
 *   cmd /c "node_modules\.bin\playwright.cmd test --config=docs/missions/salesdesk-9-fixes/evidence/W1/playwright.w1.config.ts e2e/missions/salesdesk-9-fixes-w1-a4-supplier-required.spec.ts"
 */
import { expect, test } from "@playwright/test";

import { mintJwt, rest, ADMIN_USER_ID, errMessage } from "../helpers/pgrest";
import { inRolledBackTx } from "../helpers/tx";

/** Trap a statement; report ACCEPTED or REFUSED + SQLSTATE + message head. */
const attempt = (label: string, stmt: string) => `
DO $probe$
BEGIN
  BEGIN
    ${stmt}
    INSERT INTO probe VALUES ('${label}=ACCEPTED');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO probe VALUES (
      '${label}=REFUSED ' || SQLSTATE || ' msg=' || left(SQLERRM, 120)
    );
  END;
END
$probe$;`;

const NULL_INSERT = `
INSERT INTO public.purchases (
  supplier_id, payment_term_id, total_amount, quantity, purchase_date, status, notes
) VALUES (
  NULL,
  (SELECT id FROM public.payment_terms WHERE is_active LIMIT 1),
  0, 1, CURRENT_DATE, 'draft',
  '[TEST-9FIX] A4 null-supplier insert'
);`;

test.describe("W1 A4 — SQL probe SUPPLIER_REQUIRED (after migration)", () => {
  test("NULL supplier INSERT is refused with SUPPLIER_REQUIRED", () => {
    const out = inRolledBackTx(attempt("null_insert", NULL_INSERT));
    const line = out.find((l) => l.startsWith("null_insert="));
    expect(line, `probe: ${out.join("|")}`).toBeTruthy();
    expect(line!, "before 561 this was ACCEPTED — see a4-before.txt").toMatch(
      /null_insert=REFUSED P0001/,
    );
    expect(line!).toMatch(/SUPPLIER_REQUIRED/);
  });

  test("clearing a non-null supplier_id on UPDATE is refused with SUPPLIER_REQUIRED", () => {
    const out = inRolledBackTx(
      attempt(
        "clear_supplier",
        `UPDATE public.purchases
            SET supplier_id = NULL
          WHERE id = (
            SELECT id FROM public.purchases
             WHERE supplier_id IS NOT NULL
             LIMIT 1
          );`,
      ),
    );
    const line = out.find((l) => l.startsWith("clear_supplier="));
    expect(line, `probe: ${out.join("|")}`).toMatch(/clear_supplier=REFUSED P0001/);
    expect(line!).toMatch(/SUPPLIER_REQUIRED/);
  });

  test("legacy NULL supplier rows remain editable for other columns", () => {
    const out = inRolledBackTx(
      attempt(
        "legacy_null_edit",
        `UPDATE public.purchases
            SET notes = coalesce(notes, '') || ' [TEST-9FIX-A4]'
          WHERE id = (
            SELECT id FROM public.purchases
             WHERE supplier_id IS NULL
             LIMIT 1
          );`,
      ),
    );
    const line = out.find((l) => l.startsWith("legacy_null_edit="));
    expect(
      line,
      "need at least one legacy supplier_id IS NULL purchase on the test DB",
    ).toBe("legacy_null_edit=ACCEPTED");
  });

  test("INSERT with a real supplier_id is still accepted", () => {
    const out = inRolledBackTx(
      attempt(
        "with_supplier",
        `INSERT INTO public.purchases (
           supplier_id, payment_term_id, total_amount, quantity, purchase_date, status, notes
         ) VALUES (
           (SELECT id FROM public.suppliers LIMIT 1),
           (SELECT id FROM public.payment_terms WHERE is_active LIMIT 1),
           0, 1, CURRENT_DATE, 'draft',
           '[TEST-9FIX] A4 with-supplier insert'
         );`,
      ),
    );
    expect(out).toContain("with_supplier=ACCEPTED");
  });

  test("FORCED DISTURBANCE: without the trigger the NULL insert is ACCEPTED", () => {
    // Proves the first test is reading THIS trigger, not some other constraint.
    // DROP TRIGGER is rolled back with the outer transaction.
    const out = inRolledBackTx(
      `DROP TRIGGER IF EXISTS trg_purchases_require_supplier ON public.purchases;
       DROP TRIGGER IF EXISTS trg_purchases_supplier_required ON public.purchases;` +
        attempt("null_insert", NULL_INSERT),
    );
    expect(
      out,
      "if this still refuses, something other than the A4 trigger is doing the work",
    ).toContain("null_insert=ACCEPTED");
  });
});

test.describe("W1 A4 — PostgREST cannot bypass the trigger", () => {
  test("authenticated PATCH clearing supplier_id returns SUPPLIER_REQUIRED", async () => {
    // Pick a purchase that already has a supplier — PATCH is the hole A4 closes
    // for clients that hold UPDATE (see OG-100 rationale).
    const jwt = mintJwt(ADMIN_USER_ID);
    const list = await rest<{ id: string; supplier_id: string | null }[]>(
      jwt,
      `/purchases?select=id,supplier_id&supplier_id=not.is.null&limit=1`,
    );
    expect(list.status, list.text).toBeLessThan(300);
    const row = list.body?.[0];
    expect(row?.id, "need a purchase with supplier_id for the PATCH probe").toBeTruthy();

    const patch = await rest(jwt, `/purchases?id=eq.${row!.id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ supplier_id: null }),
    });

    // PostgREST surfaces raise exception as 400/409 with message containing the code.
    expect(patch.status, patch.text).toBeGreaterThanOrEqual(400);
    const blob = `${errMessage(patch.body)} ${patch.text}`;
    expect(blob).toMatch(/SUPPLIER_REQUIRED/);
  });
});
