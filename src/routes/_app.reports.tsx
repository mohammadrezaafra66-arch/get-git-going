import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { requirePermission } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { MarketingActiveChannelsCard } from "@/components/reports/MarketingActiveChannelsCard";
import { MarketingTrendingCard } from "@/components/reports/MarketingTrendingCard";
import { MarketingTopCheckedTodayCard } from "@/components/reports/MarketingTopCheckedTodayCard";
import { MarketingEmergingProductsCard } from "@/components/reports/MarketingEmergingProductsCard";
import { MarketingPromotionSuggestionsUsedCard } from "@/components/reports/MarketingPromotionSuggestionsUsedCard";
import type { RangeDays } from "@/lib/management/market-intelligence";

const RANGE_OPTIONS: { value: RangeDays; label: string }[] = [
  { value: 7, label: "۷ روز" },
  { value: 30, label: "۳۰ روز" },
  { value: 90, label: "۹۰ روز" },
];

function ReportsPage() {
  const [range, setRange] = useState<RangeDays>(30);

  return (
    <div className="space-y-6">
      <PageHeader title="گزارش‌ها" description="گزارش‌های فروش، مالی و عملیاتی" />

      <Tabs defaultValue="marketing" dir="rtl" className="space-y-4">
        <TabsList>
          <TabsTrigger value="marketing">بازاریابی</TabsTrigger>
        </TabsList>

        <TabsContent value="marketing" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">بازه زمانی</span>
            <Select value={String(range)} onValueChange={(v) => setRange(Number(v) as RangeDays)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RANGE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={String(o.value)}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            <MarketingTrendingCard range={range} />
            <MarketingTopCheckedTodayCard />
            <MarketingEmergingProductsCard range={range} />
            <MarketingPromotionSuggestionsUsedCard range={range} />
            <MarketingActiveChannelsCard />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export const Route = createFileRoute("/_app/reports")({
  beforeLoad: async () => {
    await requirePermission("reports", "view");
  },
  component: ReportsPage,
});
