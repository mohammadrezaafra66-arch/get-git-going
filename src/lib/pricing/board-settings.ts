import { supabase } from "@/integrations/supabase/client";

export const AMIN_HOZOOR_BOARD_KEY = "amin_hozoor_sales_board";

export interface BoardSetting {
  id: string;
  board_key: string;
  sale_price_type_id: string;
  title: string;
  is_active: boolean;
  updated_by: string | null;
  updated_at: string;
  created_at: string;
}

export async function fetchBoardSetting(boardKey: string): Promise<BoardSetting | null> {
  const { data, error } = await supabase
    .from("pricing_board_settings")
    .select("*")
    .eq("board_key", boardKey)
    .maybeSingle();
  if (error) throw error;
  return (data as BoardSetting | null) ?? null;
}

export async function updateBoardSalePriceType(opts: {
  boardKey: string;
  newSalePriceTypeId: string;
  actorId: string;
}): Promise<BoardSetting> {
  const { boardKey, newSalePriceTypeId, actorId } = opts;

  // اعتبارسنجی نوع قیمت فروش (باید موجود و فعال باشد)
  const { data: spt, error: sptErr } = await supabase
    .from("sale_price_types")
    .select("id, is_active")
    .eq("id", newSalePriceTypeId)
    .maybeSingle();
  if (sptErr) throw sptErr;
  if (!spt) throw new Error("نوع قیمت فروش انتخابی یافت نشد.");
  if (!spt.is_active) throw new Error("نوع قیمت فروش انتخابی فعال نیست.");

  // مقدار فعلی برای audit
  const prev = await fetchBoardSetting(boardKey);

  let updated: BoardSetting | null = null;
  if (prev) {
    const { data, error } = await supabase
      .from("pricing_board_settings")
      .update({
        sale_price_type_id: newSalePriceTypeId,
        updated_by: actorId,
      })
      .eq("id", prev.id)
      .select("*")
      .single();
    if (error) throw error;
    updated = data as BoardSetting;
  } else {
    const { data, error } = await supabase
      .from("pricing_board_settings")
      .insert({
        board_key: boardKey,
        sale_price_type_id: newSalePriceTypeId,
        title: "تابلوی قیمت فروش امین حضور",
        is_active: true,
        updated_by: actorId,
      })
      .select("*")
      .single();
    if (error) throw error;
    updated = data as BoardSetting;
  }

  // audit log
  await supabase.from("audit_logs").insert({
    action: "pricing_board_sale_price_type_changed",
    entity_type: "pricing_board_settings",
    entity_id: updated.id,
    actor_id: actorId,
    diff: {
      board_key: boardKey,
      previous_sale_price_type_id: prev?.sale_price_type_id ?? null,
      new_sale_price_type_id: newSalePriceTypeId,
      source: "amin_hozoor_board",
    } as never,
  });

  return updated;
}