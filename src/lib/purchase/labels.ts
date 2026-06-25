export type PurchaseStatus =
  | "pending"
  | "approved"
  | "purchased"
  | "delivered"
  | "cancelled";

export const PURCHASE_STATUS_FA: Record<PurchaseStatus, string> = {
  pending: "در انتظار تأیید",
  approved: "تأیید شده",
  purchased: "خرید انجام شد",
  delivered: "تحویل داده شد",
  cancelled: "لغو شد",
};

export const PURCHASE_STATUS_BADGE: Record<PurchaseStatus, string> = {
  pending:
    "border-amber-300 bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  approved:
    "border-blue-300 bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  purchased:
    "border-violet-300 bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200",
  delivered:
    "border-green-300 bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
  cancelled:
    "border-gray-300 bg-gray-100 text-gray-700 dark:bg-gray-800/40 dark:text-gray-300",
};

export const PURCHASE_UNIT_OPTIONS = ["عدد", "کیلوگرم", "متر", "بسته"] as const;

export function purchaseStatusLabel(s: string): string {
  return PURCHASE_STATUS_FA[s as PurchaseStatus] ?? s;
}

export function purchaseStatusBadgeClass(s: string): string {
  return (
    PURCHASE_STATUS_BADGE[s as PurchaseStatus] ??
    "border-gray-300 bg-gray-100 text-gray-700"
  );
}

/** گذارهای مجاز از یک وضعیت به وضعیت‌های بعدی */
export function nextStatuses(s: string): PurchaseStatus[] {
  switch (s as PurchaseStatus) {
    case "pending":
      return ["approved", "cancelled"];
    case "approved":
      return ["purchased", "cancelled"];
    case "purchased":
      return ["delivered"];
    default:
      return [];
  }
}

export function toPersianDigits(s: string | number): string {
  const map = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
  return String(s).replace(/[0-9]/g, (d) => map[Number(d)]);
}