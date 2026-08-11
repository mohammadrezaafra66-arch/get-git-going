import { Activity, ArrowUp, ArrowDown, Minus, Waves, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { MICardShell } from "./CardShell";
import { fetchMarketIndex, type RangeDays } from "@/lib/management/market-intelligence";
import { formatNumber } from "@/lib/i18n/formatters";
import { BRANDING } from "@/config/branding";

const STATUS_LABEL: Record<string, { label: string; color: string; Icon: typeof ArrowUp }> = {
  rising: { label: "صعودی", color: "text-emerald-600", Icon: ArrowUp },
  falling: { label: "نزولی", color: "text-red-600", Icon: ArrowDown },
  flat: { label: "ثابت", color: "text-muted-foreground", Icon: Minus },
  volatile: { label: "نوسانی", color: "text-amber-600", Icon: Waves },
  no_data: { label: "بدون داده", color: "text-muted-foreground", Icon: Minus },
};

export function AfraMarketIndexCard({ days }: { days: RangeDays }) {
  const q = useQuery({
    queryKey: ["mi-index", days],
    queryFn: () => fetchMarketIndex(days),
    staleTime: 60_000,
  });

  const idx = q.data;
  const status = STATUS_LABEL[idx?.status ?? "no_data"];
  const Icon = status.Icon;
  const pct = idx?.index_change_percent;

  return (
    <MICardShell
      title={`شاخص بازار ${BRANDING.platformName}`}
      description={`میانگین وزنی تغییر قیمت محصولات فعال موجود در ${formatNumber(days)} روز اخیر`}
      rule={`شاخص ${BRANDING.platformName} شاخص داخلی است و نماینده کل بازار کشور نیست.`}
      icon={<Activity className="h-4 w-4 text-primary" />}
    >
      {q.isLoading ? (
        <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
          <Loader2 className="ml-2 h-4 w-4 animate-spin" /> در حال بارگذاری...
        </div>
      ) : q.isError ? (
        <p className="py-6 text-center text-sm text-destructive">خطا در بارگذاری</p>
      ) : !idx || idx.product_count === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          داده کافی برای محاسبه شاخص وجود ندارد.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="flex items-end justify-between gap-2 rounded-lg border bg-muted/20 p-4">
            <div>
              <div className="text-xs text-muted-foreground">تغییر شاخص</div>
              <div
                className={`flex items-center gap-2 text-3xl font-bold tabular-nums ${status.color}`}
              >
                <Icon className="h-6 w-6" />
                <span>
                  {pct !== null && pct !== undefined ? (
                    <>
                      {pct > 0 ? "+" : ""}
                      {formatNumber(pct)}٪
                    </>
                  ) : (
                    "—"
                  )}
                </span>
              </div>
            </div>
            <div className={`text-sm font-semibold ${status.color}`}>{status.label}</div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label="در حال رشد" value={idx.rising_count} color="text-emerald-600" />
            <Stat label="در حال افت" value={idx.falling_count} color="text-red-600" />
            <Stat label="ثابت" value={idx.flat_count} color="text-muted-foreground" />
          </div>
          <p className="text-center text-[11px] text-muted-foreground">
            بر اساس {formatNumber(idx.product_count)} محصول فعال موجود
          </p>
        </div>
      )}
    </MICardShell>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-md border p-2">
      <div className={`text-lg font-bold tabular-nums ${color}`}>{formatNumber(value)}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}
