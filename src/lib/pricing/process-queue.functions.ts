import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { processPricingRecomputeQueue } from "@/lib/pricing/process-recompute-queue.server";

/**
 * PRICE-RT.4 — Authenticated server function to manually trigger the pricing
 * recompute worker from the admin UI without exposing PRICING_WORKER_TOKEN
 * to the browser.
 *
 * Auth: requireSupabaseAuth (valid Supabase user).
 * Authorization: caller must hold one of (admin | manager | accountant) in
 * public.user_roles. This mirrors the `pricing.update` permission used by
 * /pricing/recompute-prices.
 */

const ALLOWED_ROLES = ["admin", "manager", "accountant"] as const;

export const triggerPricingRecomputeQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z
      .object({
        batch_size: z.number().int().positive().max(100).optional(),
        max_attempts: z.number().int().positive().max(10).optional(),
      })
      .optional()
      .default({}),
  )
  .handler(async ({ data, context }) => {
    const userId = (context as { userId: string }).userId;

    // Authorization: check user_roles via service role (RLS-safe).
    const { data: roleRows, error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (roleErr) {
      throw new Error("Failed to verify role");
    }
    const roles = (roleRows ?? []).map((r) => r.role as string);
    const allowed = roles.some((r) => (ALLOWED_ROLES as readonly string[]).includes(r));
    if (!allowed) {
      throw new Error("Forbidden: pricing operator role required");
    }

    const summary = await processPricingRecomputeQueue({
      batchSize: data?.batch_size,
      maxAttempts: data?.max_attempts,
      actingUserId: userId,
    });
    return summary;
  });
