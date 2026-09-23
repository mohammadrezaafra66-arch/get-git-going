import { supabase } from "@/integrations/supabase/client";
import { salesDeskErrorMessage } from "./errors";

export type DealCapabilities = {
  id: string;
  can_edit: boolean;
  can_set_won: boolean;
  can_set_lost: boolean;
  can_reopen: boolean;
  can_move: boolean;
  can_delete: boolean;
  can_restore: boolean;
  open_activity_count: number;
  latest_quote_id: string | null;
  latest_quote_status: string | null;
  show_rejected_quote_notice: boolean;
};

type UntypedRpc = (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

export async function loadDealCapabilities(
  ids: string[],
): Promise<Map<string, DealCapabilities>> {
  const map = new Map<string, DealCapabilities>();
  if (ids.length === 0) return map;
  const rpc = supabase.rpc.bind(supabase) as unknown as UntypedRpc;
  const { data, error } = await rpc("sales_deal_capabilities", { p_ids: ids });
  if (error) throw new Error(salesDeskErrorMessage(error.message));
  for (const row of (data ?? []) as DealCapabilities[]) {
    map.set(row.id, row);
  }
  return map;
}
