/**
 * Mutationها و guardهای client-side برای برچسب‌گذاری owner-scoped.
 * فقط internal/assignable labels را لمس می‌کند. هرگز public labels را insert/delete نمی‌کند.
 * تضمین واقعی دسترسی باید در RLS باشد؛ این فایل صرفاً guard سمت UI است.
 */

import { supabase } from "@/integrations/supabase/client";
import { OWNER_LABEL_IN_CHUNK_SIZE } from "./owner-label-config";

/**
 * این تابع فقط guard سمت UI است؛ تضمین واقعی دسترسی باید در RLS باشد.
 * فعلاً فقط نقش‌هایی که در عمل در سیستم اجازه write روی product_label_links دارند
 * را مجاز می‌داند.
 */
export function canPersistOwnerLabels(roles: readonly string[] | null | undefined): boolean {
  if (!roles || roles.length === 0) return false;
  return roles.some((r) => r === "admin" || r === "manager" || r === "accountant");
}

function chunk<T>(arr: readonly T[], size: number): T[][] {
  if (size <= 0) return [Array.from(arr)];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * فقط لینک‌هایی از product_label_links که product_id مطابق است
 * و label_id درون subset assignable قرار دارد. هیچ public label خوانده نمی‌شود.
 */
export async function fetchProductOwnerLabelLinks(
  productId: string,
  assignableLabelIds: readonly string[],
): Promise<string[]> {
  if (!productId) return [];
  if (assignableLabelIds.length === 0) return [];

  const found = new Set<string>();
  for (const ids of chunk(assignableLabelIds, OWNER_LABEL_IN_CHUNK_SIZE)) {
    if (ids.length === 0) continue;
    const { data, error } = await supabase
      .from("product_label_links")
      .select("label_id")
      .eq("product_id", productId)
      .in("label_id", ids);
    if (error) throw error;
    for (const row of data ?? []) {
      if (row.label_id) found.add(row.label_id as string);
    }
  }
  return Array.from(found);
}

/**
 * Guard سمت UI: اگر محصول قبلاً tagged نبوده و حالا قرار است tagged شود،
 * نباید از سهمیه عبور کند. این تنها تضمین لحظه‌ای است؛ race-condition با
 * تب/کاربر دیگر ممکن است و تضمین قطعی فقط سمت DB ممکن است.
 */
export function assertQuotaAllowsAdd(params: {
  taggedCount: number;
  quota: number;
  becomingNewlyTagged: boolean;
}): void {
  const { taggedCount, quota, becomingNewlyTagged } = params;
  if (!becomingNewlyTagged) return;
  if (quota <= 0 || taggedCount >= quota) {
    throw new Error(
      "سهمیه شما پر است. برای افزودن محصول جدید، ابتدا برچسب یکی از محصولات قبلی را حذف کنید.",
    );
  }
}

/**
 * diff و write فقط روی subset assignable. هیچ label خارج از این subset
 * (به‌ویژه public) لمس نمی‌شود.
 */
export async function saveOwnerLabelLinks(params: {
  productId: string;
  assignableLabelIds: readonly string[];
  prevSelected: readonly string[];
  nextSelected: readonly string[];
}): Promise<{ added: string[]; removed: string[] }> {
  const { productId, assignableLabelIds, prevSelected, nextSelected } = params;
  if (!productId) throw new Error("محصولی برای ذخیره مشخص نشده است.");

  const allow = new Set(assignableLabelIds);
  const prev = new Set(prevSelected.filter((id) => allow.has(id)));
  const next = new Set(nextSelected.filter((id) => allow.has(id)));

  const toAdd: string[] = [];
  for (const id of next) if (!prev.has(id)) toAdd.push(id);

  const toRemove: string[] = [];
  for (const id of prev) if (!next.has(id)) toRemove.push(id);

  if (toAdd.length > 0) {
    const rows = toAdd.map((label_id) => ({ product_id: productId, label_id }));
    const { error } = await supabase.from("product_label_links").insert(rows);
    if (error) throw new Error(error.message || "ذخیره برچسب‌ها ناموفق بود.");
  }

  if (toRemove.length > 0) {
    // delete فقط روی subset assignable. هیچ delete کلی روی محصول انجام نمی‌شود.
    for (const ids of chunk(toRemove, OWNER_LABEL_IN_CHUNK_SIZE)) {
      if (ids.length === 0) continue;
      const { error } = await supabase
        .from("product_label_links")
        .delete()
        .eq("product_id", productId)
        .in("label_id", ids);
      if (error) throw new Error(error.message || "ذخیره برچسب‌ها ناموفق بود.");
    }
  }

  return { added: toAdd, removed: toRemove };
}