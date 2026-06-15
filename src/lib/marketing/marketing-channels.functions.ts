/**
 * MKT-2.2.a — Move marketing channel UPDATE and TOGGLE writes from the browser
 * to server functions.
 *
 * Why:
 *  - The browser previously called `marketing_channels.update(...)` directly
 *    and then inserted a client-shaped row into `audit_logs`. The audit
 *    `diff` was constructed from client-held "previous" values, so a crafted
 *    client could fabricate the before/after pair.
 *  - These server functions re-fetch the previous row server-side, validate
 *    every field, and write a server-shaped `diff`.
 *
 * RLS / RBAC:
 *  - Uses the user-scoped `context.supabase` from `requireSupabaseAuth`, so
 *    the existing `mc_write_admin_accountant` policy on `marketing_channels`
 *    and the `audit_logs` insert policy (`auth.uid() = actor_id`) still gate
 *    every write. No RLS change in this slice.
 *  - Role re-checked server-side via `public.user_roles`
 *    (admin | accountant), matching the MKT-2.1 pattern.
 *
 * Self-host:
 *  - No new dependency, no external service, no secret. Pure TanStack Start
 *    serverFn, Linux/Docker compatible.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ALLOWED_ROLES = new Set(["admin", "accountant"]);

const UpdateInputSchema = z.object({
  id: z.string().uuid({ message: "شناسه کانال نامعتبر است" }),
  name: z
    .string()
    .transform((s) => s.trim())
    .pipe(
      z
        .string()
        .min(2, { message: "نام باید حداقل ۲ کاراکتر باشد" })
        .max(100, { message: "نام حداکثر ۱۰۰ کاراکتر است" }),
    ),
  weight: z.coerce.number().finite().min(0).max(100),
  sort_order: z.coerce.number().int().min(0).max(100_000),
  is_active: z.boolean(),
  daily_quota: z.union([z.coerce.number().int().min(0).max(100_000), z.null()]).nullable(),
});

const ToggleInputSchema = z.object({
  id: z.string().uuid({ message: "شناسه کانال نامعتبر است" }),
  is_active: z.boolean(),
});

type ChannelRow = {
  id: string;
  name: string;
  weight: number;
  sort_order: number;
  is_active: boolean;
  daily_quota: number | null;
};

export const updateMarketingChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateInputSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { supabase, userId } = context;

    // Server-side role check (defence in depth on top of mc_write RLS).
    const { data: roleRows, error: roleErr } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (roleErr) throw new Error("خطا در بررسی دسترسی");
    if (!(roleRows ?? []).some((r: { role: string }) => ALLOWED_ROLES.has(r.role))) {
      throw new Error("برای انجام این عملیات دسترسی لازم را ندارید");
    }

    // 1) Fetch previous row server-side. Never trust browser-provided "before".
    const { data: prev, error: prevErr } = await supabase
      .from("marketing_channels")
      .select("id, name, weight, sort_order, is_active, daily_quota")
      .eq("id", data.id)
      .maybeSingle();
    if (prevErr) throw new Error("خطا در دریافت اطلاعات کانال");
    if (!prev) throw new Error("کانال یافت نشد");
    const before = prev as ChannelRow;

    const after = {
      name: data.name,
      weight: Number(data.weight),
      sort_order: Number(data.sort_order),
      is_active: data.is_active,
      daily_quota: data.daily_quota === null ? null : Number(data.daily_quota),
    };

    // 2) Apply update under the user's RLS context.
    const { error: updErr } = await supabase
      .from("marketing_channels")
      .update(after)
      .eq("id", data.id);
    if (updErr) throw new Error("خطا در به‌روزرسانی کانال");

    // 3) Server-shaped diff with only changed fields.
    const changed: Record<string, { from: unknown; to: unknown }> = {};
    (Object.keys(after) as (keyof typeof after)[]).forEach((k) => {
      if (before[k] !== after[k]) {
        changed[k] = { from: before[k], to: after[k] };
      }
    });

    const { error: insErr } = await supabase.from("audit_logs").insert({
      actor_id: userId,
      entity_type: "marketing_channel",
      entity_id: data.id,
      action: "marketing_channel_updated",
      diff: { changed } as never,
    });
    if (insErr) throw new Error("خطا در ثبت رویداد");

    return { ok: true };
  });

export const toggleMarketingChannelActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ToggleInputSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { supabase, userId } = context;

    const { data: roleRows, error: roleErr } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (roleErr) throw new Error("خطا در بررسی دسترسی");
    if (!(roleRows ?? []).some((r: { role: string }) => ALLOWED_ROLES.has(r.role))) {
      throw new Error("برای انجام این عملیات دسترسی لازم را ندارید");
    }

    // 1) Fetch previous is_active server-side.
    const { data: prev, error: prevErr } = await supabase
      .from("marketing_channels")
      .select("id, is_active")
      .eq("id", data.id)
      .maybeSingle();
    if (prevErr) throw new Error("خطا در دریافت اطلاعات کانال");
    if (!prev) throw new Error("کانال یافت نشد");
    const beforeActive = (prev as { is_active: boolean }).is_active;

    // 2) Apply toggle under the user's RLS context.
    const { error: updErr } = await supabase
      .from("marketing_channels")
      .update({ is_active: data.is_active })
      .eq("id", data.id);
    if (updErr) throw new Error("خطا در تغییر وضعیت کانال");

    // 3) Audit only when the value actually changed.
    if (beforeActive !== data.is_active) {
      const { error: insErr } = await supabase.from("audit_logs").insert({
        actor_id: userId,
        entity_type: "marketing_channel",
        entity_id: data.id,
        action: "marketing_channel_toggled",
        diff: { is_active: { from: beforeActive, to: data.is_active } } as never,
      });
      if (insErr) throw new Error("خطا در ثبت رویداد");
    }

    return { ok: true };
  });
