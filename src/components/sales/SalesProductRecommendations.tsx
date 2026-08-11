import { useQuery } from "@tanstack/react-query";
import { Loader2, Sparkles, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatNumber } from "@/lib/i18n/formatters";
import { supabase } from "@/integrations/supabase/client";
import { useProductThumbnails } from "@/hooks/products/useProductThumbnails";
import {
  fetchProductRecommendations,
  REASON_LABEL_FA,
  STOCK_LABEL_FA,
} from "@/lib/products/recommendations";

interface Props {
  productId: string;
  max?: number;
}

interface PriceRow {
  product_id: string;
  rounded_sale_price: number;
  sale_price_type_id: string;
  title: string;
}

export function SalesProductRecommendations({ productId, max = 4 }: Props) {
  const recsQuery = useQuery({
    queryKey: ["sales-recs", productId],
    queryFn: () => fetchProductRecommendations(productId),
    staleTime: 5 * 60_000,
  });

  // فیلتر محصولات ناموجود از فهرست پیشنهادی — نباید قیمت‌ ناموجود نمایش داده شود
  const recs = (recsQuery.data ?? [])
    .filter((r) => r.stock_status !== "out_of_stock" && r.stock_status !== "unavailable")
    .slice(0, max);
  const ids = recs.map((r) => r.product_id);

  const { thumbnailFor } = useProductThumbnails(ids);

  const pricesQuery = useQuery({
    enabled: ids.length > 0,
    queryKey: ["sales-recs-prices", ids],
    queryFn: async (): Promise<Record<string, PriceRow[]>> => {
      const { data, error } = await (supabase as any)
        .from("product_computed_prices_public")
        .select("product_id, rounded_sale_price, sale_price_type_id, sale_price_types!inner(title)")
        .in("product_id", ids);
      if (error) throw error;
      const grouped: Record<string, PriceRow[]> = {};
      for (const row of (data ?? []) as Array<{
        product_id: string;
        rounded_sale_price: number | string;
        sale_price_type_id: string;
        sale_price_types: { title: string } | { title: string }[] | null;
      }>) {
        const t = Array.isArray(row.sale_price_types)
          ? row.sale_price_types[0]?.title
          : row.sale_price_types?.title;
        const price = Number(row.rounded_sale_price);
        if (!Number.isFinite(price) || price <= 0) continue;
        (grouped[row.product_id] ??= []).push({
          product_id: row.product_id,
          rounded_sale_price: price,
          sale_price_type_id: row.sale_price_type_id,
          title: t ?? "—",
        });
      }
      for (const k of Object.keys(grouped)) {
        grouped[k].sort((a, b) => a.rounded_sale_price - b.rounded_sale_price);
        grouped[k] = grouped[k].slice(0, 3);
      }
      return grouped;
    },
    staleTime: 60_000,
  });

  if (recsQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-dashed p-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        در حال یافتن محصولات پیشنهادی…
      </div>
    );
  }

  if (!recs.length) return null;

  const pricesMap = pricesQuery.data ?? {};

  return (
    <div className="rounded-md border border-primary/20 bg-primary/5 p-2.5 space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
        <Sparkles className="h-3.5 w-3.5" />
        محصولات جایگزین / پیشنهادی
      </div>
      <ul className="space-y-1.5">
        {recs.map((rec) => {
          const ps = pricesMap[rec.product_id] ?? [];
          const thumb = thumbnailFor(rec.product_id);
          return (
            <li key={rec.product_id} className="rounded border bg-background/70 p-2 text-xs">
              <div className="flex flex-wrap items-center gap-1.5">
                {thumb ? (
                  <img
                    src={thumb}
                    alt={rec.name}
                    loading="lazy"
                    className="h-8 w-8 flex-shrink-0 rounded border border-border object-cover bg-muted"
                  />
                ) : (
                  <Package className="h-3 w-3 text-muted-foreground" />
                )}
                <span className="font-medium truncate">{rec.name}</span>
                {rec.brand_name && (
                  <span className="text-muted-foreground">· {rec.brand_name}</span>
                )}
                <Badge variant="outline" className="h-4 px-1 text-[9px]">
                  {STOCK_LABEL_FA[rec.stock_status] ?? rec.stock_status}
                </Badge>
                <Badge variant="secondary" className="h-4 px-1 text-[9px]">
                  {REASON_LABEL_FA[rec.reason] ?? rec.reason}
                </Badge>
              </div>
              {ps.length > 0 ? (
                <div className="mt-1 grid grid-cols-3 gap-1">
                  {ps.map((p) => (
                    <div
                      key={p.sale_price_type_id}
                      className="rounded bg-muted/50 px-1.5 py-1 text-right"
                    >
                      <div className="text-[9px] text-muted-foreground truncate">{p.title}</div>
                      <div className="text-[11px] font-semibold tabular-nums">
                        {formatNumber(p.rounded_sale_price)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-1 text-[10px] text-muted-foreground">قیمتی ثبت نشده</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
