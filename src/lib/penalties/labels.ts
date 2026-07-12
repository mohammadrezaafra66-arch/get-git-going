export const PENALTY_TYPE_FA: Record<string, string> = {
  no_response_primary: "عدم پاسخ مسئول خرید اول در ۱۰ دقیقه",
  no_response_secondary: "عدم پاسخ مسئول خرید دوم پس از انتقال",
  no_confirm_store: "عدم تأیید مسئول فروشگاه در ۱۰ دقیقه",
  repeated_invalid_answer: "پاسخ نامعتبر تکراری",
  frequent_delay: "تأخیر مکرر",
  frequent_price_edit: "اصلاح مکرر قیمت",
  wrong_inquiry: "استعلام اشتباه",
  free_product_attempt: "تلاش برای ثبت محصول آزاد",
};

export const PENALTY_SEVERITY_FA: Record<string, string> = {
  low: "کم",
  medium: "متوسط",
  high: "زیاد",
};

export const APPEAL_STATUS_FA: Record<string, string> = {
  pending: "در انتظار",
  accepted: "پذیرفته شد",
  rejected: "رد شد",
};

export const SEVERITY_CLASS: Record<string, string> = {
  low: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-200",
  medium: "bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/40 dark:text-orange-200",
  high: "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/40 dark:text-red-200",
};

export const APPEAL_STATUS_CLASS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/40 dark:text-yellow-200",
  accepted: "bg-green-100 text-green-800 border-green-300 dark:bg-green-900/40 dark:text-green-200",
  rejected: "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/40 dark:text-red-200",
};

export const APPEAL_WINDOW_MS = 24 * 60 * 60 * 1000;

export function remainingAppealMs(createdAt: string | Date): number {
  const created = typeof createdAt === "string" ? new Date(createdAt).getTime() : createdAt.getTime();
  const deadline = created + APPEAL_WINDOW_MS;
  return Math.max(0, deadline - Date.now());
}

function toPersianDigits(s: string | number): string {
  const map = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
  return String(s).replace(/[0-9]/g, (d) => map[Number(d)]);
}

export function formatRemaining(ms: number): string {
  if (ms <= 0) return "مهلت اعتراض منقضی شده است";
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return `${toPersianDigits(hours)} ساعت و ${toPersianDigits(minutes)} دقیقه باقی‌مانده`;
  }
  return `${toPersianDigits(minutes)} دقیقه باقی‌مانده`;
}

export function penaltyTypeLabel(type: string): string {
  return PENALTY_TYPE_FA[type] ?? type;
}

export function severityLabel(sev: string): string {
  return PENALTY_SEVERITY_FA[sev] ?? sev;
}

export function appealStatusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  return APPEAL_STATUS_FA[status] ?? status;
}