/**
 * ASAN M4.5 / M4.6 — the accounting-document exports: receipts, payments and دوبل.
 *
 * `makeJournalExport` is the whole of exports 3, 4, 5 and 6. Each is the **same** source
 * function and the **same** row builder with a different `doc_kind` filter and a different
 * label; the only thing that varies is which documents the accountant sees. If someone later
 * forks one of them, `export-journal.spec.ts` fails.
 *
 * **One file may hold many documents (2026-09-04).** These exports used to declare a
 * one-document-per-file flag here, and the shell refused a selection of more than one. The premise
 * was that Asan takes `شماره سند` on its screen, so a second document would be merged under the
 * first one's voucher number. The owner has since established that **Asan assigns the document
 * number itself at posting time**, so the number this platform holds never reaches the file at
 * all — corroborated on the code side by `buildRows` below, which discards the `asanNumber`
 * argument the shell passes. The flag, the shell guard and the orphan constant beside the
 * layout were all removed together; nothing in the database
 * ever imposed a cap. The `asan_export_numbers` register still records a number per document,
 * because it is how a re-export is recognised as the same document — it is simply not written
 * into layout 3.
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
