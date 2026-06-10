/**
 * توابع pure برای محاسبه سهمیه برچسب‌گذاری مالک محصول.
 * بدون وابستگی به Supabase/React/شبکه. کاملاً قابل unit-test.
 */

export type OwnerLabelQuotaRounding = "floor" | "round" | "ceil";

export interface OwnerLabelSummary {
  /** تعداد distinct محصولات واجد شرایط منسوب به owner. */
  eligibleCount: number;
  /** تعداد distinct محصولات eligible که حداقل یک owner-assignable label دارند. */
  taggedCount: number;
  /** سهمیه نهایی محاسبه‌شده. */
  quota: number;
  /** باقی‌مانده تا رسیدن به سهمیه؛ هرگز منفی نمی‌شود. */
  remaining: number;
  /** درصد پیشرفت [0..100]، نسبت به quota (نه نسبت به eligible). */
  progressPct: number;
  /** آیا سهمیه پوشش داده شده؟ */
  isMet: boolean;
}

function roundBy(value: number, rounding: OwnerLabelQuotaRounding): number {
  if (rounding === "ceil") return Math.ceil(value);
  if (rounding === "round") return Math.round(value);
  return Math.floor(value);
}

function safeNonNegInt(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

/**
 * محاسبه سهمیه:
 *  - eligibleCount <= 0 → 0
 *  - در غیر این صورت: quota = round(eligibleCount * ratio) با rounding انتخاب‌شده،
 *    سپس quota = max(minQuota, quota)، سپس quota = min(quota, eligibleCount).
 */
export function computeOwnerLabelQuota(
  eligibleCount: number,
  ratio: number,
  rounding: OwnerLabelQuotaRounding,
  minQuota: number,
): number {
  const eligible = safeNonNegInt(eligibleCount);
  if (eligible <= 0) return 0;

  const safeRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : 0;
  const safeMin = Math.max(0, safeNonNegInt(minQuota));

  let quota = roundBy(eligible * safeRatio, rounding);
  if (quota < safeMin) quota = safeMin;
  if (quota > eligible) quota = eligible;
  if (quota < 0) quota = 0;
  return quota;
}

export function buildOwnerLabelSummary(input: {
  eligibleCount: number;
  taggedCount: number;
  ratio: number;
  rounding: OwnerLabelQuotaRounding;
  minQuota: number;
}): OwnerLabelSummary {
  const eligibleCount = safeNonNegInt(input.eligibleCount);
  const taggedCountRaw = safeNonNegInt(input.taggedCount);
  // tagged نمی‌تواند از eligible بیشتر باشد.
  const taggedCount = Math.min(taggedCountRaw, eligibleCount);

  const quota = computeOwnerLabelQuota(eligibleCount, input.ratio, input.rounding, input.minQuota);
  const remaining = Math.max(0, quota - taggedCount);
  const denom = quota > 0 ? quota : 1;
  const progressPct = Math.max(0, Math.min(100, (taggedCount / denom) * 100));
  const isMet = quota > 0 && taggedCount >= quota;

  return { eligibleCount, taggedCount, quota, remaining, progressPct, isMet };
}

/**
 * تشخیص transition یک محصول از حالت untagged → tagged
 * نسبت به مجموعه owner-assignable labels.
 * فقط جهت تشخیص لحظهٔ ورود به «tagged» استفاده می‌شود؛ untagging جدا و خارج از scope این تابع.
 */
export function didProductBecomeTagged(
  prevLabelIds: readonly string[],
  nextLabelIds: readonly string[],
  ownerAssignableLabelIds: ReadonlySet<string>,
): boolean {
  if (ownerAssignableLabelIds.size === 0) return false;
  const prevHas = prevLabelIds.some((id) => ownerAssignableLabelIds.has(id));
  if (prevHas) return false;
  const nextHas = nextLabelIds.some((id) => ownerAssignableLabelIds.has(id));
  return nextHas;
}