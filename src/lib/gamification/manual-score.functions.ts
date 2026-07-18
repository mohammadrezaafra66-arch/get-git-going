import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuthNode20 } from "@/integrations/supabase/messenger-auth-middleware";

const InputSchema = z.object({
  employeeId: z.string().uuid(),
  amount: z.number().refine((n) => n !== 0, { message: "مقدار نمی‌تواند صفر باشد" }),
  reason: z.string().trim().min(10, "دلیل باید حداقل ۱۰ کاراکتر باشد").max(500),
});

export const recordManualScoreAdjustment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuthNode20])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Authorize: admin only
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!isAdmin) {
      throw new Error("Forbidden: admin role required");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error: insErr } = await supabaseAdmin
      .from("employee_score_events")
      .insert({
        employee_id: data.employeeId,
        event_type: "manual_adjustment",
        source_table: "manual",
        source_id: `${userId}:${Date.now()}`,
        payload: {
          amount: data.amount,
          reason: data.reason,
          adjusted_by: userId,
        },
      });
    if (insErr) throw new Error(insErr.message);

    // Audit trail
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: userId,
      entity_type: "employee_score_event",
      entity_id: data.employeeId,
      action: "manual_score_adjustment",
      diff: { amount: data.amount, reason: data.reason },
    });

    // Recompute the affected employee's score
    const { error: recErr } = await supabaseAdmin.rpc("calculate_employee_score", {
      _employee_id: data.employeeId,
    });
    if (recErr) throw new Error(recErr.message);

    return { ok: true };
  });