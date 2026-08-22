import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { BASE_SALE_PRICE_TYPE_CODE } from "@/lib/pricing/constants";

/**
 * OG-29 — whether this endpoint may publish real prices is an OWNER decision, and it is open.
 *
 * This endpoint has served `price: 0` for every product since 2026-08-10. Not by design: commit
 * `eef3a4a1` added a `sale_price_types!inner(code)` filter so that "an outside caller can't be
 * handed a cheque or partner price", but `anon` cannot see a single row of `sale_price_types`
 * (`sale_price_types_auth_read` is `{authenticated}`; `sale_price_types_read` requires
 * admin/manager/accountant). PostgREST filters `!inner` embeds by the caller's RLS, so the embed
 * matched nothing and the price map was always empty. Measured 2026-08-22: owner sees 3 price
 * types, anon sees 0.
 *
 * Migration 370 (G-1) revoked anon on `product_computed_prices_public`, which turned that silent
 * zero into a hard HTTP 500. Fixing the 500 by moving the lookup to the service role also removes
 * the accidental zeroing — the feed would start publishing 193 real cash prices to an
 * `Access-Control-Allow-Origin: *` endpoint.
 *
 * That may well be what the endpoint was always meant to do. But it is a new outward-facing
 * disclosure that did not exist yesterday, it is not reversible once scraped, and it is a business
 * decision — not something a security remediation gets to switch on as a side effect. So the
 * endpoint keeps its observable behaviour exactly as it was before 370, and the decision is an
 * Owner-Gate.
 *
 * To publish prices once the owner agrees: set this to `true`. Nothing else needs to change.
 */
const PUBLISH_PUBLIC_PRICES = false;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
} as const;

export const Route = createFileRoute("/api/public/products")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, { status: 204, headers: corsHeaders }),

      GET: async () => {
        try {
          const supabase = createClient<Database>(
            process.env.SUPABASE_URL!,
            process.env.SUPABASE_PUBLISHABLE_KEY!,
            {
              auth: {
                storage: undefined,
                persistSession: false,
                autoRefreshToken: false,
              },
            },
          );

          const { data: rows, error } = await supabase
            .from("products")
            .select("id, name, model, capacity, stock_status, is_active")
            .eq("is_active", true)
            .neq("stock_status", "unavailable")
            .order("name", { ascending: true });

          if (error) {
            return new Response(
              JSON.stringify({ error: "Failed to fetch products" }),
              {
                status: 500,
                headers: { "Content-Type": "application/json", ...corsHeaders },
              },
            );
          }

          const ids = (rows ?? []).map((r) => r.id);
          const priceMap = new Map<string, number>();
          if (PUBLISH_PUBLIC_PRICES && ids.length > 0) {
            // فیلتر نوع‌قیمت الزامی است: این view برای هر محصول یک ردیف به‌ازای هر
            // نوع‌قیمت فعال دارد (نقدی/چکی/همکاری). بدون این فیلتر، حلقهٔ زیر با هر
            // ردیف مقدار قبلی را بازنویسی می‌کرد و عملاً «آخرین ردیفی که آمد» برنده
            // می‌شد — یعنی این endpoint عمومی می‌توانست قیمت چکی یا همکاری را
            // به‌جای نقدی به بیرون بدهد.
            //
            // G-1 / migration 370: `anon` no longer has any privilege on
            // `product_computed_prices_public`. That view is SECURITY DEFINER and was
            // serving all 588 computed price rows — every price type, for every product,
            // active or not — to any unauthenticated caller. The grant had to go.
            //
            // This lookup therefore runs as the service role — reachable only behind
            // PUBLISH_PUBLIC_PRICES, which is currently false pending OG-29 (see the top of
            // this file). The service role is never allowed to decide what is public here:
            // `ids` comes from the query above, which runs as `anon` under the deliberate
            // `public_api_read_active_products` RLS policy (is_active = true AND
            // stock_status <> 'unavailable'). Prices are resolved only for rows RLS has
            // already released, and only for BASE_SALE_PRICE_TYPE_CODE.
            //
            // The response SHAPE is unchanged. The CONTENTS are not: with the flag on this
            // endpoint would return 193 real cash prices where it previously returned zeros
            // for all 199 products. That difference is the whole point of OG-29 — do not
            // describe it as "identical", which is what an earlier revision of this comment
            // wrongly claimed until an independent review measured it.
            //
            // Keep the rest as it is: never move the `products` query onto `supabaseAdmin`,
            // and never drop the `.in("product_id", ids)` bound. Both are what keep the
            // service-role client from becoming the thing that chooses the public surface.
            const { data: prices, error: priceErr } = await supabaseAdmin
              .from("product_computed_prices_public")
              .select("product_id, rounded_sale_price, sale_price_types!inner(code)")
              .eq("sale_price_types.code", BASE_SALE_PRICE_TYPE_CODE)
              .in("product_id", ids);
            if (priceErr) {
              return new Response(
                JSON.stringify({ error: "Failed to fetch prices" }),
                {
                  status: 500,
                  headers: {
                    "Content-Type": "application/json",
                    ...corsHeaders,
                  },
                },
              );
            }
            for (const p of prices ?? []) {
              if (p.product_id) {
                priceMap.set(p.product_id, Number(p.rounded_sale_price ?? 0));
              }
            }
          }

          const products = (rows ?? []).map((row) => ({
            id: row.id,
            name: row.name,
            model: row.model,
            capacity: row.capacity,
            stock_status: row.stock_status,
            is_active: row.is_active,
            price: priceMap.get(row.id) ?? 0,
          }));

          return new Response(JSON.stringify({ products }), {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "public, max-age=60",
              ...corsHeaders,
            },
          });
        } catch {
          return new Response(
            JSON.stringify({ error: "Internal server error" }),
            {
              status: 500,
              headers: { "Content-Type": "application/json", ...corsHeaders },
            },
          );
        }
      },
    },
  },
});