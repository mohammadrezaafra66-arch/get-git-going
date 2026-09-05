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

/**
 * Item W-1 — the daily cash engine, `compute_daily_capital(p_capital_date date)`.
 *
 * The function has existed and worked for a long time and had zero callers: nothing in `src/`
 * or `server/` referenced it, so the accountant typed the day's capital from memory while a
 * complete calculation of the same figure sat unused in the database.
 *
 * It is a SUGGESTION and nothing more. It is never written anywhere, never submitted, and never
 * placed in the input field on its own — the accountant has to ask for it, and can then edit or
 * ignore the number like any other. `run_daily_capital_allocation` still reads only what is in
 * the field.
 *
 * `input_id` is the honesty flag. The formula's cash terms — bank, till, cheques in and out,
 * external receivables and payables, near-term expenses, risk reserve, blocked funds, inventory
 * liquidity, manual adjustment — all come from a `daily_capital_inputs` row for that exact date.
 * With no such row every one of them COALESCEs to zero and the function still returns a number,
 * clamped at zero from below. That number is not a suggestion, it is an artefact of the missing
 * row, so the caller must not present it as one.
 */
export interface SuggestedDailyCapital {
  capital_date: string;
  formula_version: string;
  system_suggested_capital: number;
  total_receivables: number;
  overdue_receivables: number;
  due_today_receivables: number;
  future_receivables: number;
  total_payables: number;
  overdue_payables: number;
  due_today_payables: number;
  future_payables: number;
  /** NULL when no `daily_capital_inputs` row exists for this date — see the note above. */
  input_id: string | null;
  bank_balance: number;
  cash_balance: number;
  incoming_checks: number;
  outgoing_checks: number;
  external_receivables: number;
  external_payables: number;
  near_term_expenses: number;
  risk_reserve: number;
  blocked_funds: number;
  inventory_liquidity_value: number;
  manual_adjustment: number;
}

/** پیشنهاد سامانه برای سرمایه روز — فقط پیشنهاد؛ در جایی ثبت نمی‌شود. */
export function useSuggestedDailyCapital(capitalDate: string | undefined) {
  return useQuery({
    queryKey: ["dyn-capital-suggestion", capitalDate],
    enabled: Boolean(capitalDate),
    staleTime: 60_000,
    queryFn: async (): Promise<SuggestedDailyCapital | null> => {
      const { data, error } = await supabase.rpc("compute_daily_capital", {
        p_capital_date: capitalDate!,
      });
      if (error) throw error;
      const row = (data as SuggestedDailyCapital[] | null)?.[0];
      if (!row) return null;
      const num = (v: unknown) => Number(v ?? 0);
      return {
        capital_date: row.capital_date,
        formula_version: row.formula_version,
        system_suggested_capital: num(row.system_suggested_capital),
        total_receivables: num(row.total_receivables),
        overdue_receivables: num(row.overdue_receivables),
        due_today_receivables: num(row.due_today_receivables),
        future_receivables: num(row.future_receivables),
        total_payables: num(row.total_payables),
        overdue_payables: num(row.overdue_payables),
        due_today_payables: num(row.due_today_payables),
        future_payables: num(row.future_payables),
        input_id: row.input_id ?? null,
        bank_balance: num(row.bank_balance),
        cash_balance: num(row.cash_balance),
        incoming_checks: num(row.incoming_checks),
        outgoing_checks: num(row.outgoing_checks),
        external_receivables: num(row.external_receivables),
        external_payables: num(row.external_payables),
        near_term_expenses: num(row.near_term_expenses),
        risk_reserve: num(row.risk_reserve),
        blocked_funds: num(row.blocked_funds),
        inventory_liquidity_value: num(row.inventory_liquidity_value),
        manual_adjustment: num(row.manual_adjustment),
      };
    },
  });
}
