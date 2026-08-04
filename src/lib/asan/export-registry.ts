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
import { PURCHASE_EXPORT } from "@/lib/asan/export-purchase";
import {
  PAYMENTS_EXPORT,
  RECEIPTS_EXPORT,
  THIRD_PARTY_EXPORT,
} from "@/lib/asan/export-journal";

export const ASAN_EXPORTS: Record<AsanExportKey, AsanExportDefinition> = {
  sales: SALES_EXPORT, // M4.3
  purchase: PURCHASE_EXPORT, // M4.4
  // M4.6 — three filters over one builder, not three exports.
  receipts: RECEIPTS_EXPORT,
  payments: PAYMENTS_EXPORT,
  third_party: THIRD_PARTY_EXPORT,
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
