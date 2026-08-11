import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface DailyCapitalSetting {
  id: string;
  capital_date: string;
  total_capital: number;
  scoring_mode: string;
  notes: string | null;
  created_at: string;
}

export interface RunAllocationResult {
  setting_id: string;
  capital_date: string;
  total_capital: number;
  salespersons_count: number;
  customers_count: number;
  total_allocated_to_customers: number;
}

export interface SalespersonAllocationRow {
  id: string;
  capital_setting_id: string;
  salesperson_id: string;
  weighted_score: number;
  share_ratio: number;
  allocated_capital: number;
  full_name: string | null;
}

export interface CustomerAllocationRow {
  id: string;
  capital_setting_id: string;
  customer_id: string;
  salesperson_id: string | null;
  weighted_score: number;
  share_ratio: number;
  raw_allocation: number;
  final_limit: number;
  binding_constraint: string;
  customer_name: string | null;
  /** Item 141.3 — folded from capital_allocation_ledger. */
  held_amount: number;
  consumed_amount: number;
  remaining_amount: number;
}

/** Item 141.3 — salesperson-level capital usage for one snapshot. */
export interface SalespersonCapitalUsage {
  allocation_id: string;
  salesperson_id: string;
  allocated_capital: number;
  held_amount: number;
  consumed_amount: number;
  remaining_amount: number;
}

/** بررسی وجود snapshot برای تاریخ مشخص. */
export function useSettingByDate(capitalDate: string | undefined) {
  return useQuery({
    queryKey: ["dyn-capital-setting-by-date", capitalDate],
    enabled: Boolean(capitalDate),
    queryFn: async (): Promise<DailyCapitalSetting | null> => {
      const { data, error } = await supabase
        .from("daily_capital_settings")
        .select("id, capital_date, total_capital, scoring_mode, notes, created_at")
        .eq("capital_date", capitalDate!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as DailyCapitalSetting | null;
    },
  });
}

/** ۳۰ snapshot آخر — برای تاریخچه. */
export function useAllocationHistory(limit = 30) {
  return useQuery({
    queryKey: ["dyn-capital-history", limit],
    queryFn: async (): Promise<DailyCapitalSetting[]> => {
      const { data, error } = await supabase
        .from("daily_capital_settings")
        .select("id, capital_date, total_capital, scoring_mode, notes, created_at")
        .order("capital_date", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as DailyCapitalSetting[];
    },
  });
}

/** اجرای RPC ساخت snapshot روزانه. */
export function useRunDailyAllocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      p_capital_date: string;
      p_total_capital: number;
      p_notes?: string | null;
    }): Promise<RunAllocationResult> => {
      const { data, error } = await supabase.rpc("run_daily_capital_allocation", {
        p_capital_date: input.p_capital_date,
        p_total_capital: input.p_total_capital,
        p_notes: input.p_notes ?? undefined,
      });
      if (error) throw error;
      return data as unknown as RunAllocationResult;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["dyn-capital-history"] });
      qc.invalidateQueries({ queryKey: ["dyn-capital-setting-by-date", vars.p_capital_date] });
    },
  });
}

/** تخصیص هر کارشناس برای یک snapshot. */
export function useSalespersonAllocations(settingId: string | undefined) {
  return useQuery({
    queryKey: ["dyn-salesperson-allocations", settingId],
    enabled: Boolean(settingId),
    queryFn: async (): Promise<SalespersonAllocationRow[]> => {
      const { data, error } = await supabase
        .from("salesperson_capital_allocations_dynamic")
        .select(
          "id, capital_setting_id, salesperson_id, weighted_score, share_ratio, allocated_capital, profiles:salesperson_id(full_name)",
        )
        .eq("capital_setting_id", settingId!)
        .order("allocated_capital", { ascending: false });
      if (error) throw error;
      type Row = {
        id: string;
        capital_setting_id: string;
        salesperson_id: string;
        weighted_score: number;
        share_ratio: number;
        allocated_capital: number;
        profiles: { full_name: string | null } | { full_name: string | null }[] | null;
      };
      return ((data ?? []) as unknown as Row[]).map((r) => {
        const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
        return {
          id: r.id,
          capital_setting_id: r.capital_setting_id,
          salesperson_id: r.salesperson_id,
          weighted_score: Number(r.weighted_score),
          share_ratio: Number(r.share_ratio),
          allocated_capital: Number(r.allocated_capital),
          full_name: p?.full_name ?? null,
        };
      });
    },
  });
}

/** تخصیص مشتریان یک کارشناس برای یک snapshot. */
export function useCustomerAllocations(
  settingId: string | undefined,
  salespersonId: string | undefined,
) {
  return useQuery({
    queryKey: ["dyn-customer-allocations", settingId, salespersonId],
    enabled: Boolean(settingId) && Boolean(salespersonId),
    queryFn: async (): Promise<CustomerAllocationRow[]> => {
      // Item 141.3 — read the balance view so held/consumed/remaining come
      // straight from the ledger, using the same arithmetic as the hold path.
      // Note: PostgREST cannot embed a related table through a view (no FK is
      // declared on a view), so customer names are fetched separately and
      // merged in rather than using `customers:customer_id(name)`.
      const { data, error } = await supabase
        .from("v_dynamic_customer_capital_balances")
        .select(
          "allocation_id, capital_setting_id, customer_id, salesperson_id, weighted_score, share_ratio, raw_allocation, final_limit, held_amount, consumed_amount, remaining_amount, binding_constraint",
        )
        .eq("capital_setting_id", settingId!)
        .eq("salesperson_id", salespersonId!)
        .order("final_limit", { ascending: false });
      if (error) throw error;
      type Row = {
        allocation_id: string;
        capital_setting_id: string;
        customer_id: string;
        salesperson_id: string | null;
        weighted_score: number;
        share_ratio: number;
        raw_allocation: number;
        final_limit: number;
        held_amount: number;
        consumed_amount: number;
        remaining_amount: number;
        binding_constraint: string;
      };
      const rows = (data ?? []) as unknown as Row[];

      const nameMap = new Map<string, string | null>();
      const custIds = [...new Set(rows.map((r) => r.customer_id).filter(Boolean))];
      if (custIds.length > 0) {
        const { data: custs } = await supabase
          .from("customers")
          .select("id, name")
          .in("id", custIds);
        for (const c of custs ?? []) nameMap.set(c.id as string, (c.name as string) ?? null);
      }

      return rows.map((r) => {
        return {
          id: r.allocation_id,
          capital_setting_id: r.capital_setting_id,
          customer_id: r.customer_id,
          salesperson_id: r.salesperson_id,
          weighted_score: Number(r.weighted_score),
          share_ratio: Number(r.share_ratio),
          raw_allocation: Number(r.raw_allocation),
          final_limit: Number(r.final_limit),
          held_amount: Number(r.held_amount ?? 0),
          consumed_amount: Number(r.consumed_amount ?? 0),
          remaining_amount: Number(r.remaining_amount ?? 0),
          binding_constraint: r.binding_constraint,
          customer_name: nameMap.get(r.customer_id) ?? null,
        };
      });
    },
  });
}

/**
 * Item 141.3 — salesperson-level capital usage for a snapshot.
 * Keyed by salesperson_id so the drawer header can show the responsible
 * expert's own held / consumed / remaining alongside the customer rows.
 */
export function useSalespersonCapitalUsage(settingId: string | undefined) {
  return useQuery({
    queryKey: ["dyn-salesperson-capital-usage", settingId],
    enabled: Boolean(settingId),
    queryFn: async (): Promise<Map<string, SalespersonCapitalUsage>> => {
      const { data, error } = await supabase
        .from("v_dynamic_salesperson_capital_balances")
        .select(
          "allocation_id, salesperson_id, allocated_capital, held_amount, consumed_amount, remaining_amount",
        )
        .eq("capital_setting_id", settingId!);
      if (error) throw error;
      const map = new Map<string, SalespersonCapitalUsage>();
      for (const r of (data ?? []) as unknown as SalespersonCapitalUsage[]) {
        map.set(r.salesperson_id, {
          allocation_id: r.allocation_id,
          salesperson_id: r.salesperson_id,
          allocated_capital: Number(r.allocated_capital ?? 0),
          held_amount: Number(r.held_amount ?? 0),
          consumed_amount: Number(r.consumed_amount ?? 0),
          remaining_amount: Number(r.remaining_amount ?? 0),
        });
      }
      return map;
    },
  });
}
