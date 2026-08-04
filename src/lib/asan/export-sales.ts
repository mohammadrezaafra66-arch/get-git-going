/**
 * ASAN M4.3 — export 1, sales invoices (the `فروش` tab).
 *
 * One sheet row per invoice **line**; the invoice number repeats across its lines, because
 * columns D–H are per item. That is how the Asan layout works.
 *
 * The exportable set is decided in the database (migration 292), not here. The owner's rule is
 * "finalized by the accountant AND stock already deducted", and that definition decides what
 * enters live accounting, so it lives where a direct PostgREST call also hits it. This module
 * only fetches and hands off to the mapping in `export-sales-rows.ts`, which is kept free of
 * the Supabase import so the phase test can assert the shipped mapping itself.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  buildSalesRows,
  groupSalesRows,
  type SalesExportPayload,
  type SalesExportRow,
} from "@/lib/asan/export-sales-rows";
import type {
  AsanExportDefinition,
  AsanExportDocument,
  AsanExportRange,
} from "@/lib/asan/export-types";

/** Numbers already assigned to these quotes, so the preview can show them before download. */
async function existingNumbers(quoteIds: string[]): Promise<Map<string, number>> {
  if (quoteIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("asan_export_numbers")
    .select("source_id, asan_number")
    .eq("doc_type", "sales_invoice")
    .in("source_id", quoteIds);
  if (error) throw error;
  return new Map((data ?? []).map((r) => [r.source_id as string, r.asan_number as number]));
}

export async function listSalesDocuments(range: AsanExportRange): Promise<AsanExportDocument[]> {
  const { data, error } = await supabase.rpc("asan_list_sales_export", {
    _from: range.fromIso,
    _to: range.toIso,
  });
  if (error) throw error;
  const rows = (data ?? []) as unknown as SalesExportRow[];
  const numbers = await existingNumbers([...new Set(rows.map((r) => r.quote_id))]);
  return groupSalesRows(rows, numbers);
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
  buildRows: (doc, asanNumber) => buildSalesRows(doc.payload as SalesExportPayload, asanNumber),
};
