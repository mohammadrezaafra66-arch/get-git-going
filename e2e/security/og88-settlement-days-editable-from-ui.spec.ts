/**
 * OG-88 — the owner can set a settlement deadline without a developer.
 *
 * WHY THIS EXISTS. The owner's own description of the need: "today 1-, 2- and 3-day settlement is
 * active. Tomorrow I might also enable 4-day. The day after I might leave only 1- and 2-day."
 * None of that was possible. `settlement_types.days` existed, was NOT NULL DEFAULT 0, and was 0
 * on all eleven rows -- because no UI ever wrote it. The form's zod schema had exactly five keys
 * (code, title, description, sort_order, is_active) and the page's payload literal had the same
 * five, so a new type was born with days = 0 and could never be changed from a screen.
 *
 * Three layers also disagreed about who owns the page, and the mismatch was silent:
 *   page guard ["admin","accountant"] · RLS ARRAY['admin','manager'] · menu adminOnly (admin|manager)
 * An accountant reached the page, hit RLS, and got a zero-row UPDATE -- which is not an error, so
 * the page took its success branch and told them the change was saved when nothing had changed.
 * Migration 416 and the registry change put all three on admin + accountant.
 *
 * The live half -- that an accountant's UPDATE now lands and a manager's no longer does, and that
 * an inserted days value survives instead of falling back to the column default -- is proven
 * against the database inside BEGIN … ROLLBACK; it cannot be asserted from source. This file
 * guards the half that source can prove: that the value is carried end to end and not dropped
 * somewhere between the form and the insert.
 */
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const form = readFileSync("src/shared/components/SettlementTypeForm.tsx", "utf8");
const page = readFileSync("src/routes/_app.pricing.settlement-types.tsx", "utf8");
const quoteForm = readFileSync("src/routes/_app.sales.quotes.new.tsx", "utf8");
const registry = readFileSync("src/lib/navigation/registry.ts", "utf8");
const migration = readFileSync(
  "supabase/migrations/20260831140000_416_settlement_types_write_matches_the_page_guard.sql",
  "utf8",
);

test.describe("OG-88 — the settlement deadline is editable", () => {
  test("the schema accepts a day count", () => {
    expect(form).toContain("days: z");
    expect(form).toContain(".int(");
  });

  test("zero is allowed, because that is what cash means", () => {
    // A min(1) here would make the most common settlement type unrepresentable.
    expect(form).toContain('.min(0, "مهلت تسویه نمی‌تواند منفی باشد")');
  });

  test("the form renders a field for it", () => {
    expect(form).toContain("مهلت تسویه (روز)");
    expect(form).toContain("value={values.days}");
  });

  test("the value is carried into the payload that is actually written", () => {
    // The whole defect in one line: the payload literal is what reaches .insert() and .update(),
    // and days was absent from it.
    expect(page).toContain("days: values.days");
  });

  test("the list query reads it back", () => {
    // Without this the edit dialog opens with days = 0 and silently zeroes a saved value on save.
    expect(page).toContain("sort_order, days");
  });

  test("the owner can see the current deadline without opening the form", () => {
    expect(page).toContain("مهلت تسویه");
  });

  test("all three role layers name the same two roles", () => {
    expect(page).toContain('ALLOWED: AppRole[] = ["admin", "accountant"]');
    expect(migration).toContain("ARRAY['admin'::text, 'accountant'::text]");
    expect(migration).not.toContain("'manager'::text]");
    expect(registry).toContain('allowedRoles: ["admin", "accountant"]');
  });

  test("a change to the active set reaches the salesperson in seconds, not minutes", () => {
    // 10 minutes meant a type switched off was still offered, and the first sign of the change
    // was the RPC refusing the quote.
    //
    // Scoped to this one query on purpose. Two unrelated queries in the same file are still on
    // 10 minutes (sale-price-types-active among them); they are a separate question and were
    // deliberately not touched, so a file-wide assertion here would fail for the wrong reason.
    const start = quoteForm.indexOf('queryKey: ["settlement-types-active"]');
    expect(start, "the settlement picker query must still exist").toBeGreaterThan(-1);
    const block = quoteForm.slice(start, quoteForm.indexOf("});", start));
    expect(block).toContain("staleTime: 30_000");
    expect(block).not.toContain("10 * 60_000");
  });

  test("nothing else on the form was dropped", () => {
    // Non-vacuous scope guard: a rewrite that lost a field would otherwise pass every test above.
    for (const key of ["code:", "title:", "description:", "sort_order:", "is_active:"]) {
      expect(form).toContain(key);
    }
    expect(page).toContain("sort_order: values.sort_order");
    expect(page).toContain("is_active: values.is_active");
  });
});
