/**
 * ASAN M4.3 — the sales-invoice row mapping, and nothing else.
 *
 * Split from `export-sales.ts` on purpose, for the same reason
 * `src/lib/export/receipt-export-rows.ts` was split out in P1+D8 phase 11: the data access
 * imports the Supabase browser client, which reads `import.meta.env` and therefore cannot be
 * loaded outside a Vite build. Keeping the mapping free of that import lets the phase test
 * assert **the shipped mapping itself** rather than a retyped copy of it — and a retyped copy is
 * exactly how the «ردشده» label bug slipped through in phase 11.
 *
 * The single conversion point for money is `tomanToRial`, reached through `amountCell`. The
 * database returns Toman untouched, so there is exactly one place a factor-of-ten error could
 * live and exactly one place the test has to pin down.
 */
import { tomanStringToRial } from "@/lib/asan/amounts";
import { isoToJalaliAsan } from "@/lib/asan/dates";
import type { AsanCell, AsanExportDocument } from "@/lib/asan/export-types";

/** One row of `asan_list_sales_export`, as PostgREST serialises it. */
export interface SalesExportRow {
  quote_id: string;
  quote_number: string | null;
  quote_date: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  person_code: string | null;
  final_amount: string | number | null;
  blocked_reason: string | null;
  line_no: number | null;
  product_code: string | null;
  product_name: string | null;
  product_barcode: string | null;
  quantity: string | number | null;
  unit_price: string | number | null;
  line_discount: string | number | null;
  line_total: string | number | null;
  cash_amount: string | number | null;
  bank_amount: string | number | null;
}

/** The document payload the shell carries around opaquely. */
export interface SalesExportPayload {
  lines: SalesExportRow[];
}

export const num = (v: string | number | null | undefined): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * A zero amount is written as an **empty cell**, not as `0`.
 *
 * "No discount" and "a discount of zero" are the same fact, and an empty cell is what the
 * accountant's own manual entry would leave. It also keeps one rule across I, J, L and M: an
 * empty cell means the amount does not apply. Asan's `بدون مبلغ حذف شود` reinforces it — a
 * zero-amount line is dropped on their side anyway.
 */
export const amountCell = (v: string | number | null | undefined): number | null => {
  const rial = tomanStringToRial(v ?? null);
  return rial === null || rial === 0 ? null : rial;
};

/**
 * Build the sheet rows for one invoice, in the exact 18-column order of `SALES_HEADERS`.
 *
 * Deliberately empty columns, each for a stated reason rather than an oversight:
 *   * **K** — the owner confirmed it is nothing on the sales tab (purchase has `پرداخت چک` in
 *     that position). It still occupies its place so L..R do not shift.
 *   * **M `عوارض`** — AfraKala records no duty or tax on a quote. There is no field to map.
 *   * **O `گروه حساب/کد۲`** — AfraKala has no Asan account-group concept.
 *   * **P `سریال کد کالا`** — AfraKala products carry no serial. Writing the internal SKU here
 *     would put an AfraKala identifier into a field Asan means for something else.
 *   * **Q `بارکد کالا`** — mapped, and empty in practice: barcode is 0 % populated (R1.5).
 * All of these are recorded in `docs/asan/UNVERIFIED-LAYOUTS.md`.
 *
 * A line whose product has **no Asan code** still exports, with column D empty — Asan mints a
 * code under group 101. That is the owner's rule and it is deliberately different from the
 * person rule, where a missing code blocks the whole document.
 */
export function buildSalesRows(
  payload: SalesExportPayload,
  asanNumber: number | null,
): AsanCell[][] {
  return payload.lines
    .filter((r) => r.line_no !== null)
    .map((r) => [
      asanNumber, // A شماره فاکتور
      isoToJalaliAsan(r.quote_date), // B تاریخ
      r.person_code ?? "", // C کدشخص
      r.product_code ?? "", // D کد کالا — empty is allowed; Asan mints under 101
      r.product_name ?? "", // E نام کالا
      num(r.quantity), // F تعداد
      amountCell(r.unit_price), // G مبلغ ق
      amountCell(r.line_total), // H مبلغ کل
      amountCell(r.cash_amount), // I دریافت نقد — document total, first line only
      amountCell(r.bank_amount), // J واریز به بانک — document total, first line only
      null, // K — confirmed empty by the owner
      amountCell(r.line_discount), // L تخفیف
      null, // M عوارض — AfraKala records none
      r.customer_name ?? "", // N نام حساب
      null, // O گروه حساب/کد۲ — no AfraKala counterpart
      null, // P سریال کد کالا — AfraKala products carry no serial
      r.product_barcode ?? "", // Q بارکد کالا
      r.customer_phone ?? "", // R تلفن/کد۳
    ]);
}

/** Group the flat line rows into documents, preserving the RPC's deterministic order. */
export function groupSalesRows(
  rows: SalesExportRow[],
  numbers: Map<string, number>,
): AsanExportDocument[] {
  const byQuote = new Map<string, SalesExportRow[]>();
  for (const r of rows) {
    const list = byQuote.get(r.quote_id);
    if (list) list.push(r);
    else byQuote.set(r.quote_id, [r]);
  }

  return [...byQuote.entries()].map(([quoteId, lines]) => {
    const head = lines[0];
    // A quote with no line items comes back as one row with a null `line_no`. It is blocked and
    // named rather than dropped, so `rowCount` counts real lines only.
    const real = lines.filter((l) => l.line_no !== null);
    return {
      sourceId: quoteId,
      title: head.quote_number ?? quoteId,
      dateIso: head.quote_date ?? "",
      partyName: head.customer_name ?? "",
      totalToman: num(head.final_amount),
      rowCount: real.length,
      asanNumber: numbers.get(quoteId) ?? null,
      blockedReason: head.blocked_reason,
      payload: { lines } satisfies SalesExportPayload,
    };
  });
}
