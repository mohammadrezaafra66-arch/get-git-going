import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { BASE_SALE_PRICE_TYPE_CODE } from "@/lib/pricing/constants";

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
          if (ids.length > 0) {
            // فیلتر نوع‌قیمت الزامی است: این view برای هر محصول یک ردیف به‌ازای هر
            // نوع‌قیمت فعال دارد (نقدی/چکی/همکاری). بدون این فیلتر، حلقهٔ زیر با هر
            // ردیف مقدار قبلی را بازنویسی می‌کرد و عملاً «آخرین ردیفی که آمد» برنده
            // می‌شد — یعنی این endpoint عمومی می‌توانست قیمت چکی یا همکاری را
            // به‌جای نقدی به بیرون بدهد.
            const { data: prices, error: priceErr } = await supabase
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