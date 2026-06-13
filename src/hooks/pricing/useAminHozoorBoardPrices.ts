import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useComputedPricesRealtime } from "./useComputedPricesRealtime";

export interface BoardProductRow {
  id: string;
  name: string;
  sku: string | null;
  stock_status: string;
  status: string;
  brand: { id: string; name: string } | null;
  category: { id: string; name: string } | null;
}

export interface BoardPriceItem {
  product: BoardProductRow;
  current_price: number | null;
  previous_price: number | null;
  change_amount: number | null;
  change_percent: number | null;
  last_updated_at: string | null;
  source: "computed" | "history" | "none";
  has_price: boolean;
}

interface FetchOptions {
  salePriceTypeId: string | null;
  page: number;
  pageSize: number;
  search: string;
  brandId: string | null;
  categoryId: string | null;
  stockStatus: "available" | "limited" | null; // null = both
  changedTodayOnly: boolean;
  refetchInterval: number | false;
}

export function useAminHozoorBoardPrices(opts: FetchOptions) {
  const enabled = !!opts.salePriceTypeId;

  const productsQuery = useQuery({
    enabled,
    queryKey: [
      "amin-board-products",
      {
        page: opts.page,
        pageSize: opts.pageSize,
        search: opts.search,
        brandId: opts.brandId,
        categoryId: opts.categoryId,
        stockStatus: opts.stockStatus,
      },
    ],
    queryFn: async () => {
      const from = (opts.page - 1) * opts.pageSize;
      const to = from + opts.pageSize - 1;
      let q = supabase
        .from("products")
        .select(
          "id, name, sku, stock_status, status, brand:brands(id, name), category:categories(id, name)",
          { count: "exact" },
        )
        .eq("status", "active")
        .order("name", { ascending: true })
        .range(from, to);
      if (opts.stockStatus) {
        q = q.eq("stock_status", opts.stockStatus);
      } else {
        q = q.in("stock_status", ["available", "limited"]);
      }
      const s = opts.search.trim();
      if (s.length >= 2) {
        const safe = s.replace(/[%_]/g, "");
        q = q.or(`name.ilike.%${safe}%,sku.ilike.%${safe}%`);
      }
      if (opts.brandId) q = q.eq("brand_id", opts.brandId);
      if (opts.categoryId) q = q.eq("category_id", opts.categoryId);
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as BoardProductRow[], total: count ?? 0 };
    },
    staleTime: 10_000,
    refetchInterval: opts.refetchInterval,
    refetchIntervalInBackground: false,
  });

  const productIds = useMemo(
    () => (productsQuery.data?.rows ?? []).map((p) => p.id),
    [productsQuery.data],
  );

  const computedQuery = useQuery({
    enabled: enabled && productIds.length > 0,
    queryKey: ["amin-board-computed", productIds, opts.salePriceTypeId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("product_computed_prices_public")
        .select("product_id, sale_price_type_id, rounded_sale_price, final_sale_price, computed_at")
        .in("product_id", productIds)
        .eq("sale_price_type_id", opts.salePriceTypeId!);
      if (error) throw error;
      return (data ?? []) as Array<{
        product_id: string;
        sale_price_type_id: string;
        rounded_sale_price: number | string | null;
        final_sale_price: number | string | null;
        computed_at: string;
      }>;
    },
    staleTime: 10_000,
    refetchInterval: opts.refetchInterval,
    refetchIntervalInBackground: false,
  });

  const historyQuery = useQuery({
    enabled: enabled && productIds.length > 0,
    queryKey: ["amin-board-history", productIds, opts.salePriceTypeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_sale_price_history")
        .select(
          "product_id, sale_price_type_id, old_sale_price, new_sale_price, change_amount, change_percent, created_at",
        )
        .in("product_id", productIds)
        .eq("sale_price_type_id", opts.salePriceTypeId!)
        .order("created_at", { ascending: false })
        .limit(productIds.length * 5);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 10_000,
    refetchInterval: opts.refetchInterval,
    refetchIntervalInBackground: false,
  });

  const items: BoardPriceItem[] = useMemo(() => {
    const products = productsQuery.data?.rows ?? [];
    const computedMap = new Map<string, { price: number; at: string }>();
    for (const c of computedQuery.data ?? []) {
      computedMap.set(c.product_id, {
        price: Number(c.rounded_sale_price ?? c.final_sale_price ?? 0),
        at: c.computed_at,
      });
    }
    // آخرین رکورد تاریخچه برای هر محصول (مرتب‌شده desc)
    const historyLatestMap = new Map<
      string,
      {
        new_price: number;
        old_price: number | null;
        change_percent: number | null;
        change_amount: number | null;
        at: string;
      }
    >();
    for (const h of historyQuery.data ?? []) {
      if (historyLatestMap.has(h.product_id)) continue;
      historyLatestMap.set(h.product_id, {
        new_price: Number(h.new_sale_price),
        old_price: h.old_sale_price !== null ? Number(h.old_sale_price) : null,
        change_percent: h.change_percent !== null ? Number(h.change_percent) : null,
        change_amount: h.change_amount !== null ? Number(h.change_amount) : null,
        at: h.created_at,
      });
    }

    const startOfToday = (() => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    })();

    const result: BoardPriceItem[] = products.map((p) => {
      const computed = computedMap.get(p.id);
      const history = historyLatestMap.get(p.id);

      let current_price: number | null = null;
      let last_updated_at: string | null = null;
      let source: BoardPriceItem["source"] = "none";

      if (computed && computed.price > 0) {
        current_price = computed.price;
        last_updated_at = computed.at;
        source = "computed";
      } else if (history) {
        current_price = history.new_price;
        last_updated_at = history.at;
        source = "history";
      }

      const previous_price = history?.old_price ?? null;
      const change_amount =
        history?.change_amount ??
        (current_price !== null && previous_price !== null ? current_price - previous_price : null);
      const change_percent = history?.change_percent ?? null;

      return {
        product: p,
        current_price,
        previous_price,
        change_amount,
        change_percent,
        last_updated_at,
        source,
        has_price: current_price !== null && current_price > 0,
      };
    });

    if (opts.changedTodayOnly) {
      return result.filter((r) => {
        if (!r.last_updated_at) return false;
        return (
          new Date(r.last_updated_at).getTime() >= startOfToday && (r.change_amount ?? 0) !== 0
        );
      });
    }
    return result;
  }, [productsQuery.data, computedQuery.data, historyQuery.data, opts.changedTodayOnly]);

  // Realtime: وقتی worker قیمت‌های محاسبه‌شده را به‌روزرسانی می‌کند،
  // queryهای board بدون نیاز به refresh دستی تازه می‌شوند.
  // polling موجود (opts.refetchInterval) به‌عنوان fallback باقی می‌ماند.
  const { isLive: isRealtimeLive } = useComputedPricesRealtime({
    enabled,
    channelName: "amin-board-computed-prices",
    invalidateKeys: [["amin-board-computed"], ["amin-board-history"]],
  });

  const isLoading =
    productsQuery.isLoading ||
    (productIds.length > 0 && (computedQuery.isLoading || historyQuery.isLoading));
  const isFetching =
    productsQuery.isFetching || computedQuery.isFetching || historyQuery.isFetching;

  // آخرین زمان به‌روزرسانی query (نزدیک‌ترین)
  const lastFetchedAt = useMemo(() => {
    const candidates = [
      productsQuery.dataUpdatedAt,
      computedQuery.dataUpdatedAt,
      historyQuery.dataUpdatedAt,
    ].filter((n) => n > 0);
    return candidates.length ? Math.max(...candidates) : null;
  }, [productsQuery.dataUpdatedAt, computedQuery.dataUpdatedAt, historyQuery.dataUpdatedAt]);

  return {
    items,
    total: productsQuery.data?.total ?? 0,
    isLoading,
    isFetching,
    error: productsQuery.error || computedQuery.error || historyQuery.error,
    lastFetchedAt,
    isRealtimeLive,
    refetch: () => {
      productsQuery.refetch();
      computedQuery.refetch();
      historyQuery.refetch();
    },
  };
}
