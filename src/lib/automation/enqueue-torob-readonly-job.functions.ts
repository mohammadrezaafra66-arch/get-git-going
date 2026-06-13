/**
 * Phase 2 / TPC-2-004 — admin UI server function for Torob queue enqueue.
 * Auth: requireSupabaseAuth. Roles: admin | manager only.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  EnqueueTorobReadonlyJobInputSchema,
  enqueueTorobReadonlyAutomationJob,
} from "@/lib/automation/enqueue-torob-readonly-job.server";

const ALLOWED_ROLES = ["admin", "manager"] as const;

export const enqueueTorobReadonlyAutomationJobFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => EnqueueTorobReadonlyJobInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const userId = (context as { userId: string }).userId;

    const { data: roleRows, error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (roleErr) {
      throw new Error("بررسی نقش کاربر ناموفق بود");
    }
    const roles = (roleRows ?? []).map((r) => r.role as string);
    const allowed = roles.some((r) => (ALLOWED_ROLES as readonly string[]).includes(r));
    if (!allowed) {
      throw new Error("دسترسی لازم برای این عملیات را ندارید");
    }

    return enqueueTorobReadonlyAutomationJob(userId, data);
  });
