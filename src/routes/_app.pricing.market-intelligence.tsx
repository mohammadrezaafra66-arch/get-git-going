import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, BarChart3 } from "lucide-react";
import { requireAnyRole } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchSalePriceTypes } from "@/lib/pricing/queries";
import { TrendingProductsCard } from "@/components/management/market-intelligence/TrendingProductsCard";
import { PriceMoversCard } from "@/components/management/market-intelligence/PriceMoversCard";
import { AfraMarketIndexCard } from "@/components/management/market-intelligence/AfraMarketIndexCard";
import { PlaceholderCard } from "@/components/management/market-intelligence/PlaceholderCard";
import { TopCheckedTodayCard } from "@/components/management/market-intelligence/TopCheckedTodayCard";
import { DemandGrowthCard } from "@/components/management/market-intelligence/DemandGrowthCard";
import { EmergingProductsCard } from "@/components/management/market-intelligence/EmergingProductsCard";
import { HotBrandsCategoriesCard } from "@/components/management/market-intelligence/HotBrandsCategoriesCard";
import { SellerFavoritesCard } from "@/components/management/market-intelligence/SellerFavoritesCard";
import type { RangeDays } from "@/lib/management/market-intelligence";

export const Route = createFileRoute("/_app/pricing/market-intelligence")({
  beforeLoad: async () => {
    await requireAnyRole(["admin", "manager", "accountant"]);
  },
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
        title="داشبورد هوشمند بازار افراکالا"
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
        <Card className="border-dashed">
          <CardContent className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <BarChart3 className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-semibold">گزارش روزانه بازار</p>
            <p className="text-xs text-muted-foreground">
              این بخش در فاز بعدی همین داشبورد فعال می‌شود.
            </p>
          </CardContent>
        </Card>
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PlaceholderCard
          title="فرصت‌های سود بالا"
          description="بر اساس margin و قیمت خرید (فقط نقش‌های مالی)"
        />
        <PlaceholderCard
          title="کالاهای پرریسک"
          description="نوسان قیمت بالا، موجودی محدود یا قیمت خرید قدیمی"
        />
      </div>

      <p className="pt-2 text-center text-[11px] text-muted-foreground">
        تمام شاخص‌ها و پیشنهادهای این داشبورد بر پایه قانون‌های ساده داده‌محور هستند و پیش‌بینی قطعی
        محسوب نمی‌شوند.
      </p>
    </div>
  );
}
