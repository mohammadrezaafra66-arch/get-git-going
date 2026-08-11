/** سطل‌های سنی مشترک بین گزارش مطالبات و بدهی‌ها (هم‌نام با ستون `aging_bucket` در DB). */
export type AgingBucket = "current" | "d1_30" | "d31_60" | "d61_90" | "d90_plus";

export type AgingBucketTone = "ok" | "warn" | "danger" | "critical";

export const AGING_BUCKETS: {
  key: AgingBucket;
  label: string;
  /** کلید مبلغ در خروجی توابع خلاصه */
  amountField: string;
  /** کلید تعداد در خروجی توابع خلاصه */
  countField: string;
  tone: AgingBucketTone;
}[] = [
  {
    key: "current",
    label: "سررسید نشده",
    amountField: "bucket_current",
    countField: "count_current",
    tone: "ok",
  },
  {
    key: "d1_30",
    label: "۱ تا ۳۰ روز",
    amountField: "bucket_d1_30",
    countField: "count_d1_30",
    tone: "warn",
  },
  {
    key: "d31_60",
    label: "۳۱ تا ۶۰ روز",
    amountField: "bucket_d31_60",
    countField: "count_d31_60",
    tone: "warn",
  },
  {
    key: "d61_90",
    label: "۶۱ تا ۹۰ روز",
    amountField: "bucket_d61_90",
    countField: "count_d61_90",
    tone: "danger",
  },
  {
    key: "d90_plus",
    label: "بیش از ۹۰ روز",
    amountField: "bucket_d90_plus",
    countField: "count_d90_plus",
    tone: "critical",
  },
];

export const AGING_TONE_TEXT: Record<AgingBucketTone, string> = {
  ok: "text-emerald-600 dark:text-emerald-400",
  warn: "text-amber-600 dark:text-amber-400",
  danger: "text-orange-600 dark:text-orange-400",
  critical: "text-destructive",
};

export const AGING_TONE_BADGE: Record<AgingBucketTone, string> = {
  ok: "border-emerald-500/40 text-emerald-700 dark:text-emerald-400",
  warn: "border-amber-500/40 text-amber-700 dark:text-amber-400",
  danger: "border-orange-500/40 text-orange-700 dark:text-orange-400",
  critical: "border-destructive/50 text-destructive",
};
