/** Shared Torob Ops Path A/B types (client + server). */

export const TOROB_OPS_SESSION_STORAGE_KEY = "afrakala.torob_ops.session";

export const FINDING_STATUSES = [
  "cheaper_competitor",
  "suspected_bait",
  "manual_review",
  "confirmed_bait",
  "legitimate_competitor",
  "queued_for_report",
  "reporting",
  "reported",
  "report_failed",
  "cancelled",
] as const;

export type FindingStatus = (typeof FINDING_STATUSES)[number];

export const SCAN_RUN_STATUSES = ["queued", "running", "completed", "failed", "cancelled"] as const;

export type ScanRunStatus = (typeof SCAN_RUN_STATUSES)[number];

export const ACCOUNT_STATUSES = ["active", "quarantine", "disabled"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const FINDING_STATUS_LABELS_FA: Record<FindingStatus, string> = {
  cheaper_competitor: "رقیب ارزان‌تر",
  suspected_bait: "طعمه مشکوک",
  manual_review: "نیاز به بررسی دستی",
  confirmed_bait: "طعمه تأییدشده",
  legitimate_competitor: "رقیب سالم",
  queued_for_report: "در صف گزارش خودکار",
  reporting: "در حال گزارش",
  reported: "گزارش ثبت شد",
  report_failed: "گزارش ناموفق",
  cancelled: "لغو شده",
};

export const SCAN_STATUS_LABELS_FA: Record<ScanRunStatus, string> = {
  queued: "در صف",
  running: "در حال اجرا",
  completed: "تمام شده",
  failed: "خطا",
  cancelled: "لغو شده",
};

export const ACCOUNT_STATUS_LABELS_FA: Record<AccountStatus, string> = {
  active: "فعال",
  quarantine: "قرنطینه",
  disabled: "غیرفعال",
};
