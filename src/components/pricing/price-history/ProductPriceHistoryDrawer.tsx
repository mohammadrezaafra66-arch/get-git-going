import { lazy, Suspense, useMemo, useRef, useState } from "react";
import { Loader2, AlertCircle, LineChart as LineChartIcon, Download, Share2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatNumber, formatDateTimeFa } from "@/lib/i18n/formatters";
import { PriceChangeBadge } from "./PriceChangeBadge";
import {
  RANGE_LABEL,
  computeChangePercent,
  computeDirection,
  tomanToUsd,
  type PriceRangeKey,
} from "@/lib/pricing/price-history";
import { useLatestUsdRate, useProductPriceHistory } from "@/hooks/pricing/useProductPriceHistory";
import { useProductPriceHistoryRealtime } from "@/hooks/pricing/useProductPriceHistoryRealtime";
import { useChartExport } from "@/hooks/pricing/useChartExport";

const ProductPriceChart = lazy(() => import("./ProductPriceChart"));

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  productId: string | null;
  productName: string | null;
  salePriceTypeId: string | null;
  salePriceTypeTitle: string | null;
}

const RANGES: PriceRangeKey[] = ["7d", "30d", "90d", "all"];

export function ProductPriceHistoryDrawer({
  open,
  onOpenChange,
  productId,
  productName,
  salePriceTypeId,
  salePriceTypeTitle,
}: Props) {
  const [range, setRange] = useState<PriceRangeKey>("30d");
  const [mode, setMode] = useState<"toman" | "usd">("toman");

  const chartRef = useRef<HTMLDivElement>(null);
  const { isCapturing, downloadPng, copyToClipboard } = useChartExport({
    filename: productName ? `chart-${productName}` : "chart-price",
    scale: 2,
    backgroundColor: "#ffffff",
  });

  const historyQuery = useProductPriceHistory({
    productId,
    salePriceTypeId,
    range,
    enabled: open,
  });
  const usdRateQuery = useLatestUsdRate(open && mode === "usd");

  const { isLive } = useProductPriceHistoryRealtime({
    productId,
    salePriceTypeId,
    enabled: open,
  });

  const data = historyQuery.data ?? [];
  const latest = data[data.length - 1] ?? null;
  const previous = data[data.length - 2] ?? null;

  const summary = useMemo(() => {
    if (!latest) return null;
    const current = latest.new_sale_price;
    const prev = previous ? previous.new_sale_price : (latest.old_sale_price ?? null);
    const amt = prev !== null ? current - prev : null;
    const pct = computeChangePercent(current, prev);
    return {
      current,
      previous: prev,
      change_amount: amt,
      change_percent: pct,
      direction: computeDirection(amt),
      at: latest.created_at,
    };
  }, [latest, previous]);

  const usdRate = usdRateQuery.data?.rate ?? null;
  const usdMissing = mode === "usd" && !usdRateQuery.isLoading && !usdRate;
  const currentUsd =
    mode === "usd" && summary?.current ? tomanToUsd(summary.current, usdRate) : null;

  const isLoading = historyQuery.isLoading || (mode === "usd" && usdRateQuery.isLoading);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader className="text-right">
          <SheetTitle className="flex items-center gap-2 text-base">
            <LineChartIcon className="h-4 w-4 text-primary" />
            نمودار قیمت فروش {productName ?? ""}
            {isLive && (
              <span
                className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400"
                title="به‌روزرسانی زنده فعال است"
              >
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                زنده
              </span>
            )}
          </SheetTitle>
          <SheetDescription>
            بر اساس نوع قیمت:{" "}
            <span className="font-medium text-foreground">{salePriceTypeTitle ?? "—"}</span>
          </SheetDescription>
        </SheetHeader>

        {!productId || !salePriceTypeId ? (
          <div className="mt-6 rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
            ابتدا محصول و نوع قیمت فروش را انتخاب کنید.
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {/* خلاصه قیمت */}
            <div className="rounded-md border border-border bg-card p-3">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <div className="text-xs text-muted-foreground">قیمت فعلی</div>
                  <div className="text-2xl font-bold text-primary">
                    {summary?.current != null ? formatNumber(summary.current) : "—"}
                    <span className="mr-1 text-xs font-normal text-muted-foreground">تومان</span>
                  </div>
                  {summary?.previous != null && (
                    <div className="text-xs text-muted-foreground line-through">
                      {formatNumber(summary.previous)} ت
                    </div>
                  )}
                  {mode === "usd" && currentUsd !== null && (
                    <div className="mt-1 text-sm text-muted-foreground" dir="ltr">
                      ≈ ${formatNumber(currentUsd)}
                    </div>
                  )}
                </div>
                {summary && (
                  <div className="flex flex-col items-end gap-1">
                    <PriceChangeBadge
                      info={{
                        change_amount: summary.change_amount,
                        change_percent: summary.change_percent,
                        direction: summary.direction,
                      }}
                      size="md"
                    />
                    <span className="text-[11px] text-muted-foreground">
                      {formatDateTimeFa(summary.at)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* کنترل‌ها */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex rounded-md border border-border p-0.5">
                <Button
                  type="button"
                  size="sm"
                  variant={mode === "toman" ? "default" : "ghost"}
                  className="h-7 px-3 text-xs"
                  onClick={() => setMode("toman")}
                >
                  تومان
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={mode === "usd" ? "default" : "ghost"}
                  className="h-7 px-3 text-xs"
                  onClick={() => setMode("usd")}
                >
                  دلار
                </Button>
              </div>
              <div className="inline-flex flex-wrap gap-1">
                {RANGES.map((r) => (
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
            </div>

            {/* نمودار */}
            <div className="rounded-md border border-border p-3">
              {isLoading ? (
                <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" /> در حال بارگذاری نمودار...
                </div>
              ) : usdMissing ? (
                <div className="flex h-[180px] items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-400">
                  <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  نرخ دلار برای محاسبه قیمت دلاری موجود نیست.
                </div>
              ) : data.length === 0 ? (
                <div className="flex h-[180px] items-center justify-center rounded-md border border-dashed border-border bg-muted/20 text-sm text-muted-foreground">
                  تاریخچه قیمتی برای این محصول وجود ندارد.
                </div>
              ) : (
                <Suspense
                  fallback={
                    <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
                      <Loader2 className="ml-2 h-4 w-4 animate-spin" /> در حال بارگذاری نمودار...
                    </div>
                  }
                >
                  <ProductPriceChart ref={chartRef} data={data} mode={mode} usdRate={usdRate} />
                </Suspense>
              )}
              {mode === "usd" && usdRate && (
                <div className="mt-2 text-[11px] text-muted-foreground" dir="rtl">
                  محاسبه دلار بر اساس آخرین نرخ معتبر:{" "}
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {formatNumber(usdRate)} ت/$
                  </Badge>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isCapturing || data.length === 0}
                onClick={() => downloadPng(chartRef.current)}
                className="gap-1.5 text-xs"
              >
                {isCapturing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                دانلود PNG
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isCapturing || data.length === 0}
                onClick={() => copyToClipboard(chartRef.current)}
                className="gap-1.5 text-xs"
              >
                {isCapturing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Share2 className="h-3.5 w-3.5" />}
                کپی برای ارسال
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground text-left pt-0.5">
              پس از کپی، در واتساپ یا تلگرام Paste کنید (Ctrl+V)
            </p>

            {/* تاریخچه کوتاه */}
            {data.length > 0 && (
              <div className="rounded-md border border-border p-3">
                <div className="mb-2 text-xs font-semibold text-muted-foreground">
                  آخرین تغییرات ({formatNumber(Math.min(data.length, 8))} ردیف)
                </div>
                <ul className="divide-y divide-border text-sm">
                  {[...data]
                    .reverse()
                    .slice(0, 8)
                    .map((d) => {
                      const dir = computeDirection(d.change_amount);
                      return (
                        <li key={d.id} className="flex items-center justify-between py-1.5">
                          <div>
                            <div className="font-medium">{formatNumber(d.new_sale_price)} ت</div>
                            <div className="text-[11px] text-muted-foreground">
                              {formatDateTimeFa(d.created_at)}
                            </div>
                          </div>
                          <PriceChangeBadge
                            info={{
                              change_amount: d.change_amount,
                              change_percent: d.change_percent,
                              direction: dir,
                            }}
                          />
                        </li>
                      );
                    })}
                </ul>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
