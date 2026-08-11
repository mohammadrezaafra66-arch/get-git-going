/**
 * ASAN M4.7 — the secondary bank-deposit export (`واریزیهای بانکی`).
 *
 * An **alternative** path for deposits. The accounting document from 4.5/4.6 remains the default;
 * this targets a different Asan screen that accepts a flat six-column list with **Latin**
 * headers. The label and the note say which is which, because an accountant choosing between two
 * deposit exports needs to know which dialog each one feeds.
 *
 * Layout 4's transliterations (`Name_Moshtari`, `Shomare_Peygiri`, `Mablagh`, `Bank_cod`) are
 * reproduced exactly as the Asan screen writes them — not translated, not spell-corrected. They
 * live in `layouts.ts`; the mapping lives in `export-bank-deposit-rows.ts`.
 *
 * `docType` is **null**: this layout carries no document-number column, so it consumes no Asan
 * number. Numbering exists to make a re-export stable, and there is nothing here to keep stable.
 * The same receipt exported through the accounting-document path *does* take a number, from the
 * `accounting_document` register — they are different Asan documents, and that is correct.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  buildBankDepositRows,
  groupBankDepositRows,
  type BankDepositPayload,
  type BankDepositRow,
} from "@/lib/asan/export-bank-deposit-rows";
import type {
  AsanExportDefinition,
  AsanExportDocument,
  AsanExportRange,
} from "@/lib/asan/export-types";

export async function listBankDeposits(range: AsanExportRange): Promise<AsanExportDocument[]> {
  const { data, error } = await supabase.rpc("asan_list_bank_deposit_export", {
    _from: range.fromIso,
    _to: range.toIso,
  });
  if (error) throw error;
  return groupBankDepositRows((data ?? []) as unknown as BankDepositRow[]);
}

export const BANK_DEPOSIT_EXPORT: AsanExportDefinition = {
  key: "bank_deposits",
  label: "واریزیهای بانکی (مسیر جایگزین)",
  targetScreen: "ورود اطلاعات از Excel ← گزینهٔ «واریزیهای بانکی»",
  layout: "bank_deposit",
  docType: null,
  oneDocumentPerFile: false,
  available: true,
  unverifiedNote:
    "این مسیرِ جایگزین است؛ مسیر پیش‌فرض برای دریافت‌ها «سند حسابداری» است. فقط فیش‌های " +
    "تأییدشده‌ای که به یکی از حساب‌های بانکی ما واریز شده‌اند در این فهرست می‌آیند.",
  list: listBankDeposits,
  buildRows: (doc) => buildBankDepositRows(doc.payload as BankDepositPayload),
};
