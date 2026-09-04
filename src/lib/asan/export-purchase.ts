/**
 * ASAN M4.4 — export 2, purchase invoices (the `خرید` tab).
 *
 * Structurally identical to sales: one sheet row per line, the invoice number repeating. The
 * row mapping is **the same function** (`buildInvoiceRows`), because the two tabs are the same
 * eighteen columns and differ only in the header texts of I, J and K. A second mapper for
 * eighteen identical columns is the parallel implementation rule 14 forbids.
 *
 * Purchase invoices use their **own** Asan register: `docType: "purchase_invoice"`, so the first
 * purchase exported is number 1 even though sales has already reached N.
 *
 * Columns I, J and K (`پرداخت نقد` / `پرداخت از بانک` / `پرداخت چک`) come out empty, and that is
 * a measured fact rather than an omission: nothing in this database records **how** a purchase
 * was paid. `payment_receipt_links` has no purchase column, `purchase_receipts` holds uploaded
 * images, and `paid_at` is NULL on all 289 purchases. `paid_at` alone would say *that* something
 * was paid, never *how*, so filling `پرداخت نقد` from it would be a guess about a payment
 * method. Recorded in `docs/asan/UNVERIFIED-LAYOUTS.md` instead.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  buildInvoiceRows,
  groupInvoiceRows,
  type InvoiceExportPayload,
  type InvoiceExportRow,
} from "@/lib/asan/export-invoice-rows";
import { existingAsanNumbers } from "@/lib/asan/export-numbers";
import type {
  AsanExportDefinition,
  AsanExportDocument,
  AsanExportRange,
} from "@/lib/asan/export-types";

export async function listPurchaseDocuments(range: AsanExportRange): Promise<AsanExportDocument[]> {
  const { data, error } = await supabase.rpc("asan_list_purchase_export", {
    _from: range.fromIso,
    _to: range.toIso,
  });
  if (error) throw error;
  const rows = (data ?? []) as unknown as InvoiceExportRow[];
  const numbers = await existingAsanNumbers(
    "purchase_invoice",
    [...new Set(rows.map((r) => r.doc_id))],
  );
  return groupInvoiceRows(rows, numbers);
}

export const PURCHASE_EXPORT: AsanExportDefinition = {
  key: "purchase",
  label: "فاکتورهای خرید",
  targetScreen: "ارسال یا دریافت اطلاعات توسط Excel ← تب «خرید»",
  layout: "purchase",
  docType: "purchase_invoice",
  available: true,
  unverifiedNote:
    "ستون‌های «پرداخت نقد»، «پرداخت از بانک» و «پرداخت چک» خالی می‌مانند: در افراکالا هیچ‌جا ثبت " +
    "نمی‌شود که یک خرید چگونه پرداخت شده است. ستون‌های «تخفیف»، «عوارض»، «گروه حساب/کد۲» و " +
    "«سریال کد کالا» نیز معادلی در افراکالا ندارند.",
  list: listPurchaseDocuments,
  buildRows: (doc, asanNumber) => buildInvoiceRows(doc.payload as InvoiceExportPayload, asanNumber),
};
