import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

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

          const { data, error } = await supabase
            .from("products")
            .select(
              "id, name, model, capacity, stock_status, is_active, product_computed_prices_public(rounded_sale_price)",
            )
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

          const products = (data ?? []).map((row) => {
            const priceRow = Array.isArray(row.product_computed_prices_public)
              ? row.product_computed_prices_public[0]
              : row.product_computed_prices_public;
            return {
              id: row.id,
              name: row.name,
              model: row.model,
              capacity: row.capacity,
              stock_status: row.stock_status,
              is_active: row.is_active,
              price: Number(priceRow?.rounded_sale_price ?? 0),
            };
          });

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