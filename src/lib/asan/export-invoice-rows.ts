/**
 * ASAN M4.3 / M4.4 — the invoice row mapping, shared by sales and purchase.
 *
 * The two layouts are the **same 18 columns** and differ in exactly three header texts:
 *
 *   |     | sales           | purchase        |
 *   |-----|-----------------|-----------------|
 *   | I   | دریافت نقد      | پرداخت نقد      |
 *   | J   | واریز به بانک   | پرداخت از بانک  |
 *   | K   | *(empty)*       | پرداخت چک       |
 *
 * So there is **one** builder, and the difference between the two exports is data rather than
 * code: a sales document never carries a cheque amount, so column K comes out empty exactly as
 * the owner confirmed it must, and a purchase document puts its cheque amount in the same slot.
 * Writing a second mapper for eighteen identical columns is precisely the parallel
 * implementation rule 14 forbids, and it is how two files drift until only one of them is right.
 *
 * This module is deliberately free of the Supabase import — `import.meta.env` cannot be resolved
 * outside a Vite build — so the phase tests exercise **the shipped mapping** rather than a
 * retyped copy. Retyping a mapping is how the «ردشده» label bug reached a file in P1+D8 phase 11.
 *
 * The single conversion point for money is `tomanToRial`, reached through `amountCell`. Every
 * source query returns Toman untouched, so there is exactly one place a factor-of-ten error
 * could live and exactly one place the tests have to pin down.
 */
import { tomanStringToRial } from "@/lib/asan/amounts";
import { isoToJalaliAsan } from "@/lib/asan/dates";
import type { AsanCell, AsanExportDocument } from "@/lib/asan/export-types";

/**
 * One line row as `asan_list_sales_export` / `asan_list_purchase_export` serialise it.
 *
 * The two functions return the same shape on purpose; `cheque_amount` is simply always null on
 * the sales side, because the sales tab has no cheque column.
 */
export interface InvoiceExportRow {
  doc_id: string;
  doc_number: string | null;
  doc_date: string | null;
  party_name: string | null;
  party_phone: string | null;
  person_code: string | null;
  doc_total: string | number | null;
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
  cheque_amount?: string | number | null;
}

/** The document payload the shell carries around opaquely. */
export interface InvoiceExportPayload {
  lines: InvoiceExportRow[];
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
 * accountant's own manual entry would leave. It also keeps one rule across I, J, K, L and M: an
 * empty cell means the amount does not apply. Asan's `بدون مبلغ حذف شود` reinforces it — a
 * zero-amount line is dropped on their side anyway.
 */
export const amountCell = (v: string | number | null | undefined): number | null => {
  const rial = tomanStringToRial(v ?? null);
  return rial === null || rial === 0 ? null : rial;
};

/**
 * Build the sheet rows for one invoice, in the exact 18-column order of the layout.
 *
 * Deliberately empty columns, each for a stated reason rather than an oversight:
 *   * **K on the sales tab** — the owner confirmed it is nothing there. It still occupies its
 *     place so L..R do not shift. On the purchase tab the same slot is `پرداخت چک`.
 *   * **M `عوارض`** — AfraKala records no duty or tax. There is no field to map.
 *   * **O `گروه حساب/کد۲`** — AfraKala has no Asan account-group concept.
 *   * **P `سریال کد کالا`** — AfraKala products carry no serial. Writing the internal SKU here
 *     would put an AfraKala identifier into a field Asan means for something else.
 *   * **Q `بارکد کالا`** — mapped, and empty in practice: barcode is 0 % populated (R1.5).
 * All are recorded in `docs/asan/UNVERIFIED-LAYOUTS.md`.
 *
 * A line whose product has **no Asan code** still exports, with column D empty — Asan mints a
 * code under group 101. That is the owner's rule and it is deliberately different from the
 * person rule, where a missing code blocks the whole document.
 */
export function buildInvoiceRows(
  payload: InvoiceExportPayload,
  asanNumber: number | null,
): AsanCell[][] {
  return payload.lines
    .filter((r) => r.line_no !== null)
    .map((r) => [
      asanNumber, // A شماره فاکتور
      isoToJalaliAsan(r.doc_date), // B تاریخ
      r.person_code ?? "", // C کدشخص
      r.product_code ?? "", // D کد کالا — empty is allowed; Asan mints under 101
      r.product_name ?? "", // E نام کالا
      num(r.quantity), // F تعداد
      amountCell(r.unit_price), // G مبلغ ق
      amountCell(r.line_total), // H مبلغ کل
      amountCell(r.cash_amount), // I دریافت/پرداخت نقد — document total, first line only
      amountCell(r.bank_amount), // J واریز/پرداخت بانک — document total, first line only
      amountCell(r.cheque_amount), // K پرداخت چک on purchase; always empty on sales
      amountCell(r.line_discount), // L تخفیف
      null, // M عوارض — AfraKala records none
      r.party_name ?? "", // N نام حساب
      null, // O گروه حساب/کد۲ — no AfraKala counterpart
      null, // P سریال کد کالا — AfraKala products carry no serial
      r.product_barcode ?? "", // Q بارکد کالا
      r.party_phone ?? "", // R تلفن/کد۳
    ]);
}

/** Group the flat line rows into documents, preserving the source query's deterministic order. */
export function groupInvoiceRows(
  rows: InvoiceExportRow[],
  numbers: Map<string, number>,
): AsanExportDocument[] {
  const byDoc = new Map<string, InvoiceExportRow[]>();
  for (const r of rows) {
    const list = byDoc.get(r.doc_id);
    if (list) list.push(r);
    else byDoc.set(r.doc_id, [r]);
  }

  return [...byDoc.entries()].map(([docId, lines]) => {
    const head = lines[0];
    // A document with no line items comes back as one row with a null `line_no`. It is blocked
    // and named rather than dropped, so `rowCount` counts real lines only.
    const real = lines.filter((l) => l.line_no !== null);
    return {
      sourceId: docId,
      title: head.doc_number ?? docId,
      dateIso: head.doc_date ?? "",
      partyName: head.party_name ?? "",
      totalToman: num(head.doc_total),
      rowCount: real.length,
      asanNumber: numbers.get(docId) ?? null,
      blockedReason: head.blocked_reason,
      payload: { lines } satisfies InvoiceExportPayload,
    };
  });
}
