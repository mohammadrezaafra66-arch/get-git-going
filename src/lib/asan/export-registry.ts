/**
 * ASAN M4.2 — the export catalogue.
 *
 * One entry per export the owner asked for. The shell renders whatever is here, so adding an
 * export is a data change and never a change to the page.
 *
 * Entries flip from `notBuiltYet` to a real definition as each phase lands. Until then the
 * entry is visible and honest: the accountant can see the export exists, and the page refuses
 * to produce a file rather than emitting a half-guessed layout.
 */
import {
  notBuiltYet,
  type AsanExportDefinition,
  type AsanExportKey,
} from "@/lib/asan/export-types";
import { SALES_EXPORT } from "@/lib/asan/export-sales";

export const ASAN_EXPORTS: Record<AsanExportKey, AsanExportDefinition> = {
  sales: SALES_EXPORT, // M4.3
  purchase: notBuiltYet(
    "purchase",
    "فاکتورهای خرید",
    "ارسال یا دریافت اطلاعات توسط Excel ← تب «خرید»",
    "purchase",
    "purchase_invoice",
  ),
  receipts: notBuiltYet(
    "receipts",
    "دریافت‌ها و واریزها",
    "ورود اطلاعات تولید یا سند از فایل Excel",
    "journal",
    "accounting_document",
    true,
  ),
  payments: notBuiltYet(
    "payments",
    "پرداخت‌ها و برداشت‌ها",
    "ورود اطلاعات تولید یا سند از فایل Excel",
    "journal",
    "accounting_document",
    true,
  ),
  third_party: notBuiltYet(
    "third_party",
    "اسناد شخص ثالث (دوبل)",
    "ورود اطلاعات تولید یا سند از فایل Excel",
    "journal",
    "accounting_document",
    true,
  ),
  bank_deposits: notBuiltYet(
    "bank_deposits",
    "واریزیهای بانکی (مسیر جایگزین)",
    "ورود اطلاعات از Excel ← گزینهٔ «واریزیهای بانکی»",
    "bank_deposit",
    null,
  ),
};

/** Display order in the export-type selector. */
export const ASAN_EXPORT_ORDER: AsanExportKey[] = [
  "sales",
  "purchase",
  "receipts",
  "payments",
  "third_party",
  "bank_deposits",
];
