/**
 * MKT-2.1 — Move "promotion_suggestion_used" audit insert from the browser
 * to a server function.
 *
 * Why:
 *  - The previous browser-side insert into `audit_logs` accepted client-shaped
 *    `diff` JSON. The `v_promotion_suggestions` view derives `used_today` and
 *    daily-quota state from those rows, so a crafted client could skew
 *    quotas/reports.
 *  - This server function re-fetches product/channel names server-side,
 *    enforces the daily quota server-side, and writes a server-shaped `diff`.
 *
 * RLS / RBAC:
 *  - Uses the user-scoped `context.supabase` from `requireSupabaseAuth`, so
 *    the existing `audit_logs` policy (`auth.uid() = actor_id`) still gates
 *    the insert. No RLS change.
 *  - Role re-checked server-side via `public.user_roles` (admin | manager |
 *    accountant), matching the pattern used in `currency-sources.functions.ts`.
 *
 * Self-host:
 *  - No new dependency, no external service, no secret. Pure TanStack Start
 *    serverFn, Linux/Docker compatible.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ALLOWED_ROLES = new Set(["admin", "manager", "accountant"]);

const FiniteNum = z.coerce
  .number()
  .finite()
  .min(0)
  .max(1_000_000);

const InputSchema = z.object({
  product_id: z.string().uuid({ message: "شناسه محصول نامعتبر است" }),
  channel_id: z.string().uuid({ message: "شناسه کانال نامعتبر است" }),
  score: FiniteNum,
  label_weight_sum: FiniteNum,
  channel_weight: FiniteNum,
  stock_factor: FiniteNum,
  recency_factor: FiniteNum,
  qty_90d: FiniteNum,
});

export type MarkPromotionUsedResult =
  | { ok: true }
  | { ok: false; reason: "quota_exhausted" };

/**
 * Compute the start of "today" in Asia/Tehran (UTC+3:30, no DST since 2022)
 * and return it as a UTC ISO string suitable for a `created_at >=` filter.
 * Mirrors the boundary used by `v_promotion_suggestions.used_today`.
 */
function tehranTodayStartIso(): string {
  const TEHRAN_OFFSET_MS = (3 * 60 + 30) * 60 * 1000;
  const nowUtcMs = Date.now();
  const tehranNow = new Date(nowUtcMs + TEHRAN_OFFSET_MS);
  tehranNow.setUTCHours(0, 0, 0, 0);
  const tehranMidnightUtcMs = tehranNow.getTime() - TEHRAN_OFFSET_MS;
  return new Date(tehranMidnightUtcMs).toISOString();
}

export const markPromotionSuggestionUsed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }): Promise<MarkPromotionUsedResult> => {
    const { supabase, userId } = context;

    // 1) Server-side role check (defence in depth on top of audit_logs RLS).
    const { data: roleRows, error: roleErr } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (roleErr) throw new Error("خطا در بررسی دسترسی");
    const roles = (roleRows ?? []).map((r: { role: string }) => r.role);
    if (!roles.some((r) => ALLOWED_ROLES.has(r))) {
      throw new Error("برای ثبت این عملیات دسترسی لازم را ندارید");
    }

    // 2) Re-fetch product + channel from DB. Never trust client display names.
    const [productRes, channelRes] = await Promise.all([
      supabase
        .from("products")
        .select("id, name")
        .eq("id", data.product_id)
        .maybeSingle(),
      supabase
        .from("marketing_channels")
        .select("id, name, is_active, daily_quota")
        .eq("id", data.channel_id)
        .maybeSingle(),
    ]);

    if (productRes.error) throw new Error("خطا در دریافت اطلاعات محصول");
    if (channelRes.error) throw new Error("خطا در دریافت اطلاعات کانال");

    const product = productRes.data;
    const channel = channelRes.data;
    if (!product) throw new Error("محصول یافت نشد");
    if (!channel) throw new Error("کانال یافت نشد");
    if (channel.is_active === false) throw new Error("این کانال فعال نیست");

    // 3) Daily quota — same semantics as v_promotion_suggestions.used_today.
    //    NULL or 0 => unlimited.
    const quota = channel.daily_quota;
    if (quota !== null && quota !== undefined && Number(quota) > 0) {
      const since = tehranTodayStartIso();
      const { count, error: countErr } = await supabase
        .from("audit_logs")
        .select("id", { count: "exact", head: true })
        .eq("action", "promotion_suggestion_used")
        .gte("created_at", since)
        .contains("diff", { channel_id: data.channel_id });
      if (countErr) throw new Error("خطا در بررسی سهمیه روزانه");
      if ((count ?? 0) >= Number(quota)) {
        return { ok: false, reason: "quota_exhausted" };
      }
    }

    // 4) Insert the audit row with a server-shaped diff. RLS requires
    //    actor_id = auth.uid(); userId is the authenticated user.
    const entity_id = `${data.product_id}:${data.channel_id}`;
    const diff = {
      product_id: data.product_id,
      product_name: product.name,
      channel_id: data.channel_id,
      channel_name: channel.name,
      score: Number(data.score),
      label_weight_sum: Number(data.label_weight_sum),
      channel_weight: Number(data.channel_weight),
      stock_factor: Number(data.stock_factor),
      recency_factor: Number(data.recency_factor),
      qty_90d: Number(data.qty_90d),
    } as const;

    const { error: insErr } = await supabase.from("audit_logs").insert({
      actor_id: userId,
      entity_type: "promotion_suggestion",
      entity_id,
      action: "promotion_suggestion_used",
      diff: diff as never,
    });
    if (insErr) throw new Error("خطا در ثبت رویداد");

    return { ok: true };
  });