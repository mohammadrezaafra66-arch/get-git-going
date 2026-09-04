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

/**
 * Layout 4 — the bank file (`واریزوپرداخت_بانکی.xlsx`). Latin headers, reproduced verbatim.
 *
 * **Corrected 2026-08-26 from the real Asan template, read cell by cell.** This file
 * previously wrote `Name_Moshtari` and `Shomare_Peygiri`; the owner supplied the actual
 * `.xlsx` and it holds `Name_Moshtare` (C) and `Shopmare_Peygeri` (D). Both look like
 * misspellings and both are **legacy-intentional in Asan** — they must NOT be
 * "corrected" back. A header that merely looks right imports into the wrong column of live
 * accounting software, so the measured file wins over anyone's spelling instinct, including
 * the two e2e specs that previously asserted the wrong pair.
 *
 * **G–O are empty strings, not absent cells.** The real template is 15 columns wide, and
 * `aoa_to_sheet` writes no cell at all for `null` while `""` writes a real empty cell — so
 * the padding has to be `""` for the sheet to come out `max_col = 15` like the original.
 */
export const BANK_DEPOSIT_HEADERS: readonly string[] = [
  "Date", // A
  "Code_M", // B
  "Name_Moshtare", // C — legacy-intentional spelling, measured from the real template
  "Shopmare_Peygeri", // D — legacy-intentional spelling, measured from the real template
  "Mablagh", // E
  "Bank_cod", // F
  "", // G
  "", // H
  "", // I
  "", // J
  "", // K
  "", // L
  "", // M
  "", // N
  "", // O
] as const;

/** The named part of layout 4 — A–F. G–O are padding and carry no header text. */
export const BANK_DEPOSIT_NAMED_COLUMN_COUNT = 6;

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
