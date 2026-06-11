import type { QuoteShareChannel } from "@/lib/sales/quote-share";

export type QuoteSendQueueStatus = "pending" | "processing" | "sent" | "failed" | "canceled";

export const QUOTE_SEND_QUEUE_STATUS_LABELS: Record<QuoteSendQueueStatus, string> = {
  pending: "در انتظار",
  processing: "در حال پردازش",
  sent: "ارسال‌شده",
  failed: "ناموفق",
  canceled: "لغو شده",
};

export const QUOTE_SEND_QUEUE_STATUSES: QuoteSendQueueStatus[] = [
  "pending",
  "processing",
  "sent",
  "failed",
  "canceled",
];

export const QUOTE_SEND_QUEUE_PAGE_SIZE = 20;

export const SIMULATED_ERROR_MESSAGE = "خطای شبیه‌سازی‌شده ارسال (تست داخلی)";

export type { QuoteShareChannel };
