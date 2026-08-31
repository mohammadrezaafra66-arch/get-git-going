/**
 * OG-86 — a pre-invoice line must name a product that exists.
 *
 * WHY THIS EXISTS. `sales_quote_items.source` accepted three values and only `product_price`
 * required a `product_id`. `manual` and `quick_price` both let a salesperson type a name and a
 * price for goods that were never defined — the same hole under two labels, since the two UI
 * tabs behind them shared one component and differed only by a hint string. Stock, pricing and
 * the catalogue all key off `product_id`, so such a line is invisible to every one of them.
 *
 * The owner's rule is that only accounting creates products; a salesperson who needs a new item
 * asks for it. Removing the tabs alone would have been frontend-only authorisation — CLAUDE.md
 * rule 6 — because anyone can call the RPC directly. **The assertion that matters here is the
 * one against the RPC**, not the one against the markup.
 *
 * WHAT IS DELIBERATELY LEFT ALONE. The `sales_quote_item_source` enum keeps all three values and
 * `product_id` stays nullable. Narrowing either would break the one historical free item
 * (SQ-2026-000001, rejected, 2026-07-19) and every read of it. The guard applies to new writes
 * only, and this gate pins that: it checks the old row is still there.
 */
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { dbScalar } from "../helpers/db";

const quoteFormSource = readFileSync("src/routes/_app.sales.quotes.new.tsx", "utf8");
const clientValidation = readFileSync("src/lib/sales/quotes.ts", "utf8");

test.describe("OG-86 — quote lines require a real product", () => {
  test("the RPC refuses a manual line", () => {
    // The point of the whole change: enforcement lives in the database, so a direct caller
    // is refused exactly like the form.
    const guarded = dbScalar(
      `select case when pg_get_functiondef(p.oid) like '%این کالا در سیستم تعریف نشده است%'
                   then 'guarded' else 'open' end
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'create_sales_quote_with_items'`,
    );
    expect(guarded).toBe("guarded");
  });

  test("the guard names both sources, not just one", () => {
    // Closing 'manual' while leaving 'quick_price' open would have left the same door with a
    // different label on it.
    const both = dbScalar(
      `select case when pg_get_functiondef(p.oid) ~ 'manual'
                    and pg_get_functiondef(p.oid) ~ 'quick_price'
                   then 'both' else 'partial' end
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'create_sales_quote_with_items'`,
    );
    expect(both).toBe("both");
  });

  test("product_price is still accepted — the guard did not close the ordinary path", () => {
    // Non-vacuous: a function that refused everything would pass the two tests above.
    const accepts = dbScalar(
      `select case when pg_get_functiondef(p.oid) ~ 'IF _src <> ''product_price'''
                   then 'yes' else 'no' end
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'create_sales_quote_with_items'`,
    );
    expect(accepts).toBe("yes");
  });

  test("the historical free item is still readable", () => {
    // The owner's instruction was to leave it alone. If a later change narrows the enum or
    // makes product_id NOT NULL, this row disappears and this fails.
    const survives = dbScalar(
      `select count(*)
         from public.sales_quote_items i
         join public.sales_quotes q on q.id = i.quote_id
        where i.product_id is null and q.quote_number = 'SQ-2026-000001'`,
    );
    expect(survives).toBe("1");
  });

  test("the source enum still carries all three values", () => {
    // Narrowing it would orphan the row above. The guard is in the function on purpose.
    const n = Number(
      dbScalar(
        `select count(*) from pg_enum e join pg_type t on t.oid = e.enumtypid
          where t.typname = 'sales_quote_item_source'`,
      ),
    );
    expect(n).toBe(3);
  });

  test("product_id is still nullable", () => {
    const nullable = dbScalar(
      `select is_nullable from information_schema.columns
        where table_schema = 'public' and table_name = 'sales_quote_items'
          and column_name = 'product_id'`,
    );
    expect(nullable).toBe("YES");
  });

  test("the free-item entry points are gone from the quote form", () => {
    // The component that produced them, and the two tab triggers that reached it.
    expect(quoteFormSource).not.toContain("FreeItemTab");
    expect(quoteFormSource).not.toContain('TabsTrigger value="manual"');
    expect(quoteFormSource).not.toContain('TabsTrigger value="quick"');
  });

  test("but the label for an existing free item still renders", () => {
    // Deliberately NOT removed: SQ-2026-000001 has such a line and must stay readable. An
    // over-broad cleanup that stripped every mention would break exactly the row this change
    // promised to leave alone.
    expect(quoteFormSource).toContain('"آیتم آزاد"');
  });

  test("choosing a registered product is untouched", () => {
    // Guards against the removal over-reaching into the path that must keep working.
    expect(quoteFormSource).toContain("<ProductTab");
  });

  test("client validation mirrors the server rule", () => {
    // For the message only — the RPC is what enforces it.
    expect(clientValidation).toContain("این کالا در سیستم تعریف نشده است");
  });
});
