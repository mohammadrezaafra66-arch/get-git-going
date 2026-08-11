/**
 * ASAN M4.2 — the export catalogue.
 *
 * One entry per export the owner asked for. The shell renders whatever is here, so adding an
 * export is a data change and never a change to the page.
 *
 * Entries flipped from `notBuiltYet` to real definitions as phases 4.3–4.7 landed; as of 4.7 all
 * six are built, so `notBuiltYet` is no longer referenced here. It stays in `export-types.ts`
 * because it is the right shape for the next export somebody specifies before building: an entry
 * the accountant can see, which refuses to produce a file rather than emitting a guessed layout.
 */
import type { AsanExportDefinition, AsanExportKey } from "@/lib/asan/export-types";
import { BANK_DEPOSIT_EXPORT } from "@/lib/asan/export-bank-deposit";
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
  bank_deposits: BANK_DEPOSIT_EXPORT, // M4.7 — the alternative deposit path
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
