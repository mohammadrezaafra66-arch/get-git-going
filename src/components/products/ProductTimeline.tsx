import { useMemo, useState } from "react";
import {
  ShoppingCart,
  Package,
  FileText,
  FileCheck,
  History as HistoryIcon,
} from "lucide-react";
import {
  useProductTimeline,
  useProductStats,
  type ProductTimelineEvent,
  type ProductTimelineEventType,
} from "@/hooks/products/useProductTimeline";
import { formatJalaliDateTime } from "@/lib/messenger/format";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  productId: string;
  productName: string;
}

const numFa = new Intl.NumberFormat("fa-IR");
function formatAmount(n: number | null | undefined): string | null {
  if (n == null) return null;
  return `${numFa.format(Math.round(Number(n)))} تومان`;
}

const TYPE_META: Record<
  ProductTimelineEventType,
  { label: string; color: string; Icon: typeof ShoppingCart }
> = {
  inquiry: { label: "استعلام", color: "#0F766E", Icon: ShoppingCart },
  purchase_request: { label: "خرید", color: "#6D28D9", Icon: Package },
  document: { label: "سند", color: "#B54708", Icon: FileText },
  delivery_receipt: { label: "رسید", color: "#0B6E4F", Icon: FileCheck },
};

type FilterValue = "all" | ProductTimelineEventType;

export function ProductTimeline({ productId }: Props) {
  const [filter, setFilter] = useState<FilterValue>("all");
  const statsQ = useProductStats(productId);
  const timelineQ = useProductTimeline(productId);

  const events = useMemo<ProductTimelineEvent[]>(() => {
    const rows = timelineQ.data ?? [];
    if (filter === "all") return rows;
    return rows.filter((e) => e.event_type === filter);
  }, [timelineQ.data, filter]);

  return (
    <div className="space-y-4" dir="rtl">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <StatCard
          label="استعلام این ماه"
          value={statsQ.data ? numFa.format(statsQ.data.inquiry_count_month) : null}
          loading={statsQ.isLoading}
        />
        <StatCard
          label="کل استعلام‌ها"
          value={statsQ.data ? numFa.format(statsQ.data.inquiry_count_total) : null}
          loading={statsQ.isLoading}
        />
        <StatCard
          label="میانگین قیمت"
          value={statsQ.data ? (formatAmount(statsQ.data.avg_price) ?? "—") : null}
          loading={statsQ.isLoading}
        />
        <StatCard
          label="آخرین قیمت"
          value={statsQ.data ? (formatAmount(statsQ.data.last_price) ?? "—") : null}
          loading={statsQ.isLoading}
        />
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">نوع رویداد:</span>
        <Select value={filter} onValueChange={(v) => setFilter(v as FilterValue)}>
          <SelectTrigger className="h-8 w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">همه</SelectItem>
            <SelectItem value="inquiry">استعلام</SelectItem>
            <SelectItem value="purchase_request">خرید</SelectItem>
            <SelectItem value="document">سند</SelectItem>
            <SelectItem value="delivery_receipt">رسید</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Timeline */}
      {timelineQ.isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
          <HistoryIcon className="h-6 w-6 opacity-60" />
          هیچ رویدادی برای این محصول ثبت نشده.
        </div>
      ) : (
        <ol className="relative space-y-3 border-r border-border pr-5">
          {events.map((e, idx) => {
            const meta = TYPE_META[e.event_type] ?? TYPE_META.inquiry;
            const Icon = meta.Icon;
            const amount = formatAmount(e.amount);
            return (
              <li key={`${e.reference_type}-${e.reference_id}-${idx}`} className="relative">
                <span
                  className="absolute -right-[27px] top-1.5 flex h-4 w-4 items-center justify-center rounded-full ring-2 ring-background"
                  style={{ backgroundColor: meta.color }}
                  aria-hidden
                />
                <Card>
                  <CardContent className="space-y-1 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4" style={{ color: meta.color }} />
                        <span className="text-sm font-medium text-foreground">
                          {e.description}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatJalaliDateTime(e.event_time)}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>{e.actor_name ?? "—"}</span>
                      {amount && (
                        <span className="font-medium text-foreground">قیمت: {amount}</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  loading,
}: {
  label: string;
  value: string | null;
  loading: boolean;
}) {
  return (
    <Card>
      <CardContent className="space-y-1 p-3">
        <div className="text-[11px] text-muted-foreground">{label}</div>
        {loading ? (
          <Skeleton className="h-5 w-16" />
        ) : (
          <div className="text-sm font-semibold text-foreground">{value ?? "—"}</div>
        )}
      </CardContent>
    </Card>
  );
}
