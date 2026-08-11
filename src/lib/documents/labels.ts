export type DocumentType = "bijak" | "invoice" | "havale";
export type DocumentStatus = "pending_review" | "confirmed" | "rejected" | "expired";

export const DOCUMENT_TYPE_FA: Record<DocumentType, string> = {
  bijak: "بیجک",
  invoice: "فاکتور",
  havale: "حواله",
};

export const DOCUMENT_STATUS_FA: Record<DocumentStatus, string> = {
  pending_review: "در انتظار تأیید",
  confirmed: "تأیید شد",
  rejected: "رد شد",
  expired: "منقضی شد",
};

export const DOCUMENT_STATUS_BADGE: Record<DocumentStatus, string> = {
  pending_review:
    "border-amber-300 bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  confirmed:
    "border-green-300 bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
  rejected:
    "border-red-300 bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  expired:
    "border-gray-300 bg-gray-100 text-gray-600 dark:bg-gray-800/40 dark:text-gray-300",
};

export function documentTypeLabel(t: string): string {
  return DOCUMENT_TYPE_FA[t as DocumentType] ?? t;
}

export function documentStatusLabel(s: string): string {
  return DOCUMENT_STATUS_FA[s as DocumentStatus] ?? s;
}

export function documentStatusBadgeClass(s: string): string {
  return (
    DOCUMENT_STATUS_BADGE[s as DocumentStatus] ??
    "border-gray-300 bg-gray-100 text-gray-700"
  );
}

export function toPersianDigits(s: string | number): string {
  const map = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
  return String(s).replace(/[0-9]/g, (d) => map[Number(d)]);
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${toPersianDigits(bytes)} B`;
  if (bytes < 1024 * 1024) return `${toPersianDigits((bytes / 1024).toFixed(1))} KB`;
  return `${toPersianDigits((bytes / 1024 / 1024).toFixed(2))} MB`;
}