/**
 * ASAN M4 — the currency unit.
 *
 * AfraKala stores **Toman**. Asan expects **Rial**. The owner resolved this explicitly
 * (docs/execution/OWNER_ANSWERS_AND_OVERRIDES.md, "CURRENCY UNIT"), and it is the single
 * highest-risk conversion in the whole program: a factor-of-ten error here posts wrong
 * numbers into live accounting.
 *
 * Rules, all of them deliberate:
 *
 *  1. Integer arithmetic only. `x * 10` on an integer is exact in IEEE-754 for every value
 *     this business will ever see, but `x * 10` on a fraction is not, so a fractional Toman
 *     amount is refused rather than silently rounded. Every amount column measured on the
 *     live database is whole (0 fractional rows in `sales_quotes`), so refusing is safe and
 *     a fractional value appearing later is a genuine surprise worth stopping for.
 *
 *  2. Nothing here formats. Amounts are written to the sheet as **numbers**, never as strings
 *     with separators, so Excel can sum them and so no locale ever reverses the digits.
 *
 *  3. `null` in, `null` out. An amount that does not apply is left **empty** in the file, not
 *     zero — Asan's `بدون مبلغ حذف شود` drops zero-amount rows, so writing 0 where we mean
 *     "not applicable" changes what Asan imports.
 */

/** Asan's unit is Rial; AfraKala's is Toman. */
export const RIAL_PER_TOMAN = 10;

/** Shown in the export UI so the accountant can see the conversion happened. */
export const AMOUNT_UNIT_LABEL_FA = "ریال";
export const AMOUNT_UNIT_NOTE_FA =
  "مبلغ‌ها در فایل خروجی به «ریال» نوشته می‌شوند (مقدار افراکالا به تومان است و ×۱۰ می‌شود).";

export class AmountConversionError extends Error {
  constructor(value: number) {
    super(`مبلغ «${value}» عدد صحیح تومانی نیست و قابل تبدیل به ریال نیست.`);
    this.name = "AmountConversionError";
  }
}

/**
 * Toman → Rial. Returns null for null/undefined so an inapplicable amount stays an empty cell.
 * Throws on anything that is not a whole, finite number — never rounds silently.
 */
export function tomanToRial(toman: number | null | undefined): number | null {
  if (toman === null || toman === undefined) return null;
  if (!Number.isFinite(toman) || !Number.isInteger(toman)) {
    throw new AmountConversionError(toman as number);
  }
  return toman * RIAL_PER_TOMAN;
}

/**
 * The same conversion for a value that may arrive as a string from PostgREST — `numeric`
 * columns are serialised as strings by design, so this is the common path.
 */
export function tomanStringToRial(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return tomanToRial(n);
}
