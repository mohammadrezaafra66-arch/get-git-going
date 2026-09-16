/** Shared Torob Ops Path B types (client + server). */

export const TOROB_OPS_SESSION_STORAGE_KEY = "afrakala.torob_ops.session";

export const FINDING_STATUSES = [
  "cheaper_competitor",
  "suspected_bait",
  "manual_review",
  "confirmed_bait",
  "legitimate_competitor",
  "reported",
  "cancelled",
] as const;

export type FindingStatus = (typeof FINDING_STATUSES)[number];

export const SCAN_RUN_STATUSES = ["queued", "running", "completed", "failed", "cancelled"] as const;

export type ScanRunStatus = (typeof SCAN_RUN_STATUSES)[number];

export const FINDING_STATUS_LABELS_FA: Record<FindingStatus, string> = {
  cheaper_competitor: "رقیب ارزان‌تر",
  suspected_bait: "طعمه مشکوک",
  manual_review: "نیاز به بررسی دستی",
  confirmed_bait: "طعمه تأییدشده",
  legitimate_competitor: "رقیب سالم",
  reported: "گزارش ثبت شد",
  cancelled: "لغو شده",
};

export const SCAN_STATUS_LABELS_FA: Record<ScanRunStatus, string> = {
  queued: "در صف",
  running: "در حال اجرا",
  completed: "تمام شده",
  failed: "خطا",
  cancelled: "لغو شده",
};
