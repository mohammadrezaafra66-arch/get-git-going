import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, BarChart3, TrendingUp, TrendingDown } from "lucide-react";
import { requireAnyRole } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchSalePriceTypes } from "@/lib/pricing/queries";
import { supabase } from "@/integrations/supabase/client";
import { TrendingProductsCard } from "@/components/management/market-intelligence/TrendingProductsCard";
import { PriceMoversCard } from "@/components/management/market-intelligence/PriceMoversCard";
import { AfraMarketIndexCard } from "@/components/management/market-intelligence/AfraMarketIndexCard";
import { TopCheckedTodayCard } from "@/components/management/market-intelligence/TopCheckedTodayCard";
import { DemandGrowthCard } from "@/components/management/market-intelligence/DemandGrowthCard";
import { EmergingProductsCard } from "@/components/management/market-intelligence/EmergingProductsCard";
import { HotBrandsCategoriesCard } from "@/components/management/market-intelligence/HotBrandsCategoriesCard";
import { SellerFavoritesCard } from "@/components/management/market-intelligence/SellerFavoritesCard";
import { SellerAllInteractionsCard } from "@/components/management/market-intelligence/SellerAllInteractionsCard";
import { WhatsappTopProductsCard } from "@/components/management/market-intelligence/WhatsappTopProductsCard";
import type { RangeDays } from "@/lib/management/market-intelligence";
import { BRANDING, getPageTitle } from "@/config/branding";

export const Route = createFileRoute("/_app/pricing/market-intelligence")({
  beforeLoad: async () => {
    await requireAnyRole(["admin", "manager", "accountant"]);
  },
  head: () => ({ meta: [{ title: getPageTitle("هوش بازار") }] }),
  component: MarketIntelligencePage,
});

const RANGES: Array<{ v: RangeDays; l: string }> = [
  { v: 1, l: "امروز" },
  { v: 7, l: "۷ روز" },
  { v: 30, l: "۳۰ روز" },
  { v: 90, l: "۹۰ روز" },
];

function MarketIntelligencePage() {
  const qc = useQueryClient();
  const [days, setDays] = useState<RangeDays>(7);
  const [salePriceTypeId, setSalePriceTypeId] = useState<string>("__all");

  const { data: salePriceTypes = [] } = useQuery({
    queryKey: ["sale-price-types-active-mi"],
    queryFn: () => fetchSalePriceTypes(true),
    staleTime: 5 * 60_000,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["mi-"], type: "all" });

  return (
    <div className="space-y-5">
      <PageHeader
        title={`داشبورد هوشمند بازار ${BRANDING.platformName}`}
        description="تحلیل محصولات داغ، روند قیمت، فرصت‌های سود و ریسک‌های بازار"
        actions={
          <Button variant="outline" size="sm" onClick={refresh}>
            <RefreshCw className="ml-2 h-4 w-4" /> بروزرسانی
          </Button>
        }
      />

      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">بازه زمانی:</span>
              <div className="flex gap-1">
                {RANGES.map((r) => (
                  <Button
                    key={r.v}
                    type="button"
                    variant={days === r.v ? "default" : "outline"}
                    size="sm"
                    onClick={() => setDays(r.v)}
                  >
                    {r.l}
                  </Button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">نوع قیمت فروش:</span>
              <Select value={salePriceTypeId} onValueChange={setSalePriceTypeId}>
                <SelectTrigger className="h-8 w-44">
                  <SelectValue placeholder="نوع قیمت" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">همه انواع قیمت</SelectItem>
                  {salePriceTypes.map((t: { id: string; title: string }) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Top section: market index */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AfraMarketIndexCard days={days} />
        <DailyMarketSummaryCard />
      </div>

      {/* Movers */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PriceMoversCard
          days={days}
          direction="up"
          salePriceTypeId={salePriceTypeId === "__all" ? null : salePriceTypeId}
        />
        <PriceMoversCard
          days={days}
          direction="down"
          salePriceTypeId={salePriceTypeId === "__all" ? null : salePriceTypeId}
        />
      </div>

      {/* Behavior analysis section */}
      <div className="space-y-1 pt-2">
        <h2 className="text-base font-bold">تحلیل رفتار همکاران بازار</h2>
        <p className="text-xs text-muted-foreground">
          سیگنال‌های رفتاری بر اساس تعاملات کاربران با محصولات (به‌صورت تجمیعی، بدون اطلاعات شخصی)
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TopCheckedTodayCard />
        <DemandGrowthCard days={days} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TrendingProductsCard days={days} />
        <EmergingProductsCard days={days} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <HotBrandsCategoriesCard days={days} />
        <SellerFavoritesCard days={days} />
      </div>

      {/* C-11 (unwired wave 1) — sits next to SellerFavoritesCard on purpose: the two read
          different functions over the same events, and the card body says how they differ. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SellerAllInteractionsCard days={days} />
      </div>

      {/* External WhatsApp-platform customer-demand data (read-only), alongside
          the internal usage-based cards above — clearly labeled as a distinct source. */}
      <div className="grid grid-cols-1 gap-4">
        <WhatsappTopProductsCard />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <HighMarginOpportunitiesCard />
        <HighRiskProductsCard />
      </div>

      <p className="pt-2 text-center text-[11px] text-muted-foreground">
        تمام شاخص‌ها و پیشنهادهای این داشبورد بر پایه قانون‌های ساده داده‌محور هستند و پیش‌بینی قطعی
        محسوب نمی‌شوند.
      </p>
    </div>
  );
}

function DailyMarketSummaryCard() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const { data, isLoading } = useQuery({
    queryKey: ["mi-daily-summary"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data: ticks, error } = await supabase
        .from("market_rate_ticks")
        .select("id, indicator_id, value, change_percent, status, observed_at")
        .gte("observed_at", today.toISOString())
        .eq("status", "accepted")
        .order("observed_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      const rows = ticks ?? [];
      const uniqueIndicators = new Set(rows.map((r) => r.indicator_id)).size;
      const withChange = rows.filter((r) => r.change_percent !== null);
      const avgChange =
        withChange.length > 0
          ? withChange.reduce((s, r) => s + Math.abs(Number(r.change_percent)), 0) /
            withChange.length
          : 0;
      const risers = rows.filter((r) => Number(r.change_percent ?? 0) > 0).length;
      const fallers = rows.filter((r) => Number(r.change_percent ?? 0) < 0).length;
      const lastUpdate = rows[0]?.observed_at ?? null;
      return { count: rows.length, uniqueIndicators, avgChange, risers, fallers, lastUpdate };
    },
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-bold">
          <BarChart3 className="h-4 w-4 text-primary" />
          گزارش روزانه بازار
        </CardTitle>
        <p className="text-xs text-muted-foreground">ثبت‌های امروز در سیستم</p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">در حال بارگذاری…</div>
        ) : !data || data.count === 0 ? (
          <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
            هنوز نرخی برای امروز ثبت نشده است.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-muted/40 p-3 text-center">
              <div className="text-2xl font-bold text-primary">{data.count}</div>
              <div className="text-xs text-muted-foreground">ثبت امروز</div>
            </div>
            <div className="rounded-lg bg-muted/40 p-3 text-center">
              <div className="text-2xl font-bold">{data.uniqueIndicators}</div>
              <div className="text-xs text-muted-foreground">شاخص فعال</div>
            </div>
            <div className="rounded-lg bg-emerald-50 p-3 text-center dark:bg-emerald-950/20">
              <div className="text-xl font-bold text-emerald-600">▲ {data.risers}</div>
              <div className="text-xs text-muted-foreground">افزایش‌یافته</div>
            </div>
            <div className="rounded-lg bg-rose-50 p-3 text-center dark:bg-rose-950/20">
              <div className="text-xl font-bold text-rose-600">▼ {data.fallers}</div>
              <div className="text-xs text-muted-foreground">کاهش‌یافته</div>
            </div>
            {data.lastUpdate && (
              <div className="col-span-2 text-center text-xs text-muted-foreground">
                آخرین بروزرسانی: {new Date(data.lastUpdate).toLocaleTimeString("fa-IR")}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function HighMarginOpportunitiesCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["mi-high-margin-opportunities"],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      // Join product_computed_prices_public with products to find items with latest sale price significantly above purchase price
      const { data, error } = await supabase
        .from("product_computed_prices_public")
        // ستون `sale_price` وجود ندارد. ستون‌های واقعی این view:
        //   final_sale_price  — قیمت محاسبه‌شده، گرد نشده
        //   rounded_sale_price — همان قیمت پس از گرد کردن
        // `rounded_sale_price` انتخاب شد چون کارت با «قیمت فروش» به کاربر نشان
        // داده می‌شود و عددی که مشتری واقعاً می‌بیند همان گردشده است.
        .select("product_id, rounded_sale_price, products!inner(id, name, sku)")
        .order("rounded_sale_price", { ascending: false })
        .limit(200);
      if (error) throw error;
      // Return top 5 by sale price as proxy (real margin calc needs purchase price)
      return (data ?? []).slice(0, 5) as unknown as Array<{
        product_id: string;
        rounded_sale_price: number;
        products: { id: string; name: string; sku: string | null };
      }>;
    },
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-bold">
          <TrendingUp className="h-4 w-4 text-emerald-600" />
          فرصت‌های سود بالا
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          محصولاتی که قیمت فروش آن‌ها در محدوده بالاتر قرار دارد
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">در حال بارگذاری…</div>
        ) : !data || data.length === 0 ? (
          <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
            داده‌ای برای نمایش وجود ندارد.
          </div>
        ) : (
          <ul className="space-y-2">
            {data.map((row) => (
              <li key={row.product_id} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate font-medium">{row.products.name}</span>
                <span className="shrink-0 font-bold text-emerald-700">
                  {Number(row.rounded_sale_price).toLocaleString("fa-IR")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function HighRiskProductsCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["mi-high-risk-products"],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      // Products where purchase price was last updated more than 30 days ago
      const threshold = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("purchase_prices")
        // ستون `effective_from` وجود ندارد؛ نامش `effective_at` است.
        .select("product_id, effective_at, products!inner(id, name, sku)")
        .lt("effective_at", threshold)
        .order("effective_at", { ascending: true })
        .limit(5);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        product_id: string;
        effective_at: string;
        products: { id: string; name: string; sku: string | null };
      }>;
    },
  });

  const daysSince = (iso: string) =>
    Math.floor((Date.now() - new Date(iso).getTime()) / (86400 * 1000));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-bold">
          <TrendingDown className="h-4 w-4 text-rose-600" />
          کالاهای پرریسک
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          محصولاتی با قیمت خرید قدیمی‌تر از ۳۰ روز (نیاز به به‌روزرسانی)
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">در حال بارگذاری…</div>
        ) : !data || data.length === 0 ? (
          <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
            همه قیمت‌های خرید به‌روز هستند.
          </div>
        ) : (
          <ul className="space-y-2">
            {data.map((row) => (
              <li key={row.product_id} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate font-medium">{row.products.name}</span>
                <span className="shrink-0 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700 dark:bg-rose-900/30">
                  {daysSince(row.effective_at)} روز پیش
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
