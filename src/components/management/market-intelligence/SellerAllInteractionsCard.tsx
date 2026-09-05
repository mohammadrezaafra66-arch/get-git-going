import { useQuery } from "@tanstack/react-query";
import { Loader2, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { MICardShell } from "./CardShell";
import { supabase } from "@/integrations/supabase/client";
import { formatNumber } from "@/lib/i18n/formatters";
import type { RangeDays } from "@/lib/management/market-intelligence";

/**
 * C-11 (unwired wave 1) — the only caller of `public.mi_get_seller_favorite_products`.
 *
 * This is NOT the same measurement as the «محبوب فروشندگان» card next to it, and the two
 * are deliberately kept apart. Read from pg_proc, 2026-09-05:
 *
 *   mi_get_seller_top_products      counts only four event types
 *                                   ('price_checked','chart_opened',
 *                                    'product_details_opened','search_result_viewed'),
 *                                   and reports unique_seller_count. No price.
 *   mi_get_seller_favorite_products counts EVERY product_interaction_events row for a
 *                                   sales user, and reports the product's latest sale
 *                                   price from product_sale_price_history. No seller count.
 *
 * So this card answers "what do sellers touch at all, and what does it currently sell
 * for", which is the one that puts a price next to the attention.
 *
 * The function was BROKEN until migration 443 — `column reference "product_id" is
 * ambiguous`, on every call — so it had never returned a row to anything.
 */

const STOCK_LABEL: Record<string, string> = {
  available: "موجود",
  limited: "محدود",
  unavailable: "ناموجود",
  unknown: "نامشخص",
};

type FavoriteRow = {
  product_id: string;
  name: string;
  sku: string | null;
  brand: { id: string; name: string } | null;
  category: { id: string; name: string } | null;
  stock_status: string;
  interaction_count: number;
  last_interaction_at: string;
  current_price: number | null;
};

type RpcFn = (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

export function SellerAllInteractionsCard({ days }: { days: RangeDays }) {
  const q = useQuery({
    queryKey: ["mi-seller-favorites-all-events", days],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as unknown as RpcFn)(
        "mi_get_seller_favorite_products",
        { p_days: days, p_limit: 10 },
      );
      if (error) throw new Error(error.message);
      return (data ?? []) as FavoriteRow[];
    },
    staleTime: 60_000,
  });

  return (
    <MICardShell
      title="پرتعامل‌ترین کالاها نزد فروشندگان"
      description={`همهٔ تعامل‌های کاربران دارای نقش فروش در ${formatNumber(days)} روز اخیر، به‌همراه قیمت فروش فعلی`}
      rule="برخلاف کارت «محبوب فروشندگان» که فقط چهار نوع رویداد را می‌شمارد، اینجا همهٔ رویدادهای تعامل شمرده می‌شود و آخرین قیمت فروش ثبت‌شدهٔ محصول کنارش می‌آید."
      icon={<Star className="h-4 w-4 text-violet-600" />}
    >
      {q.isLoading ? (
        <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
          <Loader2 className="ml-2 h-4 w-4 animate-spin" /> در حال بارگذاری...
        </div>
      ) : q.isError ? (
        <p className="py-6 text-center text-sm text-destructive">
          دریافت این فهرست ناموفق بود: {(q.error as Error).message}
        </p>
      ) : !q.data || q.data.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          در {formatNumber(days)} روز اخیر تعاملی از کاربران فروش ثبت نشده است. بازهٔ بلندتری را
          انتخاب کنید.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {q.data.map((p) => (
            <li key={p.product_id} className="flex items-center gap-3 rounded-md border p-2 text-sm">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{p.name}</div>
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                  {p.brand?.name && <span>{p.brand.name}</span>}
                  {p.category?.name && <span>· {p.category.name}</span>}
                  <Badge variant="outline" className="h-4 px-1 text-[10px]">
                    {STOCK_LABEL[p.stock_status] ?? p.stock_status}
                  </Badge>
                </div>
              </div>
              <div className="shrink-0 text-left">
                <div className="text-sm font-bold tabular-nums text-violet-600">
                  {formatNumber(p.interaction_count)}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {p.current_price != null
                    ? `${formatNumber(Number(p.current_price))} تومان`
                    : "قیمت ثبت‌نشده"}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </MICardShell>
  );
}
