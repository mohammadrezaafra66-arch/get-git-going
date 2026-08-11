import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuthNode20 } from "@/integrations/supabase/messenger-auth-middleware";

/**
 * D8-5: a manual entry carries its own duration, chosen by the manager at the
 * moment of recording. There is no global rule and no default the manager
 * cannot see — 1 means "this month only", which is exactly how the feature
 * behaved before durations existed.
 */
export const EFFECT_MONTHS_MIN = 1;
export const EFFECT_MONTHS_MAX = 60;

const EffectMonthsSchema = z
  .number()
  .int("مدت اثر باید عدد صحیح باشد")
  .min(EFFECT_MONTHS_MIN, "مدت اثر باید حداقل ۱ ماه باشد")
  .max(EFFECT_MONTHS_MAX, "مدت اثر نمی‌تواند بیش از ۶۰ ماه باشد");

const InputSchema = z.object({
  employeeId: z.string().uuid(),
  amount: z.number().refine((n) => n !== 0, { message: "مقدار نمی‌تواند صفر باشد" }),
  reason: z.string().trim().min(10, "دلیل باید حداقل ۱۰ کاراکتر باشد").max(500),
  effectMonths: EffectMonthsSchema,
});

const PreviewInputSchema = z.object({
  employeeId: z.string().uuid(),
  amount: z.number().refine((n) => n !== 0, { message: "مقدار نمی‌تواند صفر باشد" }),
  effectMonths: EffectMonthsSchema,
});

/** One month of the decay schedule, as the database computed it. */
export interface ManualScoreScheduleRow {
  month_offset: number;
  month_start: string;
  factor: number;
  effective_amount: number;
}

export interface ManualScorePreview {
  employee_id: string;
  amount: number;
  effect_months: number;
  decay_shape: "linear";
  current: { monthly_score: number; total_score: number; level: number };
  projected: {
    monthly_score: number;
    total_score: number;
    level: number;
    leveled_up: boolean;
  };
  delta: { monthly_score: number; total_score: number };
  schedule: ManualScoreScheduleRow[];
}

/**
 * The pre-submit preview.
 *
 * This deliberately does NOT compute anything in TypeScript. It calls
 * `preview_manual_score_adjustment`, which runs the same
 * `compute_employee_score` that produces the stored score, with this pending
 * entry injected as a hypothetical. A preview with its own formula would drift
 * from reality the first time the scoring maths changed — and a preview that
 * lies is worse than no preview at all.
 */
export const previewManualScoreAdjustment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuthNode20])
  .inputValidator((input: unknown) => PreviewInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    await assertAdmin(userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // `as never`: preview_manual_score_adjustment is new in migration 273 and is
    // not yet in the generated types.ts. Same cast the rest of
    // lib/operations/gamification.ts uses for RPCs added after the last codegen.
    const { data: preview, error } = await supabaseAdmin.rpc(
      "preview_manual_score_adjustment" as never,
      {
        _employee_id: data.employeeId,
        _amount: data.amount,
        _effect_months: data.effectMonths,
      } as never,
    );
    if (error) throw new Error(error.message);

    return preview as unknown as ManualScorePreview;
  });

export const recordManualScoreAdjustment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuthNode20])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    await assertAdmin(userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: insErr } = await supabaseAdmin.from("employee_score_events").insert({
      employee_id: data.employeeId,
      event_type: "manual_adjustment",
      source_table: "manual",
      source_id: `${userId}:${Date.now()}`,
      payload: {
        amount: data.amount,
        reason: data.reason,
        adjusted_by: userId,
        // Required by chk_manual_adjustment_payload (migration 273) — an entry
        // without a duration is rejected by the database, not just by this form.
        effect_months: data.effectMonths,
      },
    });
    if (insErr) throw new Error(insErr.message);

    // Audit trail
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: userId,
      entity_type: "employee_score_event",
      entity_id: data.employeeId,
      action: "manual_score_adjustment",
      diff: { amount: data.amount, reason: data.reason, effect_months: data.effectMonths },
    });

    // Recompute the affected employee's score
    const { data: recalculated, error: recErr } = await supabaseAdmin.rpc(
      "calculate_employee_score",
      { _employee_id: data.employeeId },
    );
    if (recErr) throw new Error(recErr.message);

    return {
      ok: true,
      monthlyScore: Number(
        (recalculated as unknown as { monthly_score?: number } | null)?.monthly_score ?? 0,
      ),
    };
  });

/**
 * Authorize: admin only.
 *
 * NOTE: has_role() is overloaded in the DB — (uuid,app_role) and (uuid,text) —
 * so PostgREST cannot resolve it via RPC (PGRST203). Read user_roles directly
 * with the service-role client instead.
 */
async function assertAdmin(userId: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: roleRows } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const roles = (roleRows ?? []).map((r) => String(r.role));
  if (!roles.includes("admin")) {
    throw new Error("Forbidden: admin role required");
  }
}
