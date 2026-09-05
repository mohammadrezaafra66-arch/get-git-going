import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type EntityType = "customer" | "salesperson";

// `score_input` (numeric text 0..100) was added to the DB check constraint by
// migration 20260720120000_phase_e_payment_discipline_score100.sql but never
// reached this union, which made the live branch in DynamicScoringSection look
// unreachable to TypeScript.
export type ScoringInputType = "boolean" | "score_100" | "toman" | "months" | "score_input";

export interface ScoringParameter {
  id: string;
  entity_type: EntityType;
  code: string;
  label_fa: string;
  direction: string;
  is_active: boolean;
  display_order: number;
  input_type: ScoringInputType;
  min_value: number;
  max_value: number;
  unit_label: string | null;
  input_hint: string | null;
}

export interface EntityScore {
  id: string;
  entity_type: EntityType;
  entity_id: string;
  parameter_id: string;
  raw_score: number;
  actual_value: number | null;
  is_clipped: boolean;
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
  /**
   * D8-4 (migration 272): the score's band, resolved against the threshold
   * version in force AT period_month -- not today's version, so a historical
   * score keeps the label it had then. Null when no version covers that period
   * (e.g. scores from before the thresholds were introduced); render nothing
   * rather than inventing a band.
   */
  level_code: string | null;
  level_label: string | null;
  level_order: number | null;
  /** weighted_score on the 0-100 scale the UI already displays. */
  score_pct: number | null;
  /**
   * D-9 (migration 455). `period_month` above is the month the score was actually read
   * from, which is not necessarily the current one: the reader takes the current month
   * first and falls back to the most recent month this entity was scored in.
   * `period_is_fallback` is true exactly when that fallback happened, and the UI must
   * then name `period_month` rather than implying the number is current.
   */
  period_is_current?: boolean;
  period_is_fallback?: boolean;
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
        .select(
          "id, entity_type, code, label_fa, direction, is_active, display_order, input_type, min_value, max_value, unit_label, input_hint",
        )
        .eq("entity_type", entityType)
        .eq("is_active", true)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        ...r,
        min_value: Number((r as { min_value: number | string }).min_value ?? 0),
        max_value: Number((r as { max_value: number | string }).max_value ?? 1),
      })) as ScoringParameter[];
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

/**
 * D-9 (migration 455): with no explicit `periodMonth`, the *database* decides which month
 * to read — current month first, else the most recent month this entity was scored in —
 * via the single definition `resolve_score_period`. Passing `currentPeriodMonth()` here
 * (which is what this did before) pinned the read to the current month with no fallback,
 * so a customer last scored in July displayed 0.000000 while their real score sat one
 * month back. Do not reintroduce a client-side default: that is the second implementation
 * of the rule, and the two would drift.
 *
 * An explicit `periodMonth` is still honoured verbatim for point-in-time views.
 * Read `data.period_month` for the month actually used, and `data.period_is_fallback`
 * to know whether to label it.
 */
export function useCalculatedScore(
  entityType: EntityType,
  entityId: string | undefined,
  periodMonth?: string,
) {
  return useQuery({
    queryKey: ["dyn-calculated-score", entityType, entityId, periodMonth ?? "auto"],
    enabled: Boolean(entityId),
    queryFn: async (): Promise<CalculatedScoreResult | null> => {
      // The argument is OMITTED rather than sent as null when no period is named: the
      // generated type declares it optional (`string | undefined`), and omitting it lets
      // PostgREST fall through to the SQL default `p_period_month date DEFAULT NULL`,
      // which is what puts `resolve_score_period` in charge.
      const args: {
        p_entity_type: EntityType;
        p_entity_id: string;
        p_period_month?: string;
      } = {
        p_entity_type: entityType,
        p_entity_id: entityId!,
      };
      if (periodMonth) args.p_period_month = periodMonth;
      const { data, error } = await supabase.rpc("calculate_dynamic_score", args);
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
  actual_value: number;
  is_clipped?: boolean;
  period_month: string;
  note?: string | null;
  scored_by?: string | null;
}

export function useUpsertEntityScore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpsertEntityScoreInput) => {
      const payload = {
        entity_type: input.entity_type,
        entity_id: input.entity_id,
        parameter_id: input.parameter_id,
        raw_score: input.raw_score,
        actual_value: input.actual_value,
        is_clipped: input.is_clipped ?? false,
        period_month: input.period_month,
        note: input.note ?? null,
        scored_by: input.scored_by ?? null,
        scored_at: new Date().toISOString(),
      };

      const keyFilter = {
        entity_type: input.entity_type,
        entity_id: input.entity_id,
        parameter_id: input.parameter_id,
        period_month: input.period_month,
      };

      const existing = await supabase
        .from("dynamic_entity_scores")
        .select("id")
        .match(keyFilter)
        .maybeSingle();
      if (existing.error) throw existing.error;

      if (!existing.data) {
        const { data, error } = await supabase
          .from("dynamic_entity_scores")
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        return data as EntityScore;
      }

      const { data, error } = await supabase
        .from("dynamic_entity_scores")
        .update(payload)
        .match(keyFilter)
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
      if (vars.entity_type === "customer") {
        qc.invalidateQueries({
          queryKey: ["dyn-customer-realtime-credit", vars.entity_id],
        });
      }
    },
  });
}

export function useCustomerLatestAllocation(customerId: string | undefined) {
  return useQuery({
    queryKey: ["dyn-customer-latest-allocation", customerId],
    enabled: Boolean(customerId),
    refetchInterval: 60_000,
    staleTime: 30_000,
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

export type RealtimeBinding =
  | "overdue"
  | "no_salesperson"
  | "no_capital"
  | "credit_limit"
  | "formula";

export interface RealtimeCreditBreakdownItem {
  parameter_code: string;
  parameter_name: string;
  raw_score: number | null;
  raw_weight: number;
  normalized_weight: number;
  contribution: number;
  has_score: boolean;
}

export interface RealtimeCreditResult {
  weighted_score: number;
  params_evaluated: number;
  params_active: number;
  final_limit: number;
  raw_allocation: number;
  credit_limit: number;
  binding_constraint: RealtimeBinding;
  capital_date_used: string | null;
  is_capital_stale: boolean;
  salesperson_allocated_capital: number;
  share_ratio: number;
  breakdown: RealtimeCreditBreakdownItem[];
  /**
   * D-9 (migration 455): the month this card's score was read from. It used to be the
   * capital snapshot's month, which is why one page could show two different scores for
   * one customer — the card on the capital month, the entry section on the current one.
   * Both now resolve through `resolve_score_period`. `capital_date_used` above is
   * unrelated and still drives the capital snapshot and the peer set.
   */
  score_period_month?: string | null;
  score_period_is_fallback?: boolean;
}

export function useCustomerRealtimeCredit(customerId: string | undefined) {
  return useQuery({
    queryKey: ["dyn-customer-realtime-credit", customerId],
    enabled: Boolean(customerId),
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<RealtimeCreditResult | null> => {
      // RPC not yet in generated types — cast the fn name to satisfy the client.
      const { data, error } = await (
        supabase.rpc as unknown as (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: unknown; error: { message: string } | null }>
      )("calculate_customer_realtime_credit", { p_customer_id: customerId! });
      if (error) throw new Error(error.message);
      return (data ?? null) as RealtimeCreditResult | null;
    },
  });
}
