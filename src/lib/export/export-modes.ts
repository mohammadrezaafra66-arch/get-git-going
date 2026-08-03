/**
 * Phase 11 / decision D8-6 — export mode selection and the Asan adapter seam.
 *
 * The owner asked for two export modes and for the EXISTING export to be left
 * untouched. Both requirements are structural here:
 *
 *   - "standard" is the export that exists today. Its row builder is called
 *     with no options and returns exactly what it returned before this phase.
 *     The hard gate for phase 11 is that the standard file is unchanged for
 *     the same input, so nothing in this module may reach into that path.
 *
 *   - "asan" is NOT implemented, on purpose. See ASAN_LAYOUT_UNAVAILABLE below.
 *
 * Why an adapter interface at all, rather than a boolean and an `if`: the Asan
 * bridge (docs/asan/ASAN_BRIDGE.md, section B5) defines FIVE separate layouts — sales
 * invoices, purchase invoices, double-entry vouchers, bank receipts and bank
 * payments. They differ only in column mapping, so the seam belongs at "given
 * these records, produce these columns", which is what AsanExportAdapter is.
 */

export type ExportMode = "standard" | "asan";

export type ExportOptions = {
  mode: ExportMode;
  /**
   * Decisions 44–45: whether product line detail appears in the export.
   * When false the file has one row per document, exactly as before this
   * phase. When true a document with N product lines becomes N rows.
   */
  includeLineDetail: boolean;
};

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  mode: "standard",
  includeLineDetail: false,
};

export const EXPORT_MODE_LABELS: Record<ExportMode, string> = {
  standard: "خروجی معمولی",
  asan: "خروجی آسان",
};

/** A row is an ordered map of Persian header -> cell value. */
export type ExportRow = Record<string, string | number | boolean | null>;

/**
 * What every Asan layout must provide. Deliberately narrow: the five layouts
 * differ in columns, not in how the file is written.
 */
export interface AsanExportAdapter {
  /** Which Asan import dialog this produces a file for. */
  readonly documentKind:
    | "sales_invoice"
    | "purchase_invoice"
    | "accounting_voucher"
    | "bank_receipt"
    | "bank_payment";
  /** Persian name shown to the user. */
  readonly label: string;
  /** True once the real column layout has been configured and verified. */
  readonly isConfigured: boolean;
  buildRows(records: unknown[], options: ExportOptions): ExportRow[];
}

/**
 * Raised instead of producing a file. Carries a Persian message because it is
 * shown directly to the accountant.
 */
export class AsanLayoutNotConfiguredError extends Error {
  constructor(label: string) {
    super(
      `قالب «${label}» هنوز پیکربندی نشده است. برای ساخت این خروجی، فایل نمونهٔ واقعی ` +
        `نرم‌افزار آسان لازم است تا ترتیب و عنوان دقیق ستون‌ها از روی آن تنظیم شود. ` +
        `تا آن زمان این خروجی عمداً تولید نمی‌شود.`,
    );
    this.name = "AsanLayoutNotConfiguredError";
  }
}

/**
 * ⚠️ INTENTIONALLY REFUSES TO PRODUCE OUTPUT.
 *
 * The phase 11 brief is explicit: do not guess the Asan column layout, because
 * "a wrong layout that silently imports into the owner's accounting software is
 * worse than no feature". That judgement is correct and this placeholder
 * enforces it rather than merely documenting it.
 *
 * STATUS OF THE LAYOUT, measured rather than assumed (2026-08-04):
 *   - No sample Asan import file exists in the repository. The two .xlsx files
 *     in the root (اشخاص.xlsx, کالا.xlsx) are Asan EXPORTS of people and
 *     products — they are the import-INTO-the-assistant direction, and say
 *     nothing about the column order Asan expects when importing FROM us.
 *   - The only untracked image in the root is an unrelated photo of a Docker
 *     error, not the Asan screenshots the specification refers to.
 *   - docs/asan/ASAN_BRIDGE.md section B5 DOES list candidate columns (A–R for sales and
 *     purchase, A–F for the voucher). That text is transcribed from screenshots
 *     this session has never seen, and B5 itself still says the bank layout
 *     must be "verified against the live Asan dialog before finalising".
 *
 * So a layout description exists, but nothing that can be VERIFIED against.
 * Wiring it in blind would produce a file that looks authoritative and imports
 * silently into the owner's live accounting software — the precise failure the
 * brief forbids. Whether to adopt the docs/asan/ASAN_BRIDGE.md layout is the owner's
 * call, and docs/asan/ASAN_BRIDGE.md is itself a separate mission that requires the
 * owner's approval before any of it is built.
 */
export function createUnconfiguredAsanAdapter(
  documentKind: AsanExportAdapter["documentKind"],
  label: string,
): AsanExportAdapter {
  return {
    documentKind,
    label,
    isConfigured: false,
    buildRows() {
      throw new AsanLayoutNotConfiguredError(label);
    },
  };
}

/** The five layouts docs/asan/ASAN_BRIDGE.md B5 names. All unconfigured today. */
export const ASAN_ADAPTERS = {
  sales_invoice: createUnconfiguredAsanAdapter("sales_invoice", "فاکتور فروش آسان"),
  purchase_invoice: createUnconfiguredAsanAdapter("purchase_invoice", "فاکتور خرید آسان"),
  accounting_voucher: createUnconfiguredAsanAdapter("accounting_voucher", "سند حسابداری آسان"),
  bank_receipt: createUnconfiguredAsanAdapter("bank_receipt", "دریافت بانکی آسان"),
  bank_payment: createUnconfiguredAsanAdapter("bank_payment", "پرداخت بانکی آسان"),
} as const;
