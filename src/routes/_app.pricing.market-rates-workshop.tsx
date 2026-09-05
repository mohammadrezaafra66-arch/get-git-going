import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { TrendingUp, TrendingDown, Plus, Filter, Cloud, RefreshCw } from "lucide-react";
import { requirePermission } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { ResponsiveContainer, LineChart, Line } from "recharts";
import { useAuth } from "@/lib/auth/AuthProvider";
import { formatNumber, formatDateFa } from "@/lib/i18n/formatters";
import {
  ingestMarketRatesExternal,
  getExternalRatesStatus,
} from "@/lib/market-rates-ingestion.functions";
import { MarketRateMappingsPanel } from "@/components/pricing/MarketRateMappingsPanel";
import { MarketRateIngestionHistory } from "@/components/pricing/MarketRateIngestionHistory";
import { MarketRateSuspectAlerts } from "@/components/pricing/MarketRateSuspectAlerts";
import { MarketRateTickStatusControl } from "@/components/pricing/MarketRateTickStatusControl";

export const Route = createFileRoute("/_app/pricing/market-rates-workshop")({
  beforeLoad: async () => {
    await requirePermission("market-rates", "view");
  },
  component: MarketRatesWorkshopPage,
});

type Indicator = {
  id: string;
  code: string;
  title_fa: string;
  category: string;
  unit: string;
  is_active: boolean;
  sort_order: number;
};
type Source = {
  id: string;
  code: string;
  title_fa: string;
  source_type: string;
  is_enabled: boolean;
};
type Tick = {
  id: string;
  indicator_id: string;
  source_id: string;
  value: number;
  unit: string;
  observed_at: string;
  change_amount: number | null;
  change_percent: number | null;
  status: string;
  note: string | null;
  created_at: string;
};

const STATUS_LABEL: Record<string, string> = {
  accepted: "تأییدشده",
  suspect: "مشکوک",
  rejected: "ردشده",
};
const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  accepted: "default",
  suspect: "secondary",
  rejected: "destructive",
};
const CATEGORY_LABEL: Record<string, string> = {
  currency: "ارز",
  gold: "طلا",
  coin: "سکه",
  official: "رسمی",
  crypto: "رمزارز",
  manual: "دستی",
};

function MarketRatesWorkshopPage() {
  const { roles } = useAuth();
  const canWrite = roles.some((r) => ["admin", "manager", "accountant"].includes(r));
  const isPrivileged = canWrite; // مشاهده داده حساس
  const qc = useQueryClient();

  // Realtime: refresh ticks/indicators caches whenever a new tick is inserted/updated.
  useEffect(() => {
    const channel = supabase
      .channel("market-rates-workshop-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "market_rate_ticks" }, () => {
        qc.invalidateQueries({ queryKey: ["market-ticks-latest"] });
        qc.invalidateQueries({ queryKey: ["market-ticks-history"] });
        qc.invalidateQueries({ queryKey: ["market-external-status"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  const [filterIndicator, setFilterIndicator] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterSource, setFilterSource] = useState<string>("all");
  const HIST_SIZE = 20;
  const [historyPage, setHistoryPage] = useState(0);

  useEffect(() => {
    setHistoryPage(0);
  }, [filterIndicator, filterStatus, filterSource]);

  const indicatorsQ = useQuery({
    queryKey: ["market-indicators"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("market_indicators")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Indicator[];
    },
  });

  // اسپارک‌لاین ۷ روز اخیر برای همه شاخص‌ها (یک کوئری)
  const sparklineQ = useQuery({
    queryKey: ["market-ticks-sparkline", isPrivileged],
    enabled: !!indicatorsQ.data?.length,
    staleTime: 60_000,
    queryFn: async () => {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("market_rate_ticks")
        .select("indicator_id, value, observed_at")
        .eq("status", "accepted")
        .gte("observed_at", since)
        .order("observed_at", { ascending: true })
        .limit(500);
      if (error) throw error;
      const map: Record<string, Array<{ value: number; observed_at: string }>> = {};
      for (const row of data ?? []) {
        if (!map[row.indicator_id]) map[row.indicator_id] = [];
        map[row.indicator_id].push({
          value: Number(row.value),
          observed_at: row.observed_at,
        });
      }
      return map;
    },
  });

  const sourcesQ = useQuery({
    queryKey: ["market-sources"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("market_rate_sources")
        .select("*")
        .eq("is_enabled", true)
        .order("title_fa", { ascending: true })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as Source[];
    },
  });

  // آخرین نرخ هر شاخص
  const latestQ = useQuery({
    queryKey: ["market-ticks-latest", isPrivileged, indicatorsQ.data?.length],
    enabled: !!indicatorsQ.data,
    queryFn: async () => {
      if (!indicatorsQ.data) return {} as Record<string, Tick>;
      const out: Record<string, Tick> = {};
      await Promise.all(
        indicatorsQ.data.map(async (ind) => {
          if (isPrivileged) {
            const { data } = await supabase
              .from("market_rate_ticks")
              .select(
                "id,indicator_id,source_id,value,unit,observed_at,change_amount,change_percent,status,note,created_at",
              )
              .eq("indicator_id", ind.id)
              .eq("status", "accepted")
              .order("observed_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (data) out[ind.id] = data as unknown as Tick;
          } else {
            const { data } = await supabase.rpc("list_market_rate_ticks_public", {
              p_indicator_id: ind.id,
              p_limit: 1,
            });
            const row = (data ?? [])[0];
            if (row) out[ind.id] = { ...row, note: null, created_at: row.observed_at } as Tick;
          }
        }),
      );
      return out;
    },
  });

  // تاریخچه با فیلتر
  const historyQ = useQuery({
    queryKey: [
      "market-ticks-history",
      filterIndicator,
      filterStatus,
      filterSource,
      isPrivileged,
      historyPage,
    ],
    queryFn: async () => {
      if (isPrivileged) {
        let q = supabase
          .from("market_rate_ticks")
          .select(
            "id,indicator_id,source_id,value,unit,observed_at,change_amount,change_percent,status,note,created_at",
          )
          .order("observed_at", { ascending: false })
          .range(historyPage * HIST_SIZE, historyPage * HIST_SIZE + HIST_SIZE - 1);
        if (filterIndicator !== "all") q = q.eq("indicator_id", filterIndicator);
        if (filterStatus !== "all") q = q.eq("status", filterStatus);
        if (filterSource !== "all") q = q.eq("source_id", filterSource);
        const { data, error } = await q;
        if (error) throw error;
        return (data ?? []) as Tick[];
      } else {
        const { data, error } = await supabase.rpc("list_market_rate_ticks_public", {
          p_indicator_id: filterIndicator === "all" ? undefined : filterIndicator,
          p_limit: HIST_SIZE,
        });
        if (error) throw error;
        return (data ?? []).map((r: any) => ({
          ...r,
          note: null,
          created_at: r.observed_at,
        })) as Tick[];
      }
    },
  });

  const indicatorMap = useMemo(() => {
    const m: Record<string, Indicator> = {};
    (indicatorsQ.data ?? []).forEach((i) => {
      m[i.id] = i;
    });
    return m;
  }, [indicatorsQ.data]);
  const sourceMap = useMemo(() => {
    const m: Record<string, Source> = {};
    (sourcesQ.data ?? []).forEach((s) => {
      m[s.id] = s;
    });
    return m;
  }, [sourcesQ.data]);

  return (
    <div dir="rtl" className="space-y-5">
      <PageHeader
        title="کارگاه نرخ ارز و طلا"
        description={
          isPrivileged
            ? "پایش و ثبت نرخ‌های مهم بازار برای حسابدار و مدیرکل"
            : "نرخ‌های عمومی تأییدشده بازار (مشاهده فقط)"
        }
        actions={
          canWrite && indicatorsQ.data && sourcesQ.data ? (
            <NewTickDialog
              indicators={indicatorsQ.data}
              sources={sourcesQ.data}
              onDone={() => {
                qc.invalidateQueries({ queryKey: ["market-ticks-latest"] });
                qc.invalidateQueries({ queryKey: ["market-ticks-history"] });
              }}
            />
          ) : undefined
        }
      />

      {/* کارت‌های آخرین نرخ */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">آخرین نرخ هر شاخص</h2>
        {indicatorsQ.isLoading ? (
          <div className="text-sm text-muted-foreground">در حال بارگذاری…</div>
        ) : indicatorsQ.data && indicatorsQ.data.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            شاخصی تعریف نشده است.
          </div>
        ) : (
          <>
          {!latestQ.isLoading &&
            Object.keys(latestQ.data ?? {}).length === 0 &&
            (indicatorsQ.data?.length ?? 0) > 0 && (
              <div className="mb-3 space-y-2 rounded-lg border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
                <p className="font-semibold text-foreground">هنوز نرخی ثبت نشده است</p>
                <p>
                  برای شروع، از دکمه «ثبت نرخ جدید» در بالای صفحه استفاده کنید تا نرخ ارز یا طلا را
                  به صورت دستی وارد کنید.
                </p>
                {!canWrite && (
                  <p>شما دسترسی مشاهده دارید. برای ثبت نرخ با مدیر سیستم تماس بگیرید.</p>
                )}
              </div>
            )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {indicatorsQ.data?.map((ind) => {
              const t = latestQ.data?.[ind.id];
              const isUp = (t?.change_amount ?? 0) > 0;
              const isDown = (t?.change_amount ?? 0) < 0;
              const sparklineData = sparklineQ.data?.[ind.id] ?? [];
              return (
                <Card key={ind.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center justify-between text-base">
                      <span>{ind.title_fa}</span>
                      <Badge variant="outline" className="text-xs">
                        {CATEGORY_LABEL[ind.category] ?? ind.category}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {!t ? (
                      <p className="text-sm text-muted-foreground">نرخی ثبت نشده است.</p>
                    ) : (
                      <div className="space-y-1">
                        <div className="text-2xl font-bold">
                          {formatNumber(Number(t.value))}{" "}
                          <span className="text-xs font-normal text-muted-foreground">
                            {t.unit === "toman" ? "تومان" : t.unit}
                          </span>
                        </div>
                        {t.change_amount !== null && (
                          <div
                            className={`flex items-center gap-1 text-xs ${isUp ? "text-emerald-600" : isDown ? "text-rose-600" : "text-muted-foreground"}`}
                          >
                            {isUp && <TrendingUp className="h-3 w-3" />}
                            {isDown && <TrendingDown className="h-3 w-3" />}
                            <span>{formatNumber(Math.abs(Number(t.change_amount)))}</span>
                            {t.change_percent !== null && (
                              <span>({Number(t.change_percent).toFixed(2)}٪)</span>
                            )}
                          </div>
                        )}
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{sourceMap[t.source_id]?.title_fa ?? "—"}</span>
                          <span>{formatDateFa(t.observed_at)}</span>
                        </div>
                        <Badge variant={STATUS_VARIANT[t.status] ?? "default"} className="text-xs">
                          {STATUS_LABEL[t.status] ?? t.status}
                        </Badge>
                        {sparklineData.length > 1 && (
                          <div className="mt-2 h-10 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={sparklineData}>
                                <Line
                                  type="monotone"
                                  dataKey="value"
                                  stroke={isUp ? "#059669" : isDown ? "#dc2626" : "#94a3b8"}
                                  strokeWidth={1.5}
                                  dot={false}
                                />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
          </>
        )}
      </section>

      {canWrite && <ExternalIngestionCard />}

      <MarketRateSuspectAlerts />

      {canWrite && <MarketRateMappingsPanel />}

      <MarketRateIngestionHistory />

      {/* تاریخچه با فیلتر */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="h-4 w-4" /> تاریخچه نرخ‌ها
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Select value={filterIndicator} onValueChange={setFilterIndicator}>
              <SelectTrigger>
                <SelectValue placeholder="شاخص" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه شاخص‌ها</SelectItem>
                {indicatorsQ.data?.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.title_fa}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isPrivileged && (
              <>
                <Select value={filterSource} onValueChange={setFilterSource}>
                  <SelectTrigger>
                    <SelectValue placeholder="منبع" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">همه منابع</SelectItem>
                    {sourcesQ.data?.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.title_fa}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="وضعیت" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">همه وضعیت‌ها</SelectItem>
                    <SelectItem value="accepted">تأییدشده</SelectItem>
                    <SelectItem value="suspect">مشکوک</SelectItem>
                    <SelectItem value="rejected">ردشده</SelectItem>
                  </SelectContent>
                </Select>
              </>
            )}
          </div>

          {historyQ.isLoading ? (
            <div className="text-sm text-muted-foreground">در حال بارگذاری…</div>
          ) : !historyQ.data || historyQ.data.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              رکوردی یافت نشد.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="px-2 py-2">شاخص</th>
                    <th className="px-2 py-2">مقدار</th>
                    <th className="px-2 py-2">تغییر</th>
                    <th className="px-2 py-2">منبع</th>
                    <th className="px-2 py-2">زمان</th>
                    <th className="px-2 py-2">وضعیت</th>
                    {/* C-8 (unwired wave 1) — set_market_rate_tick_status had no caller. */}
                    {isPrivileged && <th className="px-2 py-2">تغییر وضعیت</th>}
                  </tr>
                </thead>
                <tbody>
                  {historyQ.data.map((t) => (
                    <tr key={t.id} className="border-b last:border-0">
                      <td className="px-2 py-2">{indicatorMap[t.indicator_id]?.title_fa ?? "—"}</td>
                      <td className="px-2 py-2 font-semibold">
                        {formatNumber(Number(t.value))}{" "}
                        <span className="text-xs text-muted-foreground">
                          {t.unit === "toman" ? "تومان" : t.unit}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-xs">
                        {t.change_amount !== null ? (
                          <span
                            className={
                              Number(t.change_amount) > 0
                                ? "text-emerald-600"
                                : Number(t.change_amount) < 0
                                  ? "text-rose-600"
                                  : ""
                            }
                          >
                            {Number(t.change_amount) > 0 ? "+" : ""}
                            {formatNumber(Number(t.change_amount))}
                            {t.change_percent !== null &&
                              ` (${Number(t.change_percent).toFixed(2)}٪)`}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-2 py-2">{sourceMap[t.source_id]?.title_fa ?? "—"}</td>
                      <td className="px-2 py-2 text-xs text-muted-foreground">
                        {formatDateFa(t.observed_at)}
                      </td>
                      <td className="px-2 py-2">
                        <Badge variant={STATUS_VARIANT[t.status] ?? "default"} className="text-xs">
                          {STATUS_LABEL[t.status] ?? t.status}
                        </Badge>
                      </td>
                      {isPrivileged && (
                        <td className="px-2 py-2">
                          <MarketRateTickStatusControl tickId={t.id} status={t.status} />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <Button
              variant="outline"
              size="sm"
              disabled={historyPage === 0}
              onClick={() => setHistoryPage((p) => p - 1)}
            >
              قبلی
            </Button>
            <span className="text-xs text-muted-foreground">صفحه {historyPage + 1}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={(historyQ.data?.length ?? 0) < HIST_SIZE}
              onClick={() => setHistoryPage((p) => p + 1)}
            >
              بعدی
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function NewTickDialog({
  indicators,
  sources,
  onDone,
}: {
  indicators: Indicator[];
  sources: Source[];
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [indicatorId, setIndicatorId] = useState<string>("");
  const [sourceId, setSourceId] = useState<string>("");
  const [value, setValue] = useState<string>("");
  const [observedAt, setObservedAt] = useState<string>(() => {
    const d = new Date();
    d.setSeconds(0, 0);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  });
  const [status, setStatus] = useState<"accepted" | "suspect">("accepted");
  const [note, setNote] = useState<string>("");

  const mut = useMutation({
    mutationFn: async () => {
      if (!indicatorId) throw new Error("شاخص الزامی است");
      if (!sourceId) throw new Error("منبع الزامی است");
      if (!observedAt) throw new Error("زمان مشاهده الزامی است");
      const v = Number(value);
      if (!Number.isFinite(v) || v <= 0) throw new Error("مقدار باید عددی بزرگ‌تر از صفر باشد");
      const ind = indicators.find((i) => i.id === indicatorId);
      const { error } = await supabase.rpc("record_market_rate_tick", {
        p_indicator_id: indicatorId,
        p_source_id: sourceId,
        p_value: v,
        p_observed_at: new Date(observedAt).toISOString(),
        p_status: status,
        p_note: note || undefined,
        p_unit: ind?.unit ?? "toman",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("نرخ با موفقیت ثبت شد");
      setOpen(false);
      setValue("");
      setNote("");
      onDone();
    },
    onError: (e: any) => toast.error(e?.message ?? "خطا در ثبت نرخ"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="ml-1 h-4 w-4" /> ثبت نرخ جدید
        </Button>
      </DialogTrigger>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>ثبت دستی نرخ</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>شاخص</Label>
            <Select value={indicatorId} onValueChange={setIndicatorId}>
              <SelectTrigger>
                <SelectValue placeholder="انتخاب شاخص" />
              </SelectTrigger>
              <SelectContent>
                {indicators.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.title_fa}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>منبع</Label>
            <Select value={sourceId} onValueChange={setSourceId}>
              <SelectTrigger>
                <SelectValue placeholder="انتخاب منبع" />
              </SelectTrigger>
              <SelectContent>
                {sources.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.title_fa}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>مقدار</Label>
            <Input
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="مثلاً ۸۵۰۰۰"
            />
          </div>
          <div className="space-y-1">
            <Label>زمان مشاهده</Label>
            <Input
              type="datetime-local"
              value={observedAt}
              onChange={(e) => setObservedAt(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>وضعیت</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as "accepted" | "suspect")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="accepted">تأییدشده</SelectItem>
                <SelectItem value="suspect">مشکوک</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>توضیح (اختیاری)</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={mut.isPending}>
            انصراف
          </Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? "در حال ثبت…" : "ثبت نرخ"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExternalIngestionCard() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const statusQ = useQuery({
    queryKey: ["market-external-status"],
    queryFn: async () => {
      try {
        // Guard: ensure session token is present before calling the
        // server function. Without it, the auth middleware throws a 401
        // Response which surfaces as an unhandled "[object Response]"
        // runtime error in the preview reporter.
        const { supabase } = await import("@/integrations/supabase/client");
        const { data: sess } = await supabase.auth.getSession();
        const token = sess?.session?.access_token;
        if (!token) {
          return {
            master_enabled: false,
            navasan_enabled: false,
            tgju_enabled: false,
            navasan_has_key: false,
            tgju_has_key: false,
          };
        }
        return await getExternalRatesStatus({
          data: {},
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        // No access or self-host disabled — fall back to a safe default
        return {
          master_enabled: false,
          navasan_enabled: false,
          tgju_enabled: false,
          navasan_has_key: false,
          tgju_has_key: false,
        };
      }
    },
    staleTime: 60_000,
    enabled: !!user,
    retry: false,
  });

  const ingest = useMutation({
    mutationFn: async (source_code: "NAVASAN_API" | "TGJU_API" | "ALL") => {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) throw new Error("برای دریافت نرخ باید وارد شده باشید.");
      return await ingestMarketRatesExternal({
        data: { source_code },
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    onSuccess: (results) => {
      results.forEach((r) => {
        const label = r.source_code === "NAVASAN_API" ? "نوسان" : "TGJU";
        if (r.status === "completed") toast.success(`${label}: ${r.message_fa}`);
        else if (r.status === "skipped") toast.info(`${label}: ${r.message_fa}`);
        else toast.error(`${label}: ${r.message_fa}`);
      });
      qc.invalidateQueries({ queryKey: ["market-ticks-latest"] });
      qc.invalidateQueries({ queryKey: ["market-ticks-history"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "خطای دریافت"),
  });

  const s = statusQ.data;
  const masterOff = !!s && !s.master_enabled;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Cloud className="h-4 w-4" /> دریافت نرخ از منابع خارجی (اختیاری)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!s ? (
          <p className="text-sm text-muted-foreground">در حال بررسی پیکربندی…</p>
        ) : masterOff ? (
          <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
            دریافت خودکار نرخ‌ها در نسخه self-host غیرفعال است. ثبت دستی همچنان فعال است.
          </p>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant={s.navasan_enabled ? "default" : "secondary"}>
                نوسان: {s.navasan_enabled ? "فعال" : "غیرفعال"}
              </Badge>
              {s.navasan_enabled && !s.navasan_has_key && (
                <Badge variant="destructive">کلید API ندارد</Badge>
              )}
              <Badge variant={s.tgju_enabled ? "default" : "secondary"}>
                TGJU: {s.tgju_enabled ? "فعال" : "غیرفعال"}
              </Badge>
              <Badge variant="secondary" className="text-[10px]">
                TGJU: نیاز به تأیید قرارداد/نماد رسمی
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              قطع شدن منبع خارجی، مسیر ثبت دستی نرخ را مختل نمی‌کند.
            </p>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={masterOff || !s?.navasan_enabled || !s?.navasan_has_key || ingest.isPending}
            onClick={() => ingest.mutate("NAVASAN_API")}
            title={!s?.navasan_has_key ? "کلید API نوسان تنظیم نشده است" : undefined}
          >
            <RefreshCw className="ml-1 h-4 w-4" /> دریافت از نوسان
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled
            title="اتصال TGJU تا تأیید endpoint و نمادهای رسمی غیرفعال است"
          >
            <RefreshCw className="ml-1 h-4 w-4" /> دریافت از TGJU
          </Button>
          <Button
            size="sm"
            disabled={masterOff || !s?.navasan_enabled || !s?.navasan_has_key || ingest.isPending}
            onClick={() => ingest.mutate("ALL")}
          >
            <RefreshCw className="ml-1 h-4 w-4" /> دریافت از همه منابع فعال
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
