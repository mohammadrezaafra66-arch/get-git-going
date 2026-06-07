/**
 * WPC-0-004 — Phase 0 admin UI enqueue server function.
 * Auth: requireSupabaseAuth. Roles: admin | manager only.
 * Service role stays server-side; browser never receives secrets.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { enqueueDummyAutomationJob } from "@/lib/automation/enqueue-dummy-job.server";

const ALLOWED_ROLES = ["admin", "manager"] as const;

export const enqueueDummyAutomationJobFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
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

    return enqueueDummyAutomationJob(userId);
  });
