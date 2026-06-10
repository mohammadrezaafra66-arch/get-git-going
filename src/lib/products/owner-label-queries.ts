/**
 * کوئری‌های فقط‌خواندنی برای feature «سهمیه برچسب‌گذاری مالک محصول».
 * - بدون write، بدون RPC جدید، بدون endpoint.
 * - فقط از جدول‌های موجود استفاده می‌کند: product_labels, product_label_links,
 *   product_owner_assignments, products.
 */

import { supabase } from "@/integrations/supabase/client";
import {
  OWNER_ASSIGNABLE_LABEL_VISIBILITY,
  OWNER_LABEL_ALLOW_SHARED_PRODUCTS,
  OWNER_LABEL_QUOTA_RATIO,
  OWNER_LABEL_QUOTA_ROUNDING,
  OWNER_LABEL_MIN_QUOTA,
} from "./owner-label-config";
import { buildOwnerLabelSummary, type OwnerLabelSummary } from "./owner-label-quota";

export interface OwnerAssignableLabel {
  id: string;
  title: string;
  color: string;
  is_active: boolean;
  visibility: string;
  weight: number | null;
}

/** سقف امن برای هر `in(...)` تا از 414 URI Too Long جلوگیری شود. */
const IN_CHUNK_SIZE = 500;

function chunk<T>(arr: readonly T[], size: number): T[][] {
  if (size <= 0) return [arr.slice()];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * برچسب‌های قابل اختصاص توسط مالک محصول.
 * فعال + visibility='internal'، مرتب‌شده بر اساس weight نزولی، سپس title صعودی.
 */
export async function fetchOwnerAssignableLabels(): Promise<OwnerAssignableLabel[]> {
  const { data, error } = await supabase
    .from("product_labels")
    .select("id, title, color, is_active, visibility, weight")
    .eq("is_active", true)
    .eq("visibility", OWNER_ASSIGNABLE_LABEL_VISIBILITY)
    .order("weight", { ascending: false })
    .order("title", { ascending: true });

  if (error) throw error;
  return (data ?? []) as OwnerAssignableLabel[];
}

/**
 * محصولات واجد شرایط یک مالک:
 * - distinct product_idهای منسوب از product_owner_assignments
 * - حذف محصولات shared اگر OWNER_LABEL_ALLOW_SHARED_PRODUCTS=false
 * - cross-check با products.is_active=true و status='active'
 */
export async function fetchOwnerProductCounts(
  ownerUserId: string,
): Promise<{ eligibleProductIds: string[] }> {
  if (!ownerUserId) return { eligibleProductIds: [] };

  // 1) همه product_idهای منسوب به این مالک.
  const { data: ownerRows, error: ownerErr } = await supabase
    .from("product_owner_assignments")
    .select("product_id")
    .eq("user_id", ownerUserId);
  if (ownerErr) throw ownerErr;

  const ownProductIds = Array.from(
    new Set(((ownerRows ?? []) as Array<{ product_id: string }>).map((r) => r.product_id)),
  );
  if (ownProductIds.length === 0) return { eligibleProductIds: [] };

  // 2) در صورت لزوم، حذف محصولاتی که بیش از یک owner دارند (shared).
  let candidateIds = ownProductIds;
  if (!OWNER_LABEL_ALLOW_SHARED_PRODUCTS) {
    const ownerCount = new Map<string, number>();
    for (const ids of chunk(ownProductIds, IN_CHUNK_SIZE)) {
      const { data, error } = await supabase
        .from("product_owner_assignments")
        .select("product_id, user_id")
        .in("product_id", ids);
      if (error) throw error;
      for (const row of (data ?? []) as Array<{ product_id: string; user_id: string }>) {
        ownerCount.set(row.product_id, (ownerCount.get(row.product_id) ?? 0) + 1);
      }
    }
    candidateIds = ownProductIds.filter((pid) => (ownerCount.get(pid) ?? 0) <= 1);
    if (candidateIds.length === 0) return { eligibleProductIds: [] };
  }

  // 3) فقط محصولات فعال و با status='active'.
  const eligible = new Set<string>();
  for (const ids of chunk(candidateIds, IN_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from("products")
      .select("id")
      .in("id", ids)
      .eq("is_active", true)
      .eq("status", "active");
    if (error) throw error;
    for (const row of (data ?? []) as Array<{ id: string }>) eligible.add(row.id);
  }

  return { eligibleProductIds: Array.from(eligible) };
}

/**
 * مجموعه product_idهایی که حداقل یک owner-assignable label دارند،
 * محدود به productهای داده‌شده و labelهای داده‌شده.
 */
export async function fetchOwnerTaggedProductIds(
  eligibleProductIds: readonly string[],
  ownerAssignableLabelIds: readonly string[],
): Promise<Set<string>> {
  const tagged = new Set<string>();
  if (eligibleProductIds.length === 0 || ownerAssignableLabelIds.length === 0) {
    return tagged;
  }

  // chunk روی product_ids؛ label_ids معمولاً کوچک است ولی برای ایمنی chunk می‌شود.
  for (const productIds of chunk(eligibleProductIds, IN_CHUNK_SIZE)) {
    for (const labelIds of chunk(ownerAssignableLabelIds, IN_CHUNK_SIZE)) {
      const { data, error } = await supabase
        .from("product_label_links")
        .select("product_id, label_id")
        .in("product_id", productIds)
        .in("label_id", labelIds);
      if (error) throw error;
      for (const row of (data ?? []) as Array<{ product_id: string; label_id: string }>) {
        tagged.add(row.product_id);
      }
    }
  }

  return tagged;
}

export interface OwnerLabelOverview {
  labels: OwnerAssignableLabel[];
  eligibleProductIds: string[];
  taggedProductIds: string[];
  summary: OwnerLabelSummary;
}

/**
 * Orchestrator نازک: سه کوئری بالا را اجرا و خلاصه نهایی را می‌سازد.
 * Caching در لایه UI (React Query) با OWNER_LABEL_STALE_TIME_MS انجام می‌شود.
 */
export async function getOwnerLabelOverview(ownerUserId: string): Promise<OwnerLabelOverview> {
  const [labels, counts] = await Promise.all([
    fetchOwnerAssignableLabels(),
    fetchOwnerProductCounts(ownerUserId),
  ]);

  const labelIds = labels.map((l) => l.id);
  const taggedSet = await fetchOwnerTaggedProductIds(counts.eligibleProductIds, labelIds);

  const summary = buildOwnerLabelSummary({
    eligibleCount: counts.eligibleProductIds.length,
    taggedCount: taggedSet.size,
    ratio: OWNER_LABEL_QUOTA_RATIO,
    rounding: OWNER_LABEL_QUOTA_ROUNDING,
    minQuota: OWNER_LABEL_MIN_QUOTA,
  });

  return {
    labels,
    eligibleProductIds: counts.eligibleProductIds,
    taggedProductIds: Array.from(taggedSet),
    summary,
  };
}