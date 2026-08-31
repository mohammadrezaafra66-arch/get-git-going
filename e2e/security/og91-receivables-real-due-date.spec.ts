/**
 * OG-91 — the receivables report shows a real settlement due date.
 *
 * WHY THIS EXISTS. Measured live before migration 419, under an admin JWT:
 *
 *   invoice_number | due_date | days_until_due | is_overdue | aging_bucket
 *   SQ-2026-000004 | NULL     | NULL           | f          | current
 *   … eight rows, all identical …
 *
 * Not one due date, nothing overdue, everything filed as 'current' regardless of age. The cause was
 * a single wrong source: due_date came from `sales_quotes.expires_at`, the quote's VALIDITY
 * deadline, which is NULL on every accepted quote — and days_until_due, is_overdue and aging_bucket
 * all derived from it, so one NULL disabled the entire report silently.
 *
 * After 419 the same probe returns seven real dates and three overdue rows. The behaviour is proven
 * in the database, where it lives: docs/verification/419-gate.sql (9 assertions, inside
 * BEGIN … ROLLBACK) with docs/verification/419-disturbance-back-to-expires-at.sql, which puts the
 * old expression back and turns three of them red.
 *
 * This file guards the decisions a later edit could quietly undo, and the two places the marker has
 * to appear.
 */
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const migration = readFileSync(
  "supabase/migrations/20260831210000_419_receivables_due_date_from_settlement_terms.sql",
  "utf8",
);
const page = readFileSync("src/routes/_app.accounting.receivables.tsx", "utf8");

// Everything the payables report depends on. If any of these appears in a receivables change,
// the "payables must not change" constraint has been violated.
const PAYABLES_DEPENDENCIES = [
  "_app.accounting.payables",
  "vw_supplier_payables",
  "get_payables_list",
  "get_payables_summary",
  "get_payable_detail",
];

test.describe("OG-91 — the receivables due date", () => {
  test("the due date is accepted_at + settlement days", () => {
    expect(migration).toContain("(q.accepted_at + ((st.days || ' days'::text)::interval))::date");
    expect(migration).toContain("LEFT JOIN settlement_types st ON st.id = q.settlement_type_id");
  });

  test("expires_at is gone from the view statement", () => {
    // Scoped to the CREATE OR REPLACE VIEW statement alone, and narrowed twice.
    //
    // A file-wide assertion fails because the header comment and the recovery block quote the old
    // definition verbatim — and they must, that is the point of the recovery block. Scoping to
    // "everything after the recovery block" still fails, because the migration's own apply-time
    // check reads `IF _def LIKE '%expires_at%' THEN RAISE EXCEPTION`, which necessarily contains
    // the word it is looking for.
    //
    // Both failures were the assertion's fault, not the migration's. The assertion was narrowed
    // to the one statement whose text the claim is actually about; nothing in the migration moved.
    const start = migration.indexOf("CREATE OR REPLACE VIEW");
    const end = migration.indexOf("is_viewer_only(uid());", start);
    expect(start, "the view statement must exist").toBeGreaterThan(-1);
    expect(end, "the view statement must terminate").toBeGreaterThan(start);
    const viewStatement = migration.slice(start, end);
    expect(viewStatement).not.toContain("expires_at");
    expect(viewStatement).toContain("accepted_at");
  });

  test("the migration verifies that itself, at apply time", () => {
    expect(migration).toContain("419: the view still references expires_at");
  });

  test("inactive AND days = 0 yields no date at all", () => {
    // The owner's rule. A 0 on a type nobody maintains means nobody ever set it, not "same day";
    // showing the acceptance date would be a wrong number carrying a reassuring label.
    expect(migration).toContain("WHEN st.is_active = false AND st.days = 0 THEN NULL::date");
    expect(migration).toContain("'inactive_zero_days'::text");
  });

  test("inactive AND days > 0 keeps its date and is flagged instead", () => {
    expect(migration).toContain(
      "st.id IS NOT NULL AND st.is_active = false AND st.days > 0 AS settlement_inactive_flag",
    );
  });

  test("active AND days = 0 is an ordinary row -- no marker", () => {
    // Non-vacuous partner to the two above: پیش واریز(نقدی) genuinely means same-day, and four of
    // the eight live rows are on it. A rule that flagged days=0 unconditionally would pass every
    // other assertion in this file and be wrong on half the report.
    expect(migration).not.toContain("st.days = 0 AS settlement_inactive_flag");
    expect(migration).not.toMatch(/WHEN st\.days = 0 THEN NULL::date/);
  });

  test("a date it does not know is never invented", () => {
    const ddl = migration.slice(migration.indexOf("CREATE OR REPLACE VIEW"));
    expect(ddl).not.toMatch(/due_date[\s\S]{0,80}tehran_today\(\)\s*AS due_date/);
    expect(ddl).not.toMatch(/COALESCE\([^)]*accepted_at[^)]*q\.created_at[^)]*\)/);
  });

  test("the page renders both markers", () => {
    expect(page).toContain("سررسید نامشخص");
    expect(page).toContain("نوع تسویه غیرفعال");
  });

  test("the marker reaches every place a due date is shown", () => {
    // Desktop table, mobile card, and the detail drawer. Missing one leaves the accountant with a
    // blank cell and no explanation in exactly the place they went looking for one.
    const uses = page.match(/<DueDate row=\{/g) ?? [];
    expect(uses.length).toBe(3);
  });

  test("the flags are carried through the RPC, not just the view", () => {
    // The page reads get_receivables_list, which enumerates its columns; adding them to the view
    // alone would leave the markers stranded in the database.
    expect(migration).toContain("due_date_unknown boolean, due_date_unknown_reason text");
    expect(migration).toContain("settlement_inactive_flag boolean");
    expect(page).toContain("due_date_unknown: boolean | null;");
  });

  test("the previous definitions are recoverable from the migration itself", () => {
    expect(migration).toContain("RECOVERY BLOCK");
    expect(migration).toContain("as pg_get_viewdef printed it before 419");
    expect(migration).toContain("as pg_get_functiondef printed it before 419");
  });

  test("the summary function was deliberately left alone", () => {
    // It returns only aggregates and reads the view, so it picks up the new values with no
    // signature change. Rebuilding it would have been risk for nothing.
    const ddl = migration.slice(migration.indexOf("CREATE OR REPLACE VIEW"));
    expect(ddl).not.toMatch(/(CREATE|DROP)[\s\S]{0,40}FUNCTION[\s\S]{0,60}get_receivables_summary/i);
  });

  test("payables is untouched", () => {
    // The hard constraint. vw_supplier_payables may appear ONCE, in the header comment that credits
    // it as the pattern being copied -- but never in the executable half.
    const ddl = migration.slice(migration.indexOf("CREATE OR REPLACE VIEW"));
    for (const dep of PAYABLES_DEPENDENCIES) {
      expect(ddl, `${dep} must not appear in the migration's DDL`).not.toContain(dep);
    }
  });
});
