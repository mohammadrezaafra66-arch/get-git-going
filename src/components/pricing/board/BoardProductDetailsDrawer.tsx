import { useQuery } from "@tanstack/react-query";
import { Loader2, Package, Tag, Layers, Hash, Info } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { formatNumber, formatDateTimeFa } from "@/lib/i18n/formatters";
import { lazy, Suspense, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { PriceChangeBadge } from "@/components/pricing/price-history/PriceChangeBadge";
import { CreatePriceAlertButton } from "@/components/pricing/price-alerts/CreatePriceAlertButton";
import { ProductRecommendationsCard } from "@/components/products/recommendations/ProductRecommendationsCard";
import {
  RANGE_LABEL,
  computeChangePercent,
  computeDirection,
  tomanToUsd,
  type PriceRangeKey,
} from "@/lib/pricing/price-history";
import { useLatestUsdRate, useProductPriceHistory } from "@/hooks/pricing/useProductPriceHistory";

const ProductPriceChart = lazy(
  () => import("@/components/pricing/price-history/ProductPriceChart"),
);

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  productId: string | null;
  salePriceTypeId: string | null;
  salePriceTypeTitle: string;
}

const HISTORY_LIMIT = 20;

export function BoardProductDetailsDrawer({
  open,
  onOpenChange,
  productId,
  salePriceTypeId,
  salePriceTypeTitle,
}: Props) {
  const productQuery = useQuery({
    enabled: open && !!productId,
    queryKey: ["board-product-details", productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(
          "id, name, sku, description, technical_notes, color, capacity, model, stock_status, brand:brands(name), category:categories(name)",
        )
        .eq("id", productId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 60_000,
  });

  const historyQuery = useQuery({
    enabled: open && !!productId && !!salePriceTypeId,
    queryKey: ["board-product-history", productId, salePriceTypeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_sale_price_history")
        .select("id, new_sale_price, old_sale_price, change_amount, change_percent, created_at")
        .eq("product_id", productId!)
        .eq("sale_price_type_id", salePriceTypeId!)
        .order("created_at", { ascending: false })
        .limit(HISTORY_LIMIT);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });

  const product = productQuery.data;
  const history = historyQuery.data ?? [];
  const latest = history[0];
  const previous = history[1];

  // ---------- chart state ----------
  const [range, setRange] = useState<PriceRangeKey>("30d");
  const [mode, setMode] = useState<"toman" | "usd">("toman");
  const chartHistory = useProductPriceHistory({
    productId,
    salePriceTypeId,
    range,
    enabled: open,
  });
  const usdRateQuery = useLatestUsdRate(open && mode === "usd");
  const usdRate = usdRateQuery.data?.rate ?? null;
  const chartData = chartHistory.data ?? [];
  const usdMissing = mode === "usd" && !usdRateQuery.isLoading && !usdRate;

  const summary = useMemo(() => {
    if (!latest) return null;
    const current = Number(latest.new_sale_price);
    const prev = previous
      ? Number(previous.new_sale_price)
      : latest.old_sale_price !== null
        ? Number(latest.old_sale_price)
        : null;
    const amt = prev !== null ? current - prev : null;
    return {
      change_amount: amt,
      change_percent: computeChangePercent(current, prev),
      direction: computeDirection(amt),
    };
  }, [latest, previous]);
  const currentUsd =
    mode === "usd" && latest ? tomanToUsd(Number(latest.new_sale_price), usdRate) : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>جزئیات محصول</SheetTitle>
          <SheetDescription>
            اطلاعات کامل و تاریخچه قیمت فروش برای نوع «{salePriceTypeTitle}»
          </SheetDescription>
        </SheetHeader>

        {productQuery.isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !product ? (
          <div className="py-10 text-center text-sm text-muted-foreground">محصولی یافت نشد.</div>
        ) : (
          <div className="mt-4 space-y-4">
            {/* مشخصات */}
            <Card>
              <CardContent className="space-y-2 p-4">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-primary" />
                  <h3 className="text-base font-bold">{product.name}</h3>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  {product.brand && (
                    <div className="flex items-center gap-1">
                      <Tag className="h-3 w-3" /> برند:{" "}
                      <span className="text-foreground">{(product.brand as any).name}</span>
                    </div>
                  )}
                  {product.category && (
                    <div className="flex items-center gap-1">
                      <Layers className="h-3 w-3" /> دسته:{" "}
                      <span className="text-foreground">{(product.category as any).name}</span>
                    </div>
                  )}
                  {product.sku && (
                    <div className="flex items-center gap-1">
                      <Hash className="h-3 w-3" /> SKU:{" "}
                      <span className="text-foreground">{product.sku}</span>
                    </div>
                  )}
                  <div>
                    وضعیت موجودی: <StockBadge status={product.stock_status} />
                  </div>
                </div>
                {(product.color || product.capacity || product.model) && (
                  <div className="flex flex-wrap gap-2 pt-1 text-xs">
                    {product.color && <Badge variant="outline">رنگ: {product.color}</Badge>}
                    {product.capacity && <Badge variant="outline">ظرفیت: {product.capacity}</Badge>}
                    {product.model && <Badge variant="outline">مدل: {product.model}</Badge>}
                  </div>
                )}
                {product.description && (
                  <p className="pt-2 text-xs leading-relaxed text-muted-foreground">
                    {product.description}
                  </p>
                )}
                {product.technical_notes && (
                  <div className="rounded-md bg-muted/40 p-2 text-xs leading-relaxed">
                    <div className="mb-1 flex items-center gap-1 font-medium">
                      <Info className="h-3 w-3" /> مشخصات فنی
                    </div>
                    <p className="text-muted-foreground whitespace-pre-wrap">
                      {product.technical_notes}
                    </p>
                  </div>
                )}
                <div className="pt-2">
                  <CreatePriceAlertButton
                    productId={product.id}
                    productName={product.name}
                    salePriceTypeId={salePriceTypeId}
                    variant="outline"
                    label="ایجاد هشدار قیمت"
                  />
                </div>
              </CardContent>
            </Card>

            {/* قیمت فعلی و قبلی */}
            <Card>
              <CardContent className="grid grid-cols-2 gap-4 p-4">
                <div>
                  <div className="text-xs text-muted-foreground">قیمت فعلی</div>
                  <div className="mt-1 text-lg font-bold text-foreground">
                    {latest ? formatNumber(Number(latest.new_sale_price)) : "—"}
                    <span className="mr-1 text-xs text-muted-foreground">تومان</span>
                  </div>
                  {currentUsd !== null && (
                    <div className="text-xs text-muted-foreground" dir="ltr">
                      ≈ ${formatNumber(currentUsd)}
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">قیمت قبلی</div>
                  <div className="mt-1 text-base text-muted-foreground">
                    {previous
                      ? formatNumber(Number(previous.new_sale_price))
                      : latest?.old_sale_price
                        ? formatNumber(Number(latest.old_sale_price))
                        : "—"}
                    <span className="mr-1 text-xs">تومان</span>
                  </div>
                  {summary && (
                    <div className="mt-1">
                      <PriceChangeBadge info={summary} />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* نمودار قیمت */}
            <Card>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold">نمودار قیمت فروش</h4>
                  <div className="inline-flex rounded-md border border-border p-0.5">
                    <Button
                      type="button"
                      size="sm"
                      variant={mode === "toman" ? "default" : "ghost"}
                      className="h-7 px-2 text-xs"
                      onClick={() => setMode("toman")}
                    >
                      تومان
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={mode === "usd" ? "default" : "ghost"}
                      className="h-7 px-2 text-xs"
                      onClick={() => setMode("usd")}
                    >
                      دلار
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {(["7d", "30d", "90d", "all"] as PriceRangeKey[]).map((r) => (
                    <Button
                      key={r}
                      type="button"
                      size="sm"
                      variant={range === r ? "default" : "outline"}
                      className="h-7 px-2 text-xs"
                      onClick={() => setRange(r)}
                    >
                      {RANGE_LABEL[r]}
                    </Button>
                  ))}
                </div>
                {chartHistory.isLoading || (mode === "usd" && usdRateQuery.isLoading) ? (
                  <div className="flex h-[180px] items-center justify-center text-sm text-muted-foreground">
                    <Loader2 className="ml-2 h-4 w-4 animate-spin" /> در حال بارگذاری نمودار...
                  </div>
                ) : usdMissing ? (
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
                    نرخ دلار برای محاسبه قیمت دلاری موجود نیست.
                  </div>
                ) : chartData.length === 0 ? (
                  <div className="flex h-[160px] items-center justify-center rounded-md border border-dashed border-border bg-muted/20 text-xs text-muted-foreground">
                    تاریخچه قیمتی برای این محصول وجود ندارد.
                  </div>
                ) : (
                  <Suspense
                    fallback={
                      <div className="flex h-[200px] items-center justify-center text-xs text-muted-foreground">
                        <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                      </div>
                    }
                  >
                    <ProductPriceChart
                      data={chartData}
                      mode={mode}
                      usdRate={usdRate}
                      height={220}
                    />
                  </Suspense>
                )}
                {mode === "usd" && usdRate && (
                  <div className="text-[11px] text-muted-foreground">
                    آخرین نرخ دلار:{" "}
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {formatNumber(usdRate)} ت/$
                    </Badge>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* تاریخچه */}
            <Card>
              <CardContent className="p-4">
                <h4 className="mb-2 text-sm font-semibold">
                  تاریخچه قیمت ({HISTORY_LIMIT} رکورد آخر)
                </h4>
                {historyQuery.isLoading ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                ) : history.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    تاریخچه قیمتی برای این محصول وجود ندارد.
                  </p>
                ) : (
                  <ul className="divide-y divide-border text-sm">
                    {history.map((h) => {
                      const change = h.change_percent !== null ? Number(h.change_percent) : null;
                      return (
                        <li key={h.id} className="flex items-center justify-between py-2">
                          <div>
                            <div className="font-medium">
                              {formatNumber(Number(h.new_sale_price))} تومان
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              {formatDateTimeFa(h.created_at)}
                            </div>
                          </div>
                          {change !== null && (
                            <Badge
                              variant={
                                change > 0 ? "default" : change < 0 ? "destructive" : "secondary"
                              }
                            >
                              {Math.abs(change) > 999
                                ? `${change > 0 ? "+" : "-"}۹۹۹٪+`
                                : `${change > 0 ? "+" : ""}${formatNumber(change)}٪`}
                            </Badge>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* پیشنهاد هوشمند محصولات */}
            <ProductRecommendationsCard productId={product.id} />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function StockBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    available: { label: "موجود", cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
    limited: { label: "محدود", cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
    unavailable: { label: "ناموجود", cls: "bg-rose-500/10 text-rose-700 dark:text-rose-400" },
    unknown: { label: "نامشخص", cls: "bg-muted text-muted-foreground" },
  };
  const v = map[status] ?? map.unknown;
  return <span className={`rounded px-1.5 py-0.5 text-[10px] ${v.cls}`}>{v.label}</span>;
}
