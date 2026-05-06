import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { History, ChevronDown, ChevronLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { formatDateFa } from "@/lib/i18n/formatters";

type Run = {
  id: string;
  source_code: string;
  status: "started" | "completed" | "failed" | "skipped";
  fetched_count: number;
  inserted_count: number;
  suspect_count: number;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
};

const STATUS_LABEL: Record<Run["status"], string> = {
  started: "در حال اجرا",
  completed: "موفق",
  failed: "ناموفق",
  skipped: "ردشده",
};
const STATUS_VARIANT: Record<Run["status"], "default" | "secondary" | "destructive"> = {
  started: "secondary",
  completed: "default",
  failed: "destructive",
  skipped: "secondary",
};
const SOURCE_LABEL: Record<string, string> = {
  NAVASAN_API: "نوسان",
  TGJU_API: "TGJU",
};

function formatDuration(started: string, finished: string | null): string {
  if (!finished) return "نامشخص";
  const ms = new Date(finished).getTime() - new Date(started).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "نامشخص";
  if (ms < 1000) return `${ms} میلی‌ثانیه`;
  const s = Math.round(ms / 100) / 10;
  if (s < 60) return `${s} ثانیه`;
  const m = Math.floor(s / 60);
  const rs = Math.round(s - m * 60);
  return `${m} دقیقه و ${rs} ثانیه`;
}

export function MarketRateIngestionHistory() {
  const { roles } = useAuth();
  const canView = roles.some((r) => ["admin", "manager", "accountant"].includes(r));
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const q = useQuery({
    queryKey: ["market-rate-ingestion-runs"],
    enabled: canView && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("market_rate_ingestion_runs")
        .select(
          "id,source_code,status,fetched_count,inserted_count,suspect_count,error_message,started_at,finished_at",
        )
        .order("started_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as Run[];
    },
  });

  if (!canView) return null;

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <History className="h-4 w-4" /> تاریخچه دریافت از منابع خارجی
              </span>
              <Badge variant="secondary" className="text-xs">
                {open ? "بستن" : "باز کردن"}
              </Badge>
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent>
            {q.isLoading ? (
              <div className="text-sm text-muted-foreground">در حال بارگذاری…</div>
            ) : !q.data || q.data.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                هنوز دریافت خودکاری ثبت نشده است.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-right text-xs">
                  <thead className="bg-muted/40 text-muted-foreground">
                    <tr>
                      <th className="px-2 py-2">منبع</th>
                      <th className="px-2 py-2">وضعیت</th>
                      <th className="px-2 py-2">دریافت‌شده</th>
                      <th className="px-2 py-2">ثبت‌شده</th>
                      <th className="px-2 py-2">مشکوک</th>
                      <th className="px-2 py-2">شروع</th>
                      <th className="px-2 py-2">پایان</th>
                      <th className="px-2 py-2">خطا</th>
                      <th className="px-2 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {q.data.map((r) => {
                      const isOpen = expanded.has(r.id);
                      return (
                      <Fragment key={r.id}>
                      <tr className="border-t">
                        <td className="px-2 py-2">{SOURCE_LABEL[r.source_code] ?? r.source_code}</td>
                        <td className="px-2 py-2">
                          <Badge variant={STATUS_VARIANT[r.status] ?? "secondary"} className="text-[10px]">
                            {STATUS_LABEL[r.status] ?? r.status}
                          </Badge>
                        </td>
                        <td className="px-2 py-2">{r.fetched_count}</td>
                        <td className="px-2 py-2">{r.inserted_count}</td>
                        <td className="px-2 py-2">{r.suspect_count}</td>
                        <td className="px-2 py-2 text-muted-foreground">{formatDateFa(r.started_at)}</td>
                        <td className="px-2 py-2 text-muted-foreground">
                          {r.finished_at ? formatDateFa(r.finished_at) : "—"}
                        </td>
                        <td
                          className="px-2 py-2 max-w-[220px] truncate text-muted-foreground"
                          title={r.error_message ?? ""}
                        >
                          {r.error_message ?? "—"}
                        </td>
                        <td className="px-2 py-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-[10px]"
                            onClick={() => toggle(r.id)}
                            aria-label={isOpen ? "بستن جزئیات" : "نمایش جزئیات"}
                            aria-expanded={isOpen}
                          >
                            {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
                            <span className="mr-1">جزئیات</span>
                          </Button>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="border-t bg-muted/20">
                          <td colSpan={9} className="px-3 py-3">
                            <dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2 md:grid-cols-3">
                              <div><dt className="text-muted-foreground">منبع</dt><dd>{SOURCE_LABEL[r.source_code] ?? r.source_code}</dd></div>
                              <div><dt className="text-muted-foreground">وضعیت</dt><dd>{STATUS_LABEL[r.status] ?? r.status}</dd></div>
                              <div><dt className="text-muted-foreground">مدت اجرا</dt><dd>{formatDuration(r.started_at, r.finished_at)}</dd></div>
                              <div><dt className="text-muted-foreground">دریافت‌شده</dt><dd>{r.fetched_count}</dd></div>
                              <div><dt className="text-muted-foreground">ثبت‌شده</dt><dd>{r.inserted_count}</dd></div>
                              <div><dt className="text-muted-foreground">مشکوک</dt><dd>{r.suspect_count}</dd></div>
                              <div><dt className="text-muted-foreground">شروع</dt><dd>{formatDateFa(r.started_at)}</dd></div>
                              <div><dt className="text-muted-foreground">پایان</dt><dd>{r.finished_at ? formatDateFa(r.finished_at) : "نامشخص"}</dd></div>
                              <div className="sm:col-span-2 md:col-span-3">
                                <dt className="text-muted-foreground">پیام خطا</dt>
                                <dd className="mt-1 whitespace-pre-wrap break-words rounded-md border bg-background p-2 text-[11px]">
                                  {r.error_message ?? "خطایی ثبت نشده است."}
                                </dd>
                              </div>
                            </dl>
                          </td>
                        </tr>
                      )}
                      </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}