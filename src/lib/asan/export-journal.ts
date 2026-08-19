/**
 * ASAN M4.5 / M4.6 — the accounting-document exports: receipts, payments and دوبل.
 *
 * `makeJournalExport` is the whole of exports 3, 4 and 5. Each is the **same** source function
 * and the **same** row builder with a different `doc_kind` filter and a different label; the
 * only thing that varies is which documents the accountant sees. If someone later forks one of
 * them, `export-journal.spec.ts` fails.
 *
 * All three carry `oneDocumentPerFile: true`. Asan takes `شماره سند` on the screen rather than
 * in a column, so two documents in one file would be silently merged under a single voucher
 * number. The shell enforces it; this file only declares it.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  buildJournalRows,
  groupJournalRows,
  type JournalExportPayload,
  type JournalExportRow,
} from "@/lib/asan/export-journal-rows";
import { existingAsanNumbers } from "@/lib/asan/export-numbers";
import type {
  AsanExportDefinition,
  AsanExportDocument,
  AsanExportKey,
  AsanExportRange,
} from "@/lib/asan/export-types";

export type JournalFilter =
  | "all"
  | "receipt"
  | "payment"
  | "third_party"
  | "settlement"
  | "purchase_and_settlement";

export async function listJournalDocuments(
  range: AsanExportRange,
  filter: JournalFilter,
): Promise<AsanExportDocument[]> {
  const { data, error } = await supabase.rpc("asan_list_journal_export", {
    _from: range.fromIso,
    _to: range.toIso,
    _filter: filter,
  });
  if (error) throw error;
  const rows = (data ?? []) as unknown as JournalExportRow[];
  const numbers = await existingAsanNumbers(
    "accounting_document",
    [...new Set(rows.map((r) => r.doc_id))],
  );
  return groupJournalRows(rows, numbers);
}

function makeJournalExport(
  key: AsanExportKey,
  label: string,
  filter: JournalFilter,
  unverifiedNote?: string,
): AsanExportDefinition {
  return {
    key,
    label,
    targetScreen: "ورود اطلاعات تولید یا سند از فایل Excel",
    layout: "journal",
    docType: "accounting_document",
    // Asan takes `شماره سند` on the screen, so one file holds exactly one document.
    oneDocumentPerFile: true,
    available: true,
    unverifiedNote,
    list: (range) => listJournalDocuments(range, filter),
    buildRows: (doc) => buildJournalRows(doc.payload as JournalExportPayload),
  };
}

const CONTROL_ACCOUNT_NOTE =
  "سندی که ردیف «سایر حساب‌ها» داشته باشد مسدود می‌شود: کد حساب آسان آن اعلام نشده و حدس زده " +
  "نمی‌شود. حساب واسط در آسان وجود ندارد و هرگز نوشته نمی‌شود.";

/** Export 3 — money coming in. */
export const RECEIPTS_EXPORT = makeJournalExport(
  "receipts",
  "دریافت‌ها و واریزها",
  "receipt",
  CONTROL_ACCOUNT_NOTE,
);

/** Export 4 — money going out. The mirror of export 3, on the same builder. */
export const PAYMENTS_EXPORT = makeJournalExport(
  "payments",
  "پرداخت‌ها و برداشت‌ها",
  "payment",
  CONTROL_ACCOUNT_NOTE,
);

/** Export 5 — دوبل: entries carrying an `external_party` line. */
export const THIRD_PARTY_EXPORT = makeJournalExport(
  "third_party",
  "اسناد شخص ثالث (دوبل)",
  "third_party",
  CONTROL_ACCOUNT_NOTE +
    " برای اسناد دوبل، اگر «شخص واسط» کد آسان نداشته باشد سند مسدود می‌شود و نام او اعلام می‌گردد.",
);

/** Export 6 — purchase payments and mutual settlements (owner 2026-08-19). */
export const PURCHASE_SETTLEMENT_EXPORT = makeJournalExport(
  "purchase_settlement",
  "پرداخت‌های خرید و تسویه",
  "purchase_and_settlement",
  CONTROL_ACCOUNT_NOTE,
);
