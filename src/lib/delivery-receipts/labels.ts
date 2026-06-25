import { formatFileSize, toPersianDigits } from "@/lib/documents/labels";

export type DeliveryReceiptType = "shipping_receipt" | "delivery_receipt";
export type DeliveryReceiptStatus =
  | "pending_review"
  | "confirmed"
  | "rejected"
  | "expired";

export const DELIVERY_RECEIPT_TYPE_FA: Record<DeliveryReceiptType, string> = {
  shipping_receipt: "بیجک باربری / رسید ارسال",
  delivery_receipt: "رسید تحویل به مشتری",
};

export const DELIVERY_RECEIPT_STATUS_FA: Record<DeliveryReceiptStatus, string> = {
  pending_review: "در انتظار تأیید",
  confirmed: "تأیید شد",
  rejected: "رد شد",
  expired: "منقضی شد",
};

export const DELIVERY_RECEIPT_STATUS_BADGE: Record<DeliveryReceiptStatus, string> = {
  pending_review:
    "border-amber-300 bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  confirmed:
    "border-green-300 bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
  rejected:
    "border-red-300 bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  expired:
    "border-gray-300 bg-gray-100 text-gray-600 dark:bg-gray-800/40 dark:text-gray-300",
};

export function deliveryReceiptTypeLabel(t: string): string {
  return DELIVERY_RECEIPT_TYPE_FA[t as DeliveryReceiptType] ?? t;
}

export function deliveryReceiptStatusLabel(s: string): string {
  return DELIVERY_RECEIPT_STATUS_FA[s as DeliveryReceiptStatus] ?? s;
}

export function deliveryReceiptStatusBadgeClass(s: string): string {
  return (
    DELIVERY_RECEIPT_STATUS_BADGE[s as DeliveryReceiptStatus] ??
    "border-gray-300 bg-gray-100 text-gray-700"
  );
}

export { formatFileSize, toPersianDigits };