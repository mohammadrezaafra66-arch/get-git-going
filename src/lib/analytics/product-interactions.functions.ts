/**
 * MKT-2.4.a — Move `product_interaction_events` insert from the browser
 * to a server function.
 *
 * Why:
 *  - The previous browser-side insert accepted client-shaped
 *    `user_id`, `event_type`, `source`, `product_id`, and
 *    `sale_price_type_id`. A crafted client could spam or forge analytics
 *    rows, which would skew marketing reports and any future
 *    promotion/recommendation signal built on this table.
 *  - This server function validates inputs against fixed enums, verifies
 *    `product_id` (and `sale_price_type_id` when provided) exist, and
 *    forces `user_id` from the authenticated session.
 *
 * RLS / RBAC:
 *  - MKT-2.4.b: direct authenticated INSERT on
 *    `product_interaction_events` is revoked. The user-scoped
 *    `context.supabase` is still used for authorization (auth check) and
 *    for read-only existence checks, but the final insert is performed
 *    with the service-role `supabaseAdmin` client. `user_id` is set
 *    from the authenticated context — never accepted from client input.
 *  - Open to any authenticated user — interaction tracking is not
 *    role-restricted.
 *
 * Self-host:
 *  - No new dependency, no external service, no secret. Pure TanStack
 *    Start serverFn, Linux/Docker compatible.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const EventTypeEnum = z.enum([
  "search_result_viewed",
  "price_checked",
  "chart_opened",
  "product_details_opened",
  "board_price_viewed",
  "sales_text_copied",
]);

const SourceEnum = z.enum([
  "sales_search",
  "live_price_list",
  "amin_hozoor_board",
  "product_details",
  "management_dashboard",
]);

const InputSchema = z.object({
  product_id: z.string().uuid(),
  event_type: EventTypeEnum,
  source: SourceEnum,
  sale_price_type_id: z.string().uuid().nullable().optional(),
  search_session_id: z.string().uuid().nullable().optional(),
});

export type TrackProductInteractionResult =
  | { ok: true }
  | { ok: false; reason: "product_not_found" | "sale_price_type_not_found" };

export const trackProductInteractionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }): Promise<TrackProductInteractionResult> => {
    const { supabase, userId } = context;

    // Server-side existence check for product_id.
    const { data: product, error: productErr } = await supabase
      .from("products")
      .select("id")
      .eq("id", data.product_id)
      .maybeSingle();
    if (productErr) throw new Error("خطا در بررسی محصول");
    if (!product) return { ok: false, reason: "product_not_found" };

    // Existence check for sale_price_type_id when provided.
    if (data.sale_price_type_id) {
      const { data: spt, error: sptErr } = await supabase
        .from("sale_price_types")
        .select("id")
        .eq("id", data.sale_price_type_id)
        .maybeSingle();
      if (sptErr) throw new Error("خطا در بررسی نوع قیمت");
      if (!spt) return { ok: false, reason: "sale_price_type_not_found" };
    }

    // MKT-2.4.b: direct client INSERT is revoked at the RLS/grant level.
    // Load the service-role admin client INSIDE the handler so it never
    // leaks into the client bundle graph (see tanstack-supabase-import-graph).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: insErr } = await supabaseAdmin.from("product_interaction_events").insert({
      user_id: userId, // server-set from authenticated context; never trust client
      product_id: data.product_id,
      event_type: data.event_type,
      source: data.source,
      sale_price_type_id: data.sale_price_type_id ?? null,
      search_session_id: data.search_session_id ?? null,
    });
    // DB-A1 adds a per-session dedup unique index. A duplicate insert raises
    // 23505 (unique_violation); that means the event is already recorded, so
    // treat it as success rather than surfacing an error to the caller.
    if (insErr && (insErr as { code?: string }).code !== "23505") {
      throw new Error("خطا در ثبت رویداد تعامل");
    }

    return { ok: true };
  });
