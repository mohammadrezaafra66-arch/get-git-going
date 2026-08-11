/**
 * ASAN M4.8 — exporting one pre-invoice from its detail page.
 *
 * Per the owner this file is **for importing into Asan**, so it follows the sales layout from
 * 4.3 rather than any customer-facing format.
 *
 * The brief's requirement is that a single-quote export be **byte-identical** to that quote's
 * rows inside a range export covering the same quote. The way to guarantee that is not to be
 * careful; it is to make a second mapping impossible. So this calls the **same** RPC
 * (`asan_list_sales_export`), passing the quote's own date as both ends of the range, filters to
 * the one quote, and hands the result to the **same** `buildInvoiceRows`. There is nothing here
 * that could disagree with the range export, because there is nothing here that maps anything.
 *
 * The number comes from the same `asan_assign_document_numbers` register too, so a quote
 * exported from its detail page and later re-exported in a range keeps the number it was given.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  buildInvoiceRows,
  type InvoiceExportPayload,
} from "@/lib/asan/export-invoice-rows";
import { listSalesDocuments } from "@/lib/asan/export-sales";
import { SALES_HEADERS } from "@/lib/asan/layouts";
import { downloadAsanWorkbook } from "@/lib/asan/write-xlsx";
import type { AsanCell, AsanExportDocument } from "@/lib/asan/export-types";

export class SingleQuoteNotExportableError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "SingleQuoteNotExportableError";
  }
}

/**
 * Find one quote in the export listing. Returns the document whether or not it is exportable —
 * a blocked quote must be reported with its reason, never silently treated as absent.
 */
export async function findQuoteForExport(
  quoteId: string,
  dateIso: string,
): Promise<AsanExportDocument | null> {
  const docs = await listSalesDocuments({ fromIso: dateIso, toIso: dateIso });
  return docs.find((d) => d.sourceId === quoteId) ?? null;
}

/** Assign (or re-read) this quote's Asan number and build its rows. */
export async function buildSingleQuoteRows(
  doc: AsanExportDocument,
): Promise<{ rows: AsanCell[][]; asanNumber: number }> {
  if (doc.blockedReason) throw new SingleQuoteNotExportableError(doc.blockedReason);

  const { data, error } = await supabase.rpc("asan_assign_document_numbers", {
    _doc_type: "sales_invoice",
    _ids: [doc.sourceId],
  });
  if (error) throw error;
  const assigned = ((data ?? []) as { source_id: string; asan_number: number }[])[0];
  if (!assigned) {
    throw new SingleQuoteNotExportableError("شمارهٔ سند آسان برای این پیش‌فاکتور تخصیص نیافت.");
  }

  return {
    rows: buildInvoiceRows(doc.payload as InvoiceExportPayload, assigned.asan_number),
    asanNumber: assigned.asan_number,
  };
}

/**
 * The whole detail-page action: locate, number, build, download.
 *
 * Throws with a Persian reason when the quote is not exportable — the same reason the range
 * preview would show — rather than producing a partial file.
 */
export async function downloadSingleQuoteExport(
  quoteId: string,
  quoteNumber: string,
  dateIso: string,
): Promise<number> {
  const doc = await findQuoteForExport(quoteId, dateIso);
  if (!doc) {
    throw new SingleQuoteNotExportableError(
      "این پیش‌فاکتور در فهرست خروجی آسان نیست: فقط پیش‌فاکتورهای قطعی‌شده‌ای که موجودی‌شان کسر " +
        "شده قابل خروجی‌اند.",
    );
  }
  const { rows } = await buildSingleQuoteRows(doc);
  return downloadAsanWorkbook(
    { headers: SALES_HEADERS, rows, sheetName: "Asan" },
    `asan-sales-${quoteNumber}.xlsx`,
  );
}
