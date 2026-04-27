export type FeedbackType = "bug" | "process_issue" | "improvement" | "operational";
export type FeedbackStatus =
  | "new" | "reviewing" | "accepted" | "rejected" | "converted_to_task" | "closed";

export const FEEDBACK_TYPES: { value: FeedbackType; label: string }[] = [
  { value: "bug", label: "ایراد نرم‌افزاری" },
  { value: "process_issue", label: "مشکل فرآیندی" },
  { value: "improvement", label: "پیشنهاد بهبود" },
  { value: "operational", label: "مشکل عملیاتی" },
];

export const FEEDBACK_TYPE_LABELS: Record<FeedbackType, string> =
  FEEDBACK_TYPES.reduce((a, t) => ({ ...a, [t.value]: t.label }), {} as Record<FeedbackType, string>);

export const FEEDBACK_STATUSES: { value: FeedbackStatus; label: string; color: string }[] = [
  { value: "new",                label: "جدید",         color: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30" },
  { value: "reviewing",          label: "در حال بررسی", color: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300 border-yellow-500/30" },
  { value: "accepted",           label: "پذیرفته‌شده",   color: "bg-green-500/15 text-green-700 dark:text-green-300 border-green-500/30" },
  { value: "rejected",           label: "رد شده",       color: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30" },
  { value: "converted_to_task",  label: "تبدیل به وظیفه", color: "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30" },
  { value: "closed",             label: "بسته‌شده",      color: "bg-muted text-muted-foreground border-border" },
];

export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> =
  FEEDBACK_STATUSES.reduce((a, s) => ({ ...a, [s.value]: s.label }), {} as Record<FeedbackStatus, string>);

export const FEEDBACK_STATUS_COLORS: Record<FeedbackStatus, string> =
  FEEDBACK_STATUSES.reduce((a, s) => ({ ...a, [s.value]: s.color }), {} as Record<FeedbackStatus, string>);
