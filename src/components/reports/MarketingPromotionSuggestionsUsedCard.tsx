import { Megaphone, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { formatDateFa, formatNumber } from "@/lib/i18n/formatters";
import type { RangeDays } from "@/lib/management/market-intelligence";

interface Props {
  range: RangeDays;
}

interface LogRow {
  id: number;
  created_at: string;
  diff: {
    product_id?: string;
    product_name?: string;
    channel_id?: string;
    channel_name?: string;
    score?: number | string;
  } | null;
}

const RECENT_LIMIT = 500;

export function MarketingPromotionSuggestionsUsedCard({ range }: Props) {
  const { roles } = useAuth();
  const isAdmin = roles.includes("admin");

  const rangeStartIso = new Date(Date.now() - range * 86_400_000).toISOString();

  const countQuery = useQuery({
    queryKey: ["reports", "marketing", "promotion-suggestions-used", "count", range] as const,
    enabled: isAdmin,
    staleTime: 60_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("audit_logs")
        .select("id", { count: "exact", head: true })
        .eq("action", "promotion_suggestion_used")
        .gte("created_at", rangeStartIso);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const recentQuery = useQuery({
    queryKey: ["reports", "marketing", "promotion-suggestions-used", "recent", range] as const,
    enabled: isAdmin,
    staleTime: 60_000,
    queryFn: async (): Promise<LogRow[]> => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("id, created_at, diff")
        .eq("action", "promotion_suggestion_used")
        .gte("created_at", rangeStartIso)
        .order("created_at", { ascending: false })
        .limit(RECENT_LIMIT);
      if (error) throw error;
      return (data ?? []) as LogRow[];
    },
  });

  const rows = recentQuery.data ?? [];

  const topChannels = (() => {
    const map = new Map<string, number>();
    for (const r of rows) {
      const name = r.diff?.channel_name?.trim() || "نامشخص";
      map.set(name, (map.get(name) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
  })();

  const latest = rows.slice(0, 10);
  const isLoading = countQuery.isLoading || recentQuery.isLoading;
  const isError = countQuery.isError || recentQuery.isError;

  return (
    <Card dir="rtl">
      <CardHeader className="space-y-1">
        <CardTitle className="flex items-center gap-2 text-base">
          <Megaphone className="h-4 w-4 text-primary" />
          پیشنهادهای تبلیغاتی استفاده‌شده
        </CardTitle>
        <CardDescription>
          مجموع پیشنهادهای علامت‌گذاری‌شده به‌عنوان استفاده‌شده در {formatNumber(range)} روز اخیر
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!isAdmin ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            این کارت فقط برای مدیران قابل مشاهده است.
          </p>
        ) : isLoading ? (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            <Loader2 className="ml-2 h-4 w-4 animate-spin" /> در حال بارگذاری...
          </div>
        ) : isError ? (
          <p className="py-6 text-center text-sm text-destructive">
            خطا در بارگذاری داده‌ها. لطفاً دوباره تلاش کنید.
          </p>
        ) : (countQuery.data ?? 0) === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            داده‌ای برای این بازه ثبت نشده است.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2">
              <span className="text-sm text-muted-foreground">مجموع استفاده‌شده</span>
              <Badge variant="default" className="text-sm">
                {formatNumber(countQuery.data ?? 0)}
              </Badge>
            </div>

            {topChannels.length > 0 ? (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">کانال‌های پراستفاده</p>
                <ul className="space-y-1">
                  {topChannels.map(([name, count], idx) => (
                    <li
                      key={name}
                      className="flex items-center justify-between rounded-sm bg-muted/20 px-2 py-1 text-sm"
                    >
                      <span className="flex items-center gap-2">
                        <Badge variant="outline" className="h-5 min-w-5 justify-center px-1.5">
                          {formatNumber(idx + 1)}
                        </Badge>
                        <span className="truncate">{name}</span>
                      </span>
                      <span className="text-muted-foreground">{formatNumber(count)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {latest.length > 0 ? (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">جدیدترین موارد</p>
                <ol className="space-y-1">
                  {latest.map((r) => {
                    const d = r.diff ?? {};
                    const scoreNum = typeof d.score === "number" ? d.score : Number(d.score ?? 0);
                    return (
                      <li
                        key={r.id}
                        className="flex flex-col gap-0.5 rounded-sm bg-muted/10 px-2 py-1.5 text-sm sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{d.product_name ?? "—"}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {d.channel_name ?? "—"} · {formatDateFa(r.created_at)}
                          </div>
                        </div>
                        <Badge variant="secondary" className="shrink-0 text-xs">
                          {Number.isFinite(scoreNum) ? formatNumber(scoreNum) : "—"}
                        </Badge>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ) : null}

            {rows.length >= RECENT_LIMIT ? (
              <p className="text-center text-xs text-muted-foreground">
                نمایش نمونه ۵۰۰ مورد اخیر
              </p>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}