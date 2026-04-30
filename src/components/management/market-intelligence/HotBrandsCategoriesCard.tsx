import { Tags, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MICardShell } from "./CardShell";
import {
  fetchHotBrands, fetchHotCategories, type RangeDays,
} from "@/lib/management/market-intelligence";
import { formatNumber } from "@/lib/i18n/formatters";

function GrowthLabel({ value }: { value: number }) {
  const cls = value > 0 ? "text-emerald-600" : value < 0 ? "text-red-600" : "text-muted-foreground";
  return (
    <span className={`tabular-nums text-[11px] font-semibold ${cls}`}>
      {value > 0 ? "+" : ""}{formatNumber(value)}٪
    </span>
  );
}

export function HotBrandsCategoriesCard({ days }: { days: RangeDays }) {
  const brands = useQuery({
    queryKey: ["mi-hot-brands", days],
    queryFn: () => fetchHotBrands(days, 10),
    staleTime: 60_000,
  });
  const cats = useQuery({
    queryKey: ["mi-hot-categories", days],
    queryFn: () => fetchHotCategories(days, 10),
    staleTime: 60_000,
  });

  return (
    <MICardShell
      title="برندها و دسته‌های داغ"
      description={`بر اساس مجموع تعاملات در ${formatNumber(days)} روز اخیر`}
      rule="درصد رشد = (تعاملات بازه فعلی − بازه قبل) ÷ بازه قبل"
      icon={<Tags className="h-4 w-4 text-pink-600" />}
    >
      <Tabs defaultValue="brands" dir="rtl">
        <TabsList className="mb-2 grid w-full grid-cols-2">
          <TabsTrigger value="brands">برندها</TabsTrigger>
          <TabsTrigger value="categories">دسته‌ها</TabsTrigger>
        </TabsList>
        <TabsContent value="brands">
          {brands.isLoading ? (
            <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
              <Loader2 className="ml-2 h-4 w-4 animate-spin" /> در حال بارگذاری...
            </div>
          ) : brands.isError ? (
            <p className="py-4 text-center text-sm text-destructive">خطا در بارگذاری</p>
          ) : !brands.data || brands.data.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              هنوز داده کافی برای تحلیل رفتار بازار وجود ندارد.
            </p>
          ) : (
            <ul className="space-y-1">
              {brands.data.map((b) => (
                <li key={b.brand_id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                  <div className="min-w-0 flex-1 truncate font-medium">{b.brand_name}</div>
                  <div className="flex shrink-0 items-center gap-3 text-xs">
                    <span className="text-muted-foreground tabular-nums">
                      {formatNumber(b.unique_product_count)} محصول
                    </span>
                    <span className="font-bold tabular-nums">{formatNumber(b.interaction_count)}</span>
                    <GrowthLabel value={b.growth_percent} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
        <TabsContent value="categories">
          {cats.isLoading ? (
            <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
              <Loader2 className="ml-2 h-4 w-4 animate-spin" /> در حال بارگذاری...
            </div>
          ) : cats.isError ? (
            <p className="py-4 text-center text-sm text-destructive">خطا در بارگذاری</p>
          ) : !cats.data || cats.data.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              هنوز داده کافی برای تحلیل رفتار بازار وجود ندارد.
            </p>
          ) : (
            <ul className="space-y-1">
              {cats.data.map((c) => (
                <li key={c.category_id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                  <div className="min-w-0 flex-1 truncate font-medium">{c.category_name}</div>
                  <div className="flex shrink-0 items-center gap-3 text-xs">
                    <span className="text-muted-foreground tabular-nums">
                      {formatNumber(c.unique_product_count)} محصول
                    </span>
                    <span className="font-bold tabular-nums">{formatNumber(c.interaction_count)}</span>
                    <GrowthLabel value={c.growth_percent} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </MICardShell>
  );
}