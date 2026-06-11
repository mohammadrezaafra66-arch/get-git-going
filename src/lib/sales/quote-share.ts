// Infrastructure for preparing quote sharing through messaging channels.
// Real messenger integrations are intentionally NOT implemented yet — we only
// persist a draft log of the intended share for later use.

export type QuoteShareChannel =
  | "whatsapp"
  | "telegram"
  | "sms"
  | "eitaa"
  | "bale"
  | "rubika"
  | "manual_link";

export type QuoteShareStatus =
  | "draft"
  | "queued"
  | "sent"
  | "failed"
  | "canceled";

export const QUOTE_SHARE_CHANNEL_LABELS: Record<QuoteShareChannel, string> = {
  whatsapp: "واتساپ",
  telegram: "تلگرام",
  sms: "پیامک",
  eitaa: "ایتا",
  bale: "بله",
  rubika: "روبیکا",
  manual_link: "لینک دستی",
};

export const QUOTE_SHARE_STATUS_LABELS: Record<QuoteShareStatus, string> = {
  draft: "پیش‌نویس",
  queued: "در صف",
  sent: "ارسال‌شده",
  failed: "ناموفق",
  canceled: "لغو شده",
};

export const QUOTE_SHARE_CHANNELS: QuoteShareChannel[] = [
  "whatsapp",
  "telegram",
  "sms",
  "eitaa",
  "bale",
  "rubika",
  "manual_link",
];

export const QUOTE_SHARE_STATUSES: QuoteShareStatus[] = [
  "draft",
  "queued",
  "sent",
  "failed",
  "canceled",
];

export const QUOTE_SHARE_LOGS_PAGE_SIZE = 20;

export function defaultShareMessage(quoteNumber: string): string {
  return `سلام، پیش‌فاکتور شما آماده شد. شماره پیش‌فاکتور: ${quoteNumber}`;
}