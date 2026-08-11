import { supabase } from "@/integrations/supabase/client";

export type NominationReasonCode =
  | "customer_request"
  | "high_stock"
  | "good_margin"
  | "competitive_price"
  | "new_product"
  | "clearance"
  | "other";

export const NOMINATION_REASON_FA: Record<NominationReasonCode, string> = {
  customer_request: "درخواست مشتری",
  high_stock: "موجودی زیاد",
  good_margin: "حاشیه سود خوب",
  competitive_price: "قیمت رقابتی",
  new_product: "محصول جدید",
  clearance: "تخلیه انبار",
  other: "سایر",
};

export interface NominationQuota {
  used_today: number;
  daily_quota: number;
  remaining_today: number;
}

export interface PromotionNominationRow {
  id: string;
  product_id: string;
  nominated_by: string;
  channel_id: string | null;
  reason_code: NominationReasonCode;
  reason_note: string | null;
  nominated_on: string;
  cancelled_at: string | null;
  cancelled_by: string | null;
  boost_applied: number;
  created_at: string;
  product?: { id: string; name: string; sku: string | null } | null;
  channel?: { id: string; name: string } | null;
  nominator?: { id: string; full_name: string | null } | null;
}

const NOMINATION_COLS =
  "id,product_id,nominated_by,channel_id,reason_code,reason_note,nominated_on,cancelled_at,cancelled_by,boost_applied,created_at,product:products(id,name,sku),channel:marketing_channels(id,name)";

export async function getPromotionNominationQuota(): Promise<NominationQuota | null> {
  const { data, error } = await (supabase as any).rpc("get_promotion_nomination_quota");
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return (row ?? null) as NominationQuota | null;
}

export async function listPromotionNominations(opts: {
  onlyMine?: boolean;
  userId?: string | null;
  includeCancelled?: boolean;
  limit?: number;
}): Promise<PromotionNominationRow[]> {
  let q = (supabase as any)
    .from("promotion_nominations")
    .select(NOMINATION_COLS)
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 100);

  if (opts.onlyMine && opts.userId) {
    q = q.eq("nominated_by", opts.userId);
  }
  if (!opts.includeCancelled) {
    q = q.is("cancelled_at", null);
  }

  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []) as PromotionNominationRow[];

  const nominatorIds = Array.from(new Set(rows.map((r) => r.nominated_by).filter(Boolean)));
  if (nominatorIds.length === 0) return rows;

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id,full_name")
    .in("id", nominatorIds)
    .limit(200);
  const byId = new Map((profiles ?? []).map((p) => [p.id, p] as const));
  return rows.map((r) => ({
    ...r,
    nominator: byId.get(r.nominated_by) ?? null,
  }));
}

export async function cancelPromotionNomination(
  nominationId: string,
): Promise<{ ok: boolean; remaining_today: number }> {
  const { data, error } = await (supabase as any).rpc("cancel_promotion_nomination", {
    p_nomination_id: nominationId,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return {
    ok: Boolean(row?.ok ?? true),
    remaining_today: Number(row?.remaining_today ?? 0),
  };
}

export async function nominateProductForPromotion(input: {
  productId: string;
  channelId?: string | null;
  reasonCode: NominationReasonCode;
  reasonNote?: string | null;
}): Promise<{
  nomination_id: string;
  boost_applied: number;
  remaining_today: number;
  capped: boolean;
}> {
  const { data, error } = await (supabase as any).rpc("nominate_product_for_promotion", {
    p_product_id: input.productId,
    p_channel_id: input.channelId ?? null,
    p_reason_code: input.reasonCode,
    p_reason_note: input.reasonNote ?? null,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row as {
    nomination_id: string;
    boost_applied: number;
    remaining_today: number;
    capped: boolean;
  };
}
