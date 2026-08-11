/**
 * ASAN M4 — the column layouts, exactly as `docs/asan/asan-layouts.md` records them.
 *
 * These arrays ARE the contract with Asan. Two rules:
 *
 *  1. **Order and text are reproduced character for character.** A header that merely looks
 *     right imports into the wrong column. The phase tests compare against these constants and
 *     against the document, so a silent edit here fails the suite rather than the accountant.
 *
 *  2. **Column K of the sales layout is deliberately blank** — the owner confirmed it is
 *     nothing ("SALES-TAB COLUMN K — RESOLVED"). It still occupies its position, because
 *     removing it would shift L..R one column left. An empty header string is how a column
 *     that exists but has no name is written.
 *
 * The Latin transliterations in Layout 4 are reproduced as written, not translated and not
 * "corrected" — they are what the Asan screen expects.
 */

/** Layout 1 — sales invoice (`فروش` tab), 18 columns A–R. */
export const SALES_HEADERS: readonly string[] = [
  "شماره فاکتور", // A
  "تاریخ", // B
  "کدشخص", // C
  "کد کالا", // D
  "نام کالا", // E
  "تعداد", // F
  "مبلغ ق", // G
  "مبلغ کل", // H
  "دریافت نقد", // I
  "واریز به بانک", // J
  "", // K — intentionally blank, confirmed by the owner
  "تخفیف", // L
  "عوارض", // M
  "نام حساب", // N
  "گروه حساب/کد۲", // O
  "سریال کد کالا", // P
  "بارکد کالا", // Q
  "تلفن/کد۳", // R
] as const;

/** Layout 2 — purchase invoice (`خرید` tab). Identical to sales except I, J and K. */
export const PURCHASE_HEADERS: readonly string[] = [
  "شماره فاکتور", // A
  "تاریخ", // B
  "کدشخص", // C
  "کد کالا", // D
  "نام کالا", // E
  "تعداد", // F
  "مبلغ ق", // G
  "مبلغ کل", // H
  "پرداخت نقد", // I
  "پرداخت از بانک", // J
  "پرداخت چک", // K — present and verified on this tab, unlike sales
  "تخفیف", // L
  "عوارض", // M
  "نام حساب", // N
  "گروه حساب/کد۲", // O
  "سریال کد کالا", // P
  "بارکد کالا", // Q
  "تلفن/کد۳", // R
] as const;

/** Layout 3 — accounting document, 6 columns A–F. Serves receipts, payments and دوبل. */
export const JOURNAL_HEADERS: readonly string[] = [
  "کد حساب", // A
  "کد کالا", // B
  "شرح", // C
  "تعداد", // D
  "بدهکار", // E
  "بستانکار", // F
] as const;

/** Layout 4 — bank deposits (`واریزیهای بانکی`). Latin headers, reproduced verbatim. */
export const BANK_DEPOSIT_HEADERS: readonly string[] = [
  "Date", // A
  "Code_M", // B
  "Name_Moshtari", // C
  "Shomare_Peygiri", // D
  "Mablagh", // E
  "Bank_cod", // F
] as const;

export type AsanLayoutKey = "sales" | "purchase" | "journal" | "bank_deposit";

export const LAYOUT_HEADERS: Record<AsanLayoutKey, readonly string[]> = {
  sales: SALES_HEADERS,
  purchase: PURCHASE_HEADERS,
  journal: JOURNAL_HEADERS,
  bank_deposit: BANK_DEPOSIT_HEADERS,
};

export const LAYOUT_LABELS_FA: Record<AsanLayoutKey, string> = {
  sales: "فاکتور فروش (تب فروش)",
  purchase: "فاکتور خرید (تب خرید)",
  journal: "سند حسابداری",
  bank_deposit: "واریزیهای بانکی",
};

/**
 * Layout 3 carries its document number on the SCREEN (`شماره سند`), not in a column, so one
 * file must contain exactly one accounting document. Emitting two would silently merge them
 * under a single voucher number. The exports that use this layout enforce it.
 */
export const JOURNAL_ONE_DOCUMENT_PER_FILE = true;
