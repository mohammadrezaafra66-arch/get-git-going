import type {
  WorkDecisionBucket,
  WorkImpactLevel,
  WorkItemKind,
  WorkItemPriority,
  WorkItemStatus,
  WorkMode,
  WorkTopicStatus,
} from "@/lib/work";

export const STATUS_LABELS: Record<WorkItemStatus, string> = {
  pending: "در انتظار",
  in_progress: "در حال انجام",
  testing: "در حال آزمون",
  done: "انجام‌شده",
  cancelled: "لغو شده",
};

export const KIND_LABELS: Record<WorkItemKind, string> = {
  question: "سؤال",
  change_request: "درخواست تغییر",
  bug: "باگ",
  note: "یادداشت",
};

export const PRIORITY_LABELS: Record<WorkItemPriority, string> = {
  low: "کم",
  normal: "عادی",
  high: "بالا",
};

export const BUCKET_LABELS: Record<WorkDecisionBucket, string> = {
  today_decide: "امروز تصمیم",
  today_do: "امروز انجام",
  waiting: "در انتظار",
};

export const MODE_LABELS: Record<WorkMode, string> = {
  request: "درخواست",
  executable: "اجرایی",
};

export const IMPACT_LABELS: Record<WorkImpactLevel, string> = {
  none: "بدون اثر",
  low: "کم",
  medium: "متوسط",
  high: "زیاد",
  blocker: "مسدودکننده",
};

export const TOPIC_STATUS_LABELS: Record<WorkTopicStatus, string> = {
  open: "باز",
  closed: "بسته",
};

export const ALL_STATUSES = Object.keys(STATUS_LABELS) as WorkItemStatus[];
export const ALL_KINDS = Object.keys(KIND_LABELS) as WorkItemKind[];
export const ALL_PRIORITIES = Object.keys(PRIORITY_LABELS) as WorkItemPriority[];
export const ALL_BUCKETS = Object.keys(BUCKET_LABELS) as WorkDecisionBucket[];
export const ALL_MODES = Object.keys(MODE_LABELS) as WorkMode[];
export const ALL_IMPACTS = Object.keys(IMPACT_LABELS) as WorkImpactLevel[];
