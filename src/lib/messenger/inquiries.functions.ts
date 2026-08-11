// Phase 7 — Inquiry serverFns. هرگز throw نمی‌کنند؛ خطای فارسی RPC را عیناً برمی‌گردانند.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuthNode20 } from "@/integrations/supabase/messenger-auth-middleware";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

const createInput = z.object({
  group_id: z.string().uuid({ message: "شناسه گروه نامعتبر است" }),
  product_id: z.string().uuid({ message: "شناسه محصول نامعتبر است" }),
  assigned_to: z.string().uuid({ message: "شناسه مسئول خرید نامعتبر است" }),
});

const replyInput = z.object({
  inquiry_id: z.string().uuid({ message: "شناسه استعلام نامعتبر است" }),
  price: z.number().int().positive({ message: "قیمت باید بزرگ‌تر از صفر باشد" }),
  note: z.string().max(1000).optional().nullable(),
});

const transferInput = z.object({
  inquiry_id: z.string().uuid({ message: "شناسه استعلام نامعتبر است" }),
  to_user: z.string().uuid({ message: "شناسه کاربر مقصد نامعتبر است" }),
});

export type InquiryResult = { ok: boolean; error?: string; id?: string };

function parseError(message: string | undefined | null): string {
  if (!message) return "خطای نامشخص رخ داد.";
  // پیام‌های فارسی RPC را که با ERRCODE P0001 پرتاب می‌شوند، عیناً برگردان
  return message;
}

export const createInquiry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuthNode20])
  .inputValidator((data: unknown) => createInput.parse(data))
  .handler(async ({ data, context }): Promise<InquiryResult> => {
    const { supabase } = context as { supabase: SupabaseClient };
    try {
      const { data: row, error } = await supabase.rpc("create_inquiry", {
        p_group_id: data.group_id,
        p_product_id: data.product_id,
        p_assigned_to: data.assigned_to,
      });
      if (error) return { ok: false, error: parseError(error.message) };
      const id = typeof row === "string" ? row : (row as { id?: string } | null)?.id;
      return { ok: true, id };
    } catch (e) {
      return { ok: false, error: parseError((e as Error)?.message) };
    }
  });

export const replyInquiry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuthNode20])
  .inputValidator((data: unknown) => replyInput.parse(data))
  .handler(async ({ data, context }): Promise<InquiryResult> => {
    const { supabase } = context as { supabase: SupabaseClient };
    try {
      const { error } = await supabase.rpc("reply_inquiry", {
        p_inquiry_id: data.inquiry_id,
        p_price: data.price,
        p_note: data.note ?? null,
      });
      if (error) return { ok: false, error: parseError(error.message) };
      return { ok: true };
    } catch (e) {
      return { ok: false, error: parseError((e as Error)?.message) };
    }
  });

export const transferInquiry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuthNode20])
  .inputValidator((data: unknown) => transferInput.parse(data))
  .handler(async ({ data, context }): Promise<InquiryResult> => {
    const { supabase } = context as { supabase: SupabaseClient };
    try {
      const { error } = await supabase.rpc("transfer_inquiry", {
        p_inquiry_id: data.inquiry_id,
        p_to_user: data.to_user,
      });
      if (error) return { ok: false, error: parseError(error.message) };
      return { ok: true };
    } catch (e) {
      return { ok: false, error: parseError((e as Error)?.message) };
    }
  });