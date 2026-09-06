import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Sparkles,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ListChecks,
  HelpCircle,
  Activity,
  Clock,
  RefreshCw,
  PlayCircle,
} from "lucide-react";
import { toast } from "sonner";
import { requirePermission } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { publishAllProductsPrices, type PublishProductResult } from "@/lib/pricing/publish-prices";
import { formatNumber } from "@/lib/i18n/formatters";
import { useComputedPricesRealtime } from "@/hooks/pricing/useComputedPricesRealtime";
import { triggerPricingRecomputeQueue } from "@/lib/pricing/process-queue.functions";

export const Route = createFileRoute("/_app/pricing/recompute-prices")({
  // Wave 2 / B-1 — the client half of the guard below. `beforeLoad` runs only on the server
  // for a direct navigation and cannot see a localStorage session, so RouteRoleGate reads this.
  // Mirrors requirePermission("pricing", "update"). `allowed` is the LIVE
  // role_permissions.pricing.can_update set read from the database on 2026-09-06 —
  // NOT src/lib/rbac/roles.ts, whose static table disagrees for several modules.
  staticData: {
    gate: {
      kind: "anyRole",
      allowed: ["admin", "manager", "accountant", "sales", "purchase_specialist"],
    },
  },
  beforeLoad: async () => {
    await requirePermission("pricing", "update");
  },
  component: RecomputePricesPage,
});

function RecomputePricesPage() {
  const [onlyAvailable, setOnlyAvailable] = useState(true);
  const [running, setRunning] = useState(false);
  const [draining, setDraining] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState<PublishProductResult[]>([]);
  const [summary, setSummary] = useState<{ written: number; failed: number } | null>(null);
  const triggerQueueFn = useServerFn(triggerPricingRecomputeQueue);

  const { data: counts } = useQuery({
    queryKey: ["recompute-eligible-count", onlyAvailable],
    queryFn: async () => {
      let qAll = supabase.from("products").select("id", { count: "exact", head: true });
      let qElig = supabase.from("products").select("id", { count: "exact", head: true });
      if (onlyAvailable) {
        qElig = qElig.eq("status", "active").in("stock_status", ["available", "limited"]);
      }
      const [a, e] = await Promise.all([qAll, qElig]);
      return { all: a.count ?? 0, eligible: e.count ?? 0 };
    },
  });

  // وضعیت سلامت صف بازمحاسبه قیمت — فقط برای نقش‌هایی که RLS اجازهٔ خواندن
  // pricing_recompute_queue را به آن‌ها داده (admin/manager/accountant).
  const queueHealthQuery = useQuery({
    queryKey: ["pricing-recompute-queue-summary"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_pricing_recompute_queue_summary")
        .select(
          "pending_count, processing_count, failed_count, done_count, oldest_pending_at, latest_error",
        )
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    staleTime: 10_000,
  });

  // وقتی worker قیمت‌ها را به‌روز کرد، summary صف هم تازه شود.
  useComputedPricesRealtime({
    channelName: "recompute-prices-page-realtime",
    invalidateKeys: [["pricing-recompute-queue-summary"]],
  });

  const queueHealth = queueHealthQuery.data;
  const queueLastFetchedAt = queueHealthQuery.dataUpdatedAt;

  async function handleProcessQueue() {
    setDraining(true);
    try {
      const res = await triggerQueueFn({ data: {} });
      toast.success(
        `پردازش صف قیمت‌ها انجام شد. (${res.picked} پردازش، ${res.succeeded} موفق، ${res.failed} ناموفق، ${res.remaining_pending} در انتظار)`,
      );
      await queueHealthQuery.refetch();
    } catch (e: unknown) {
      const msg = (e as Error)?.message ?? "";
      console.error("[ui] process queue failed", e);
      toast.error(
        msg
          ? `پردازش صف قیمت‌ها ناموفق بود؛ لاگ‌ها را بررسی کنید. (${msg})`
          : "پردازش صف قیمت‌ها ناموفق بود؛ لاگ‌ها را بررسی کنید.",
      );
    } finally {
      setDraining(false);
    }
  }

  async function handleRun() {
    setRunning(true);
    setResults([]);
    setSummary(null);
    setProgress({ done: 0, total: 0 });
    try {
      const collected: PublishProductResult[] = [];
      const res = await publishAllProductsPrices({
        onlyActiveAvailable: onlyAvailable,
        onProgress: (done, total, last) => {
          collected.push(last);
          setProgress({ done, total });
          setResults([...collected]);
        },
      });
      setSummary({ written: res.total_prices_written, failed: res.total_failed });
      toast.success(
        `${res.total_prices_written} قیمت ذخیره شد` +
          (res.total_failed ? ` — ${res.total_failed} خطا` : ""),
      );
    } catch (e: any) {
      toast.error(e?.message ?? "خطا در اجرا");
    } finally {
      setRunning(false);
    }
  }

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="انتشار قیمت فروش (دسته‌ای)"
        description="برای همهٔ محصولات واجد شرایط، قیمت فروش با همهٔ نوع‌قیمت‌های فعال محاسبه و در سیستم ذخیره می‌شود تا در /sales/search و سایر صفحات دیده شود."
      />

      {queueHealth && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <div className="flex items-center gap-1 font-medium">
                <Activity className="h-4 w-4 text-primary" />
                وضعیت صف بازمحاسبه قیمت
              </div>
              <div className="ms-auto flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                آخرین بررسی:{" "}
                {queueLastFetchedAt
                  ? new Date(queueLastFetchedAt).toLocaleTimeString("fa-IR")
                  : "—"}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2"
                  onClick={() => queueHealthQuery.refetch()}
                  disabled={queueHealthQuery.isFetching}
                  aria-label="بروزرسانی وضعیت صف"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${queueHealthQuery.isFetching ? "animate-spin" : ""}`}
                  />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 px-2"
                  onClick={handleProcessQueue}
                  disabled={draining}
                  title="پردازش دستی صف بازمحاسبه قیمت — فقط برای کنترل اپراتور"
                >
                  {draining ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <PlayCircle className="h-3.5 w-3.5" />
                  )}
                  <span>پردازش صف قیمت‌ها</span>
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-md border bg-muted/40 p-2">
                <div className="text-xs text-muted-foreground">در انتظار</div>
                <div className="text-lg font-semibold">
                  {formatNumber(Number(queueHealth.pending_count ?? 0))}
                </div>
              </div>
              <div className="rounded-md border bg-muted/40 p-2">
                <div className="text-xs text-muted-foreground">در حال پردازش</div>
                <div className="text-lg font-semibold">
                  {formatNumber(Number(queueHealth.processing_count ?? 0))}
                </div>
              </div>
              <div
                className={`rounded-md border p-2 ${Number(queueHealth.failed_count ?? 0) > 0 ? "border-destructive/40 bg-destructive/10" : "bg-muted/40"}`}
              >
                <div className="text-xs text-muted-foreground">ناموفق</div>
                <div
                  className={`text-lg font-semibold ${Number(queueHealth.failed_count ?? 0) > 0 ? "text-destructive" : ""}`}
                >
                  {formatNumber(Number(queueHealth.failed_count ?? 0))}
                </div>
              </div>
              <div className="rounded-md border bg-muted/40 p-2">
                <div className="text-xs text-muted-foreground">انجام‌شده</div>
                <div className="text-lg font-semibold text-emerald-600">
                  {formatNumber(Number(queueHealth.done_count ?? 0))}
                </div>
              </div>
            </div>
            <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
              <div>
                قدیمی‌ترین در انتظار:{" "}
                <span className="text-foreground">
                  {queueHealth.oldest_pending_at
                    ? new Date(queueHealth.oldest_pending_at as string).toLocaleString("fa-IR")
                    : "—"}
                </span>
              </div>
              {queueHealth.latest_error ? (
                <div className="flex items-start gap-1 text-destructive">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                  <span className="line-clamp-2">{queueHealth.latest_error as string}</span>
                </div>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              قیمت‌ها پس از پردازش worker به‌صورت خودکار در صفحات مربوطه به‌روزرسانی می‌شوند. این
              کارت برای پایش سلامت صف است و دکمه‌های دستی محاسبه را جایگزین نمی‌کند.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Checkbox
                id="only-available"
                checked={onlyAvailable}
                onCheckedChange={(v) => setOnlyAvailable(Boolean(v))}
                disabled={running}
              />
              <Label htmlFor="only-available" className="cursor-pointer text-sm">
                فقط محصولات فعال و موجود
              </Label>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ListChecks className="h-4 w-4" />
              واجد شرایط:{" "}
              <strong className="text-foreground">{formatNumber(counts?.eligible ?? 0)}</strong> از
              کل <strong className="text-foreground">{formatNumber(counts?.all ?? 0)}</strong>
            </div>
            <div className="ms-auto flex items-center gap-1">
              <Button onClick={handleRun} disabled={running}>
                {running ? (
                  <Loader2 className="ms-1 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="ms-1 h-4 w-4" />
                )}
                شروع محاسبه و انتشار
              </Button>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="راهنمای استفاده از انتشار دسته‌ای قیمت فروش"
                    title="راهنمای استفاده"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <HelpCircle className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-80 text-sm leading-6" dir="rtl">
                  <div className="space-y-2">
                    <div className="font-semibold">چه زمانی از این دکمه استفاده کنم؟</div>
                    <p className="text-muted-foreground">
                      این دکمه برای محاسبه و انتشار دسته‌ای قیمت فروش چندین محصول است.
                    </p>
                    <div>
                      <div className="font-medium">استفاده کن وقتی:</div>
                      <ul className="list-disc ps-5 space-y-1 text-muted-foreground">
                        <li>نرخ ارز تغییر کرده و باید قیمت چندین محصول به‌روزرسانی شود.</li>
                        <li>قوانین قیمت‌گذاری یا نوع قیمت‌های فروش تغییر کرده‌اند.</li>
                        <li>
                          بعد از import یا اصلاح گسترده محصولات/قیمت‌ها می‌خواهی قیمت‌ها دوباره
                          منتشر شوند.
                        </li>
                        <li>
                          بعد از migration یا راه‌اندازی اولیه لازم است قیمت‌ها برای فروش قابل
                          مشاهده شوند.
                        </li>
                      </ul>
                    </div>
                    <div>
                      <div className="font-medium">استفاده نکن وقتی:</div>
                      <ul className="list-disc ps-5 space-y-1 text-muted-foreground">
                        <li>فقط قیمت خرید یک محصول تغییر کرده است.</li>
                        <li>فقط می‌خواهی قیمت یک کالا را اصلاح کنی.</li>
                      </ul>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      برای تغییر قیمت خرید یک محصول، باید فقط همان محصول دوباره محاسبه شود؛ اجرای
                      دسته‌ای ممکن است قیمت چندین محصول را هم‌زمان بازنویسی کند.
                    </p>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {running && (
            <div className="space-y-1">
              <Progress value={pct} />
              <div className="text-xs text-muted-foreground">
                {progress.done} از {progress.total} محصول ({pct}%)
              </div>
            </div>
          )}

          {summary && !running && (
            <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-2 text-sm text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="ms-1 inline h-4 w-4" />
              {summary.written} قیمت ذخیره شد · {summary.failed} خطا
            </div>
          )}
        </CardContent>
      </Card>

      {results.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="max-h-[60vh] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/60 text-xs">
                  <tr>
                    <th className="p-2 text-start">محصول</th>
                    <th className="p-2 text-start">SKU</th>
                    <th className="p-2">موفق</th>
                    <th className="p-2">خطا</th>
                    <th className="p-2 text-start">جزئیات خطا</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) => {
                    const errs = r.results.filter((x) => !x.ok);
                    return (
                      <tr key={`${r.product_id}-${i}`} className="border-t border-border">
                        <td className="p-2">{r.product_name}</td>
                        <td className="p-2 text-xs text-muted-foreground">{r.sku ?? "—"}</td>
                        <td className="p-2 text-center text-emerald-600">{r.succeeded}</td>
                        <td className="p-2 text-center text-destructive">{r.failed}</td>
                        <td className="p-2 text-xs text-muted-foreground">
                          {errs.length === 0 ? (
                            "—"
                          ) : (
                            <ul className="space-y-0.5">
                              {errs.map((e, j) => (
                                <li key={j} className="flex items-start gap-1">
                                  <AlertCircle className="mt-0.5 h-3 w-3 flex-shrink-0 text-destructive" />
                                  <span>
                                    {e.sale_price_type_title || "—"}: {e.error}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
