import { TrendingUp, TrendingDown, Minus, Loader2, Zap } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { MICardShell } from "./CardShell";
import { fetchDemandGrowth, type RangeDays } from "@/lib/management/market-intelligence";
import { formatNumber } from "@/lib/i18n/formatters";

const STATUS: Record<string, { label: string; color: string; Icon: typeof TrendingUp }> = {
  strong_growth: { label: "رشد شدید", color: "text-emerald-600", Icon: Zap },
  moderate_growth: { label: "رشد متوسط", color: "text-emerald-600", Icon: TrendingUp },
  flat: { label: "ثابت", color: "text-muted-foreground", Icon: Minus },
  declining: { label: "کاهش تقاضا", color: "text-red-600", Icon: TrendingDown },
  no_data: { label: "بدون داده", color: "text-muted-foreground", Icon: Minus },
};

export function DemandGrowthCard({ days }: { days: RangeDays }) {
  const q = useQuery({
    queryKey: ["mi-demand-growth", days],
    queryFn: () => fetchDemandGrowth(days),
    staleTime: 60_000,
  });

  const d = q.data;
  const status = STATUS[d?.status ?? "no_data"];
  const Icon = status.Icon;
  const compareLabel =
    days === 1 ? "امروز در برابر دیروز" : `${formatNumber(days)} روز اخیر در برابر بازه قبلی`;

  return (
    <MICardShell
      title="رشد تقاضای بازار"
      description={compareLabel}
      rule="امتیاز تقاضا = بررسی قیمت×۴ + تابلو×۳ + نمودار/جزئیات×۲ + جستجو×۱"
      icon={<TrendingUp className="h-4 w-4 text-emerald-600" />}
    >
      {q.isLoading ? (
        <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
          <Loader2 className="ml-2 h-4 w-4 animate-spin" /> در حال بارگذاری...
        </div>
      ) : q.isError ? (
        <p className="py-6 text-center text-sm text-destructive">خطا در بارگذاری</p>
      ) : !d || d.status === "no_data" ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          هنوز داده کافی برای تحلیل رفتار بازار وجود ندارد.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="flex items-end justify-between gap-2 rounded-lg border bg-muted/20 p-4">
            <div>
              <div className="text-xs text-muted-foreground">تغییر امتیاز تقاضا</div>
              <div
                className={`flex items-center gap-2 text-3xl font-bold tabular-nums ${status.color}`}
              >
                <Icon className="h-6 w-6" />
                <span>
                  {d.growth_percent > 0 ? "+" : ""}
                  {formatNumber(d.growth_percent)}٪
                </span>
              </div>
            </div>
            <div className={`text-sm font-semibold ${status.color}`}>{status.label}</div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-center text-xs">
            <div className="rounded-md border p-2">
              <div className="text-lg font-bold tabular-nums">{formatNumber(d.current_score)}</div>
              <div className="text-[10px] text-muted-foreground">
                امتیاز فعلی · {formatNumber(d.current_event_count)} رویداد
              </div>
            </div>
            <div className="rounded-md border p-2">
              <div className="text-lg font-bold tabular-nums text-muted-foreground">
                {formatNumber(d.previous_score)}
              </div>
              <div className="text-[10px] text-muted-foreground">
                امتیاز قبلی · {formatNumber(d.previous_event_count)} رویداد
              </div>
            </div>
          </div>
        </div>
      )}
    </MICardShell>
  );
}
