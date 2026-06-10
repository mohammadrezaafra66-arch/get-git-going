/**
 * لایه read-only برای فیچر «سهمیه برچسب‌گذاری مالک محصول».
 * فقط Supabase client و جداول موجود. بدون write، بدون RPC، بدون migration.
 */

import { supabase } from "@/integrations/supabase/client";
import {
  OWNER_ASSIGNABLE_LABEL_VISIBILITY,
  OWNER_LABEL_ALLOW_SHARED_PRODUCTS,
  OWNER_LABEL_IN_CHUNK_SIZE,
  OWNER_LABEL_MIN_QUOTA,
  OWNER_LABEL_QUOTA_RATIO,
  OWNER_LABEL_QUOTA_ROUNDING,
} from "./owner-label-config";
import {
  buildOwnerLabelSummary,
  type OwnerLabelSummary,
} from "./owner-label-quota";

export interface OwnerAssignableLabel {
  id: string;
  title: string;
  color: string;
  is_active: boolean;
  visibility: string;
  weight: number | null;
}

export interface OwnerEligibleProducts {
  eligibleProductIds: string[];
  sharedProductIds: string[];
  excludedSharedCount: number;
}

export interface OwnerLabelOverview {
  labels: OwnerAssignableLabel[];
  eligibleProductIds: string[];
  sharedProductIds: string[];
  excludedSharedCount: number;
  taggedProductIds: string[];
  summary: OwnerLabelSummary;
}

function chunk<T>(arr: readonly T[], size: number): T[][] {
  if (size <= 0) return [Array.from(arr)];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * برچسب‌های قابل انتساب توسط owner:
 *  is_active = true AND visibility = OWNER_ASSIGNABLE_LABEL_VISIBILITY
 * مرتب‌سازی: weight desc، سپس title asc.
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
 * محصولات eligible این owner:
 *  1) product_owner_assignments.user_id = ownerUserId → product_idهای انتسابی
 *  2) فیلتر «محصول فعال»: products.is_active = true AND status = 'active'
 *  3) اگر OWNER_LABEL_ALLOW_SHARED_PRODUCTS=false: محصولاتی که در
 *     product_owner_assignments بیش از یک ردیف دارند، از eligible خارج
 *     و در sharedProductIds برگردانده می‌شوند.
 *
 * همه `.in(...)` ها chunk شده‌اند (≤ OWNER_LABEL_IN_CHUNK_SIZE).
 */
export async function fetchOwnerEligibleProductIds(
  ownerUserId: string,
): Promise<OwnerEligibleProducts> {
  if (!ownerUserId) {
    return { eligibleProductIds: [], sharedProductIds: [], excludedSharedCount: 0 };
  }

  // 1) product_idهای انتسابی به owner
  const { data: ownAssignments, error: ownErr } = await supabase
    .from("product_owner_assignments")
    .select("product_id")
    .eq("user_id", ownerUserId);
  if (ownErr) throw ownErr;

  const ownedIds = Array.from(
    new Set((ownAssignments ?? []).map((r) => r.product_id).filter(Boolean) as string[]),
  );
  if (ownedIds.length === 0) {
    return { eligibleProductIds: [], sharedProductIds: [], excludedSharedCount: 0 };
  }

  // 2) فیلتر «محصول فعال» — chunked
  const activeIds = new Set<string>();
  for (const ids of chunk(ownedIds, OWNER_LABEL_IN_CHUNK_SIZE)) {
    if (ids.length === 0) continue;
    const { data, error } = await supabase
      .from("products")
      .select("id")
      .in("id", ids)
      .eq("is_active", true)
      .eq("status", "active");
    if (error) throw error;
    for (const row of data ?? []) activeIds.add(row.id);
  }
  if (activeIds.size === 0) {
    return { eligibleProductIds: [], sharedProductIds: [], excludedSharedCount: 0 };
  }

  // 3) تشخیص محصولات مشترک (>1 owner) — chunked
  const ownerCount = new Map<string, number>();
  const activeIdList = Array.from(activeIds);
  for (const ids of chunk(activeIdList, OWNER_LABEL_IN_CHUNK_SIZE)) {
    if (ids.length === 0) continue;
    const { data, error } = await supabase
      .from("product_owner_assignments")
      .select("product_id, user_id")
      .in("product_id", ids);
    if (error) throw error;
    for (const row of data ?? []) {
      const pid = row.product_id as string;
      const uniqUsers = ownerCount.get(pid) ?? 0;
      // می‌توانیم چندین ردیف از همان user_id داشته باشیم؛
      // برای shared بودن نیاز است user_idهای متمایز شمرده شوند.
      ownerCount.set(pid, uniqUsers + 1);
    }
  }
  // باز-شمارش با distinct user_id برای دقت بیشتر
  const distinctOwners = new Map<string, Set<string>>();
  for (const ids of chunk(activeIdList, OWNER_LABEL_IN_CHUNK_SIZE)) {
    if (ids.length === 0) continue;
    const { data, error } = await supabase
      .from("product_owner_assignments")
      .select("product_id, user_id")
      .in("product_id", ids);
    if (error) throw error;
    for (const row of data ?? []) {
      const pid = row.product_id as string;
      const uid = row.user_id as string;
      if (!pid || !uid) continue;
      let set = distinctOwners.get(pid);
      if (!set) {
        set = new Set<string>();
        distinctOwners.set(pid, set);
      }
      set.add(uid);
    }
  }

  const eligibleProductIds: string[] = [];
  const sharedProductIds: string[] = [];
  for (const pid of activeIdList) {
    const owners = distinctOwners.get(pid);
    const ownersCount = owners ? owners.size : 0;
    const isShared = ownersCount > 1;
    if (isShared) {
      sharedProductIds.push(pid);
      if (!OWNER_LABEL_ALLOW_SHARED_PRODUCTS) continue;
    }
    eligibleProductIds.push(pid);
  }

  return {
    eligibleProductIds,
    sharedProductIds,
    excludedSharedCount: OWNER_LABEL_ALLOW_SHARED_PRODUCTS ? 0 : sharedProductIds.length,
  };
}

/**
 * شناسه محصولاتی از eligible که حداقل یک owner-assignable label دارند.
 * هر دو `in(product_id)` و `in(label_id)` chunk می‌شوند.
 */
export async function fetchOwnerTaggedProductIds(
  eligibleProductIds: readonly string[],
  ownerAssignableLabelIds: readonly string[],
): Promise<string[]> {
  if (eligibleProductIds.length === 0 || ownerAssignableLabelIds.length === 0) return [];

  const tagged = new Set<string>();
  const labelChunks = chunk(ownerAssignableLabelIds, OWNER_LABEL_IN_CHUNK_SIZE);

  for (const pids of chunk(eligibleProductIds, OWNER_LABEL_IN_CHUNK_SIZE)) {
    if (pids.length === 0) continue;
    for (const lids of labelChunks) {
      if (lids.length === 0) continue;
      const { data, error } = await supabase
        .from("product_label_links")
        .select("product_id, label_id")
        .in("product_id", pids)
        .in("label_id", lids);
      if (error) throw error;
      for (const row of data ?? []) {
        if (row.product_id) tagged.add(row.product_id as string);
      }
    }
  }
  return Array.from(tagged);
}

/**
 * Orchestrator نازک: سه call بالا + buildOwnerLabelSummary.
 * هیچ cache داخلی ندارد؛ caching را فاز UI با React Query
 * (staleTime = OWNER_LABEL_STALE_TIME_MS) مدیریت می‌کند.
 */
export async function getOwnerLabelOverview(
  ownerUserId: string,
): Promise<OwnerLabelOverview> {
  const [labels, eligible] = await Promise.all([
    fetchOwnerAssignableLabels(),
    fetchOwnerEligibleProductIds(ownerUserId),
  ]);

  const labelIds = labels.map((l) => l.id);
  const taggedProductIds = await fetchOwnerTaggedProductIds(
    eligible.eligibleProductIds,
    labelIds,
  );

  const summary = buildOwnerLabelSummary({
    eligibleCount: eligible.eligibleProductIds.length,
    taggedCount: taggedProductIds.length,
    ratio: OWNER_LABEL_QUOTA_RATIO,
    rounding: OWNER_LABEL_QUOTA_ROUNDING,
    minQuota: OWNER_LABEL_MIN_QUOTA,
  });

  return {
    labels,
    eligibleProductIds: eligible.eligibleProductIds,
    sharedProductIds: eligible.sharedProductIds,
    excludedSharedCount: eligible.excludedSharedCount,
    taggedProductIds,
    summary,
  };
}