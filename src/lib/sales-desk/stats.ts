/**
 * Sales-desk · month-to-date stats for the signed-in staff user (migration 546).
 */
import { supabase } from "@/integrations/supabase/client";

export type SalesMyMonthStats = {
  month_start: string;
  calls_count: number;
  won_count: number;
  lost_count: number;
  calls_source: "staff_daily_performance_metrics" | "call_logs" | string;
};

type UntypedRpc = (
  fn: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

export async function fetchMyMonthStats(): Promise<SalesMyMonthStats> {
  const rpc = supabase.rpc.bind(supabase) as unknown as UntypedRpc;
  const { data, error } = await rpc("sales_my_month_stats");
  if (error) throw new Error(error.message);
  if (!data || typeof data !== "object") {
    throw new Error("sales_my_month_stats پاسخ خالی برگرداند.");
  }
  const row = data as Record<string, unknown>;
  return {
    month_start: String(row.month_start ?? ""),
    calls_count: Number(row.calls_count ?? 0),
    won_count: Number(row.won_count ?? 0),
    lost_count: Number(row.lost_count ?? 0),
    calls_source: String(row.calls_source ?? "call_logs"),
  };
}
