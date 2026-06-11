import { useQuery } from "@tanstack/react-query";
import {
  fetchProductPriceHistory,
  fetchLatestUsdRate,
  type PriceRangeKey,
} from "@/lib/pricing/price-history";

export function useProductPriceHistory(opts: {
  productId: string | null;
  salePriceTypeId: string | null;
  range: PriceRangeKey;
  enabled?: boolean;
}) {
  const enabled = (opts.enabled ?? true) && !!opts.productId && !!opts.salePriceTypeId;
  return useQuery({
    enabled,
    queryKey: ["product-price-history", opts.productId, opts.salePriceTypeId, opts.range],
    queryFn: () =>
      fetchProductPriceHistory({
        productId: opts.productId!,
        salePriceTypeId: opts.salePriceTypeId!,
        range: opts.range,
      }),
    staleTime: 60_000,
  });
}

export function useLatestUsdRate(enabled = true) {
  return useQuery({
    enabled,
    queryKey: ["latest-usd-rate"],
    queryFn: fetchLatestUsdRate,
    staleTime: 5 * 60_000,
  });
}
