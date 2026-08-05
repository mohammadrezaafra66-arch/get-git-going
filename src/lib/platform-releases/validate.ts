import {
  GIT_SHA_RE,
  MAX_DETAILS,
  MAX_ITEM_DESC,
  MAX_ITEM_TITLE,
  MAX_ITEMS,
  MAX_SUMMARY,
  MAX_TITLE,
  RELEASE_CATEGORIES,
  ROUTE_PATH_RE,
  type ReleaseCategory,
} from "./constants";
import type { PlatformReleaseDraftInput, PlatformReleaseItem } from "./types";

export function isReleaseCategory(v: string): v is ReleaseCategory {
  return (RELEASE_CATEGORIES as readonly string[]).includes(v);
}

export function validateReleaseItems(items: PlatformReleaseItem[]): string | null {
  if (!Array.isArray(items) || items.length < 1) {
    return "حداقل یک مورد تغییر لازم است";
  }
  if (items.length > MAX_ITEMS) {
    return `حداکثر ${MAX_ITEMS} مورد تغییر مجاز است`;
  }
  const orders = new Set<number>();
  for (const item of items) {
    if (!item.title_fa?.trim()) return "عنوان هر مورد تغییر الزامی است";
    if (!item.description_fa?.trim()) return "توضیح هر مورد تغییر الزامی است";
    if (item.title_fa.trim().length > MAX_ITEM_TITLE) return "عنوان مورد تغییر خیلی طولانی است";
    if (item.description_fa.trim().length > MAX_ITEM_DESC)
      return "توضیح مورد تغییر خیلی طولانی است";
    if (!Number.isInteger(item.item_number) || item.item_number < 1) {
      return "شمارهٔ مورد تغییر نامعتبر است";
    }
    if (orders.has(item.item_number)) return "شمارهٔ موارد تغییر تکراری است";
    orders.add(item.item_number);
    if (item.route_path && !ROUTE_PATH_RE.test(item.route_path)) {
      return "مسیر مرتبط باید مسیر داخلی امن باشد (مثلاً /products)";
    }
  }
  return null;
}

export function validateDraftInput(input: PlatformReleaseDraftInput): string | null {
  const title = input.title_fa?.trim() ?? "";
  const summary = input.summary_fa?.trim() ?? "";
  if (!title) return "عنوان الزامی است";
  if (title.length > MAX_TITLE) return "عنوان خیلی طولانی است";
  if (!summary) return "خلاصه الزامی است";
  if (summary.length > MAX_SUMMARY) return "خلاصه خیلی طولانی است";
  if (!isReleaseCategory(input.category)) return "دسته‌بندی نامعتبر است";
  if (input.details_fa && input.details_fa.length > MAX_DETAILS) {
    return "توضیحات خیلی طولانی است";
  }
  if (input.git_sha && !GIT_SHA_RE.test(input.git_sha.trim())) {
    return "شناسهٔ Git نامعتبر است";
  }
  if (input.version && input.version.trim().length > 64) {
    return "نسخه خیلی طولانی است";
  }
  return validateReleaseItems(input.items);
}

export function normalizeItems(items: PlatformReleaseItem[]): PlatformReleaseItem[] {
  return items
    .map((item, index) => ({
      item_number: index + 1,
      title_fa: item.title_fa.trim(),
      description_fa: item.description_fa.trim(),
      module_key: item.module_key?.trim() || null,
      route_path: item.route_path?.trim() || null,
      change_type: item.change_type?.trim() || null,
    }))
    .filter((item) => item.title_fa || item.description_fa);
}
