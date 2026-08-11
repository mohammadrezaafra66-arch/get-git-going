/** Approved release categories — must match DB CHECK. */
export const RELEASE_CATEGORIES = [
  "قابلیت جدید",
  "بهبود",
  "رفع اشکال",
  "امنیت",
  "حسابداری",
  "فروش",
  "انبار",
  "اشخاص",
  "یکپارچه‌سازی",
  "زیرساخت",
] as const;

export type ReleaseCategory = (typeof RELEASE_CATEGORIES)[number];

export const RELEASE_STATUSES = ["draft", "published", "archived"] as const;
export type ReleaseStatus = (typeof RELEASE_STATUSES)[number];

export const RELEASE_STATUS_LABELS: Record<ReleaseStatus, string> = {
  draft: "پیش‌نویس",
  published: "منتشرشده",
  archived: "بایگانی",
};

export const PAGE_SIZE = 10;

export const MAX_TITLE = 200;
export const MAX_SUMMARY = 1000;
export const MAX_DETAILS = 8000;
export const MAX_ITEMS = 40;
export const MAX_ITEM_TITLE = 160;
export const MAX_ITEM_DESC = 500;

export const GIT_SHA_RE = /^[0-9a-fA-F]{7,40}$/;
/** Optional in-app paths only (no protocol / external). */
export const ROUTE_PATH_RE = /^\/[A-Za-z0-9/_-]*$/;
