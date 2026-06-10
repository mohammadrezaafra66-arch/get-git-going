/**
 * توابع pure برای محاسبه سهمیه و خلاصه وضعیت برچسب‌گذاری مالک محصول.
 * بدون وابستگی به Supabase، بدون Date.now، کاملاً تست‌پذیر.
 */

import type { OwnerLabelQuotaRounding } from "./owner-label-config";

function applyRounding(value: number, rounding: OwnerLabelQuotaRounding): number {
  switch (rounding) {
    case "ceil":
      return Math.ceil(value);
    case "round":
      return Math.round(value);
    case "floor":
    default:
      return Math.floor(value);
  }
}

function safeNonNegativeInt(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

/**
 * محاسبه سهمیه برچسب‌گذاری برای یک مالک.
 * - ورودی منفی/NaN به صفر clamp می‌شود.
 * - اگر eligibleCount === 0 → خروجی 0 (min بی‌اثر؛ چیزی برای هدف‌گیری نیست).
 * - در غیر این صورت: max(minQuota, round(eligibleCount * ratio)).
 */
export function computeOwnerLabelQuota(
  eligibleCount: number,
  ratio: number,
  rounding: OwnerLabelQuotaRounding,
  minQuota: number,
): number {
  const eligible = safeNonNegativeInt(eligibleCount);
  if (eligible === 0) return 0;

  const safeRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : 0;
  const safeMin = safeNonNegativeInt(minQuota);

  const raw = applyRounding(eligible * safeRatio, rounding);
  return Math.max(safeMin, Math.max(0, raw));
}

export interface OwnerLabelSummary {
  /** distinct productهای منسوب به این owner که واجد شرایط هستند. */
  eligibleCount: number;
  /** distinct productهای این owner که حداقل یک owner-assignable label دارند. */
  taggedCount: number;
  /** سهمیه محاسبه‌شده. */
  quota: number;
  /** باقی‌مانده تا رسیدن به سهمیه (هرگز منفی). */
  remaining: number;
  /** درصد پیشرفت در بازه [0, 100]. */
  progressPct: number;
  /** آیا سهمیه برآورده شده است؟ */
  isMet: boolean;
}

/**
 * ساخت خلاصه کامل وضعیت سهمیه برای نمایش در UI/گزارش‌ها.
 */
export function buildOwnerLabelSummary(input: {
  eligibleCount: number;
  taggedCount: number;
  ratio: number;
  rounding: OwnerLabelQuotaRounding;
  minQuota: number;
}): OwnerLabelSummary {
  const eligibleCount = safeNonNegativeInt(input.eligibleCount);
  const taggedCountRaw = safeNonNegativeInt(input.taggedCount);
  // taggedCount نباید از eligibleCount بیشتر شود (محافظت در برابر دیتای ناسازگار).
  const taggedCount = Math.min(taggedCountRaw, eligibleCount);

  const quota = computeOwnerLabelQuota(eligibleCount, input.ratio, input.rounding, input.minQuota);
  const remaining = Math.max(0, quota - taggedCount);
  const denominator = Math.max(quota, 1);
  const progressPct = Math.max(0, Math.min(100, (taggedCount / denominator) * 100));
  const isMet = quota === 0 ? true : taggedCount >= quota;

  return { eligibleCount, taggedCount, quota, remaining, progressPct, isMet };
}

/**
 * تشخیص transition `untagged → tagged` برای یک محصول.
 * true فقط اگر prev هیچ owner-assignable label نداشته و next حداقل یکی داشته باشد.
 * تشخیص جهت معکوس (tagged → untagged) خارج از scope این تابع است.
 */
export function didProductBecomeTagged(
  prevLabelIds: readonly string[],
  nextLabelIds: readonly string[],
  ownerAssignableLabelIds: ReadonlySet<string>,
): boolean {
  const hadAny = prevLabelIds.some((id) => ownerAssignableLabelIds.has(id));
  if (hadAny) return false;
  return nextLabelIds.some((id) => ownerAssignableLabelIds.has(id));
}