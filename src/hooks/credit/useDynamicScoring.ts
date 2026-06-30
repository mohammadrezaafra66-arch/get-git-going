import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type EntityType = "customer" | "salesperson";

export interface ScoringParameter {
  id: string;
  entity_type: EntityType;
  code: string;
  label_fa: string;
  direction: string;
  is_active: boolean;
  display_order: number;
}

export interface EntityScore {
  id: string;
  entity_type: EntityType;
  entity_id: string;
  parameter_id: string;
  raw_score: number;
  note: string | null;
  scored_by: string | null;
  scored_at: string | null;
  period_month: string;
}

export interface CalculatedScoreBreakdownItem {
  parameter_id: string;
  code: string;
  label_fa: string;
  raw_score: number;
  weight: number;
  normalized_weight: number;
  contribution: number;
}

export interface CalculatedScoreResult {
  entity_type: EntityType;
  entity_id: string;
  period_month: string;
  weighted_score: number;
  total_active_weight: number;
  breakdown: CalculatedScoreBreakdownItem[];
}

export interface CustomerLatestAllocation {
  id: string;
  capital_setting_id: string;
  customer_id: string;
  salesperson_id: string | null;
  weighted_score: number;
  share_ratio: number;
  raw_allocation: number;
  final_limit: number;
  binding_constraint: string;
  created_at: string;
  capital_date: string;
}

/** Returns the first day of the current month as `YYYY-MM-01`. */
export function currentPeriodMonth(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

export function useScoringParameters(entityType: EntityType) {
  return useQuery({
    queryKey: ["dyn-scoring-parameters", entityType],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ScoringParameter[]> => {
      const { data, error } = await supabase
        .from("dynamic_scoring_parameters")
        .select("id, entity_type, code, label_fa, direction, is_active, display_order")
        .eq("entity_type", entityType)
        .eq("is_active", true)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ScoringParameter[];
    },
  });
}

export function useEntityScores(
  entityType: EntityType,
  entityId: string | undefined,
  periodMonth: string,
) {
  return useQuery({
    queryKey: ["dyn-entity-scores", entityType, entityId, periodMonth],
    enabled: Boolean(entityId),
    queryFn: async (): Promise<EntityScore[]> => {
      const { data, error } = await supabase
        .from("dynamic_entity_scores")
        .select("*")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId!)
        .eq("period_month", periodMonth);
      if (error) throw error;
      return (data ?? []) as EntityScore[];
    },
  });
}

export function useCalculatedScore(
  entityType: EntityType,
  entityId: string | undefined,
  periodMonth?: string,
) {
  const period = periodMonth ?? currentPeriodMonth();
  return useQuery({
    queryKey: ["dyn-calculated-score", entityType, entityId, period],
    enabled: Boolean(entityId),
    queryFn: async (): Promise<CalculatedScoreResult | null> => {
      const { data, error } = await supabase.rpc("calculate_dynamic_score", {
        p_entity_type: entityType,
        p_entity_id: entityId!,
        p_period_month: period,
      });
      if (error) throw error;
      return (data ?? null) as CalculatedScoreResult | null;
    },
  });
}

export interface UpsertEntityScoreInput {
  entity_type: EntityType;
  entity_id: string;
  parameter_id: string;
  raw_score: number;
  period_month: string;
  note?: string | null;
  scored_by?: string | null;
}

export function useUpsertEntityScore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpsertEntityScoreInput) => {
      const { data, error } = await supabase
        .from("dynamic_entity_scores")
        .upsert(
          {
            entity_type: input.entity_type,
            entity_id: input.entity_id,
            parameter_id: input.parameter_id,
            raw_score: input.raw_score,
            period_month: input.period_month,
            note: input.note ?? null,
            scored_by: input.scored_by ?? null,
            scored_at: new Date().toISOString(),
          },
          { onConflict: "entity_type,entity_id,parameter_id,period_month" },
        )
        .select()
        .single();
      if (error) throw error;
      return data as EntityScore;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({
        queryKey: ["dyn-entity-scores", vars.entity_type, vars.entity_id, vars.period_month],
      });
      qc.invalidateQueries({
        queryKey: ["dyn-calculated-score", vars.entity_type, vars.entity_id, vars.period_month],
      });
      qc.invalidateQueries({
        queryKey: ["dyn-customer-latest-allocation", vars.entity_id],
      });
      qc.invalidateQueries({
        queryKey: ["dyn-salesperson-latest-allocation", vars.entity_id],
      });
    },
  });
}

export function useCustomerLatestAllocation(customerId: string | undefined) {
  return useQuery({
    queryKey: ["dyn-customer-latest-allocation", customerId],
    enabled: Boolean(customerId),
    queryFn: async (): Promise<CustomerLatestAllocation | null> => {
      const { data, error } = await supabase
        .from("customer_capital_allocations_dynamic")
        .select(
          "id, capital_setting_id, customer_id, salesperson_id, weighted_score, share_ratio, raw_allocation, final_limit, binding_constraint, created_at, daily_capital_settings!inner(capital_date)",
        )
        .eq("customer_id", customerId!)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const row = data as unknown as {
        id: string;
        capital_setting_id: string;
        customer_id: string;
        salesperson_id: string | null;
        weighted_score: number;
        share_ratio: number;
        raw_allocation: number;
        final_limit: number;
        binding_constraint: string;
        created_at: string;
        daily_capital_settings: { capital_date: string } | { capital_date: string }[];
      };
      const setting = Array.isArray(row.daily_capital_settings)
        ? row.daily_capital_settings[0]
        : row.daily_capital_settings;
      return {
        id: row.id,
        capital_setting_id: row.capital_setting_id,
        customer_id: row.customer_id,
        salesperson_id: row.salesperson_id,
        weighted_score: Number(row.weighted_score),
        share_ratio: Number(row.share_ratio),
        raw_allocation: Number(row.raw_allocation),
        final_limit: Number(row.final_limit),
        binding_constraint: row.binding_constraint,
        created_at: row.created_at,
        capital_date: setting?.capital_date ?? "",
      };
    },
  });
}

export interface SalespersonLatestAllocation {
  id: string;
  capital_setting_id: string;
  salesperson_id: string;
  weighted_score: number;
  share_ratio: number;
  allocated_capital: number;
  created_at: string;
  capital_date: string;
}

export function useSalespersonLatestAllocation(salespersonId: string | undefined) {
  return useQuery({
    queryKey: ["dyn-salesperson-latest-allocation", salespersonId],
    enabled: Boolean(salespersonId),
    queryFn: async (): Promise<SalespersonLatestAllocation | null> => {
      const { data, error } = await supabase
        .from("salesperson_capital_allocations_dynamic")
        .select(
          "id, capital_setting_id, salesperson_id, weighted_score, share_ratio, allocated_capital, created_at, daily_capital_settings!inner(capital_date)",
        )
        .eq("salesperson_id", salespersonId!)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const row = data as unknown as {
        id: string;
        capital_setting_id: string;
        salesperson_id: string;
        weighted_score: number;
        share_ratio: number;
        allocated_capital: number;
        created_at: string;
        daily_capital_settings: { capital_date: string } | { capital_date: string }[];
      };
      const setting = Array.isArray(row.daily_capital_settings)
        ? row.daily_capital_settings[0]
        : row.daily_capital_settings;
      return {
        id: row.id,
        capital_setting_id: row.capital_setting_id,
        salesperson_id: row.salesperson_id,
        weighted_score: Number(row.weighted_score),
        share_ratio: Number(row.share_ratio),
        allocated_capital: Number(row.allocated_capital),
        created_at: row.created_at,
        capital_date: setting?.capital_date ?? "",
      };
    },
  });
}