/**
 * deal_lost_reasons catalog helpers (migration 567).
 * types.ts not regenerated — untyped casts.
 */
import { supabase } from "@/integrations/supabase/client";

export type DealLostReason = {
  id: string;
  title: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
};

export async function listDealLostReasons(opts?: {
  activeOnly?: boolean;
}): Promise<DealLostReason[]> {
  let q = supabase
    .from("deal_lost_reasons" as never)
    .select("id, title, is_active, sort_order, created_at" as never)
    .order("sort_order" as never, { ascending: true } as never)
    .order("title" as never, { ascending: true } as never);
  if (opts?.activeOnly) {
    q = q.eq("is_active" as never, true as never);
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as DealLostReason[];
}

export async function createDealLostReason(title: string): Promise<string> {
  const trimmed = title.trim();
  if (!trimmed) throw new Error("عنوان الزامی است");
  const { data, error } = await supabase
    .from("deal_lost_reasons" as never)
    .insert({ title: trimmed, is_active: true, sort_order: 100 } as never)
    .select("id" as never)
    .single();
  if (error) throw new Error(error.message);
  const row = data as unknown as { id: string } | null;
  if (!row?.id) throw new Error("شناسه دلیل برنگشت");
  return row.id;
}

export async function setDealLostReasonActive(
  id: string,
  isActive: boolean,
): Promise<void> {
  const { error } = await supabase
    .from("deal_lost_reasons" as never)
    .update({ is_active: isActive } as never)
    .eq("id" as never, id as never);
  if (error) throw new Error(error.message);
}

/** Seeded title «سایر» — compare verbatim for other-text requirement. */
export const LOST_REASON_OTHER_TITLE = "سایر";
