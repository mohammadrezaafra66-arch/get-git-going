import { supabase } from "@/integrations/supabase/client";

type UntypedRpc = (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

export async function loadDealLookupNames(ids: string[]): Promise<Record<string, string>> {
  const names: Record<string, string> = {};
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return names;
  const rpc = supabase.rpc.bind(supabase) as unknown as UntypedRpc;
  const { data, error } = await rpc("sales_deal_lookup_names", { p_ids: uniq });
  if (error) throw new Error(error.message);
  for (const row of (data ?? []) as Array<{ id: string; name: string | null }>) {
    names[row.id] = row.name || "—";
  }
  return names;
}

export async function loadDealStaffNames(): Promise<Array<{ id: string; full_name: string | null }>> {
  const rpc = supabase.rpc.bind(supabase) as unknown as UntypedRpc;
  const { data, error } = await rpc("sales_desk_staff_names", {});
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ id: string; full_name: string | null }>).map((r) => ({
    id: r.id,
    full_name: r.full_name,
  }));
}
