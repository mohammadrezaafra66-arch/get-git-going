import { Radio, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { formatNumber } from "@/lib/i18n/formatters";

interface ChannelRow {
  id: string;
  name: string;
  weight: number;
  is_active: boolean;
  sort_order: number;
  daily_quota: number | null;
}

const LIMIT = 50;

export function MarketingActiveChannelsCard() {
  const q = useQuery({
    queryKey: ["reports", "marketing", "active-channels"] as const,
    staleTime: 60_000,
    queryFn: async (): Promise<ChannelRow[]> => {
      const { data, error } = await supabase
        .from("marketing_channels")
        .select("id,name,weight,is_active,sort_order,daily_quota")
        .order("is_active", { ascending: false })
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true })
        .limit(LIMIT);
      if (error) throw error;
      return (data ?? []) as ChannelRow[];
    },
  });

  const rows = q.data ?? [];
  const activeCount = rows.filter((c) => c.is_active).length;

  return (
    <Card dir="rtl">
      <CardHeader className="space-y-1">
        <CardTitle className="flex items-center gap-2 text-base">
          <Radio className="h-4 w-4 text-sky-600" />
          کانال‌های فعال تبلیغاتی
        </CardTitle>
        <CardDescription>کانال‌های تعریف‌شده به همراه وزن، ترتیب و سهمیه</CardDescription>
      </CardHeader>
      <CardContent>
        {q.isLoading ? (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            <Loader2 className="ml-2 h-4 w-4 animate-spin" /> در حال بارگذاری...
          </div>
        ) : q.isError ? (
          <p className="py-6 text-center text-sm text-destructive">
            خطا در بارگذاری داده‌ها. لطفاً دوباره تلاش کنید.
          </p>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            کانالی تعریف نشده است.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2">
              <span className="text-sm text-muted-foreground">کانال‌های فعال</span>
              <Badge variant="default" className="text-sm">
                {formatNumber(activeCount)} / {formatNumber(rows.length)}
              </Badge>
            </div>

            <ul className="space-y-1.5">
              {rows.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-col gap-1.5 rounded-md border p-2 text-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={
                          c.is_active
                            ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                            : "border-destructive/50 bg-destructive/10 text-destructive"
                        }
                      >
                        {c.is_active ? "فعال" : "غیرفعال"}
                      </Badge>
                      <span className="truncate font-medium">{c.name}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>ترتیب {formatNumber(c.sort_order)}</span>
                      {c.daily_quota != null && c.daily_quota > 0 ? (
                        <span>· سهمیه {formatNumber(c.daily_quota)}</span>
                      ) : (
                        <span>· سهمیه نامحدود</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 sm:shrink-0">
                    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${Math.max(0, Math.min(100, c.weight))}%` }}
                      />
                    </div>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {formatNumber(c.weight)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>

            {rows.length >= LIMIT ? (
              <p className="text-center text-xs text-muted-foreground">
                نمایش {formatNumber(LIMIT)} کانال اول
              </p>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
