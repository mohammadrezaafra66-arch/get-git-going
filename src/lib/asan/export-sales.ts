/**
 * ASAN M4.3 — export 1, sales invoices (the `فروش` tab).
 *
 * One sheet row per invoice **line**; the invoice number repeats across its lines, because
 * columns D–H are per item. That is how the Asan layout works.
 *
 * The exportable set is decided in the database (migrations 292/293), not here. The owner's rule
 * is "finalized by the accountant AND stock already deducted", and that definition decides what
 * enters live accounting, so it lives where a direct PostgREST call also hits it.
 *
 * The row mapping lives in `export-invoice-rows.ts` and is **shared with the purchase export** —
 * the two tabs are the same eighteen columns and differ only in three header texts.
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

export async function listSalesDocuments(range: AsanExportRange): Promise<AsanExportDocument[]> {
  const { data, error } = await supabase.rpc("asan_list_sales_export", {
    _from: range.fromIso,
    _to: range.toIso,
  });
  if (error) throw error;
  const rows = (data ?? []) as unknown as InvoiceExportRow[];
  const numbers = await existingAsanNumbers(
    "sales_invoice",
    [...new Set(rows.map((r) => r.doc_id))],
  );
  return groupInvoiceRows(rows, numbers);
}

export const SALES_EXPORT: AsanExportDefinition = {
  key: "sales",
  label: "فاکتورهای فروش",
  targetScreen: "ارسال یا دریافت اطلاعات توسط Excel ← تب «فروش»",
  layout: "sales",
  docType: "sales_invoice",
  oneDocumentPerFile: false,
  available: true,
  unverifiedNote:
    "ستون‌های «عوارض»، «گروه حساب/کد۲» و «سریال کد کالا» عمداً خالی می‌مانند: افراکالا معادلی " +
    "برای آن‌ها ندارد. ستون «K» نیز طبق تأیید مالک در تب فروش خالی است.",
  list: listSalesDocuments,
  buildRows: (doc, asanNumber) => buildInvoiceRows(doc.payload as InvoiceExportPayload, asanNumber),
};
