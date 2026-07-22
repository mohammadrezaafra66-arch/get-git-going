import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Save } from "lucide-react";

import { requireAnyRole } from "@/lib/rbac/route-guards";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { toFaDigits, formatNumber, formatDateFa } from "@/lib/i18n/formatters";
import { PageHeader } from "@/components/common/PageHeader";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { JalaliDateInput } from "@/shared/components/JalaliDateInput";

// Item 132.1 — manual daily performance entry for staff, feeding gamification.
export const Route = createFileRoute("/_app/gamification/admin/manual-metrics")({
  beforeLoad: async () => {
    await requireAnyRole(["admin", "manager", "accountant"]);
  },
  component: ManualMetricsPage,
});

const EDIT_WINDOW_DAYS = 5;

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function daysAgo(iso: string): number {
  const d = new Date(`${iso}T00:00:00`);
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return Math.round((t.getTime() - d.getTime()) / 86_400_000);
}

interface MetricRow {
  id: string;
  metric_date: string;
  staff_user_id: string;
  sales_amount: number;
  profit_amount: number;
  inbound_calls_count: number;
  outbound_calls_count: number;
  talk_time_minutes: number;
  notes: string | null;
}

const EMPTY_FORM = {
  sales_amount: "",
  profit_amount: "",
  inbound_calls_count: "",
  outbound_calls_count: "",
  talk_time_minutes: "",
  notes: "",
};

function ManualMetricsPage() {
  const { roles } = useAuth();
  const qc = useQueryClient();
  const isAdmin = roles.includes("admin");

  const [metricDate, setMetricDate] = useState<string>(todayISO());
  const [staffId, setStaffId] = useState<string>("");
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const age = daysAgo(metricDate);
  const isFuture = age < 0;
  const beyondWindow = age > EDIT_WINDOW_DAYS;
  // Admins may correct older records; everyone else is capped at 5 days.
  const locked = isFuture || (beyondWindow && !isAdmin);

  const staffQ = useQuery({
    queryKey: ["manual-metrics-staff"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("status", "active")
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as { id: string; full_name: string | null }[];
    },
    staleTime: 60_000,
  });

  const existingQ = useQuery({
    queryKey: ["manual-metrics-existing", staffId, metricDate],
    enabled: Boolean(staffId) && Boolean(metricDate),
    queryFn: async (): Promise<MetricRow | null> => {
      const { data, error } = await supabase
        .from("staff_daily_performance_metrics")
        .select(
          "id, metric_date, staff_user_id, sales_amount, profit_amount, inbound_calls_count, outbound_calls_count, talk_time_minutes, notes",
        )
        .eq("staff_user_id", staffId)
        .eq("metric_date", metricDate)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as MetricRow | null;
    },
  });

  // Load the saved row into the form whenever the selection changes.
  useEffect(() => {
    const r = existingQ.data;
    if (!r) {
      setForm({ ...EMPTY_FORM });
      return;
    }
    setForm({
      sales_amount: String(r.sales_amount ?? 0),
      profit_amount: String(r.profit_amount ?? 0),
      inbound_calls_count: String(r.inbound_calls_count ?? 0),
      outbound_calls_count: String(r.outbound_calls_count ?? 0),
      talk_time_minutes: String(r.talk_time_minutes ?? 0),
      notes: r.notes ?? "",
    });
  }, [existingQ.data]);

  const recentQ = useQuery({
    queryKey: ["manual-metrics-recent", staffId],
    enabled: Boolean(staffId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_daily_performance_metrics")
        .select(
          "id, metric_date, staff_user_id, sales_amount, profit_amount, inbound_calls_count, outbound_calls_count, talk_time_minutes, notes",
        )
        .eq("staff_user_id", staffId)
        .order("metric_date", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as MetricRow[];
    },
  });

  const num = (v: string) => {
    const n = Number(String(v).replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!staffId) throw new Error("کارشناس را انتخاب کنید");
      // RPC not yet in generated types — cast the fn name to satisfy the client.
      const { error } = await (
        supabase.rpc as unknown as (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: unknown; error: { message: string } | null }>
      )("upsert_staff_daily_performance_metric", {
        p_staff_user_id: staffId,
        p_metric_date: metricDate,
        p_sales_amount: num(form.sales_amount),
        p_profit_amount: num(form.profit_amount),
        p_inbound_calls_count: Math.round(num(form.inbound_calls_count)),
        p_outbound_calls_count: Math.round(num(form.outbound_calls_count)),
        p_talk_time_minutes: Math.round(num(form.talk_time_minutes)),
        p_notes: form.notes.trim() || null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("عملکرد روزانه ثبت شد و امتیاز به‌روزرسانی شد.");
      qc.invalidateQueries({ queryKey: ["manual-metrics-existing", staffId, metricDate] });
      qc.invalidateQueries({ queryKey: ["manual-metrics-recent", staffId] });
      // Refresh gamification surfaces so the change is visible immediately.
      qc.invalidateQueries({ queryKey: ["gamification-leaderboard"] });
      qc.invalidateQueries({ queryKey: ["employee-scores"] });
      qc.invalidateQueries({ queryKey: ["gamification-analytics"] });
    },
    onError: (e: Error) => toast.error(e.message || "ثبت ناموفق بود"),
  });

  const staffName = useMemo(
    () => (staffQ.data ?? []).find((s) => s.id === staffId)?.full_name ?? "—",
    [staffQ.data, staffId],
  );

  const field = (key: keyof typeof EMPTY_FORM, label: string, unit: string, money = false) => (
    <div className="space-y-1">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          inputMode="numeric"
          dir="ltr"
          className="text-left font-mono"
          disabled={locked || save.isPending}
          value={money && form[key] ? Number(num(form[key])).toLocaleString("en-US") : form[key]}
          onChange={(e) =>
            setForm((f) => ({ ...f, [key]: e.target.value.replace(/[^\d.]/g, "") }))
          }
        />
        <span className="whitespace-nowrap text-xs text-muted-foreground">{unit}</span>
      </div>
    </div>
  );

  return (
    <div className="space-y-6" dir="rtl">
      <PageHeader
        title="ثبت دستی عملکرد روزانه"
        description="ثبت فروش، سود، تماس‌ها و دقایق مکالمهٔ هر کارشناس برای یک روز مشخص"
      />

      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>محدودیت ویرایش</AlertTitle>
        <AlertDescription className="text-xs leading-6">
          ثبت و ویرایش فقط تا {toFaDigits(EDIT_WINDOW_DAYS)} روز گذشته مجاز است.
          {isAdmin && " مدیر سیستم می‌تواند رکوردهای قدیمی‌تر را نیز اصلاح کند."}
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">انتخاب کارشناس و تاریخ</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <Label>کارشناس</Label>
              <Select value={staffId} onValueChange={setStaffId}>
                <SelectTrigger>
                  <SelectValue placeholder="انتخاب کارشناس" />
                </SelectTrigger>
                <SelectContent>
                  {(staffQ.data ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.full_name ?? s.id.slice(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>تاریخ</Label>
              <JalaliDateInput value={metricDate} onChange={setMetricDate} />
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {isFuture ? (
                  <Badge variant="destructive" className="text-[10px]">
                    تاریخ آینده — ثبت مجاز نیست
                  </Badge>
                ) : beyondWindow ? (
                  <Badge variant={isAdmin ? "secondary" : "destructive"} className="text-[10px]">
                    {isAdmin
                      ? `${toFaDigits(age)} روز گذشته — اصلاح مدیریتی`
                      : `${toFaDigits(age)} روز گذشته — خارج از بازهٔ مجاز`}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px]">
                    قابل ویرایش ({toFaDigits(age)} روز گذشته)
                  </Badge>
                )}
                {existingQ.data && (
                  <Badge variant="secondary" className="text-[10px]">
                    رکورد موجود — ویرایش می‌شود
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {locked && (
            <Alert variant="destructive">
              <AlertDescription className="text-xs">
                {isFuture
                  ? "برای تاریخ آینده نمی‌توان عملکرد ثبت کرد."
                  : "ویرایش فقط تا ۵ روز گذشته مجاز است."}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            مقادیر عملکرد {staffId ? `— ${staffName}` : ""}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {field("sales_amount", "مبلغ فروش", "تومان", true)}
            {field("profit_amount", "مبلغ سود", "تومان", true)}
            {field("inbound_calls_count", "تماس ورودی", "تماس")}
            {field("outbound_calls_count", "تماس خروجی", "تماس")}
            {field("talk_time_minutes", "دقایق مکالمه", "دقیقه")}
          </div>
          <div className="space-y-1">
            <Label>توضیح (اختیاری)</Label>
            <Textarea
              rows={2}
              disabled={locked || save.isPending}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>
          <div className="flex justify-end">
            <Button onClick={() => save.mutate()} disabled={locked || !staffId || save.isPending}>
              {save.isPending ? (
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="ml-2 h-4 w-4" />
              )}
              ثبت و به‌روزرسانی امتیاز
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">رکوردهای اخیر</CardTitle>
        </CardHeader>
        <CardContent>
          {!staffId ? (
            <p className="text-sm text-muted-foreground">ابتدا یک کارشناس انتخاب کنید.</p>
          ) : recentQ.isLoading ? (
            <p className="text-sm text-muted-foreground">در حال بارگذاری...</p>
          ) : (recentQ.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              برای این کارشناس هنوز رکوردی ثبت نشده است.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">تاریخ</TableHead>
                    <TableHead className="text-right">فروش</TableHead>
                    <TableHead className="text-right">سود</TableHead>
                    <TableHead className="text-right">ورودی</TableHead>
                    <TableHead className="text-right">خروجی</TableHead>
                    <TableHead className="text-right">دقیقه</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(recentQ.data ?? []).map((r) => (
                    <TableRow
                      key={r.id}
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => setMetricDate(r.metric_date)}
                    >
                      <TableCell>{formatDateFa(r.metric_date)}</TableCell>
                      <TableCell>{formatNumber(Number(r.sales_amount))}</TableCell>
                      <TableCell>{formatNumber(Number(r.profit_amount))}</TableCell>
                      <TableCell>{toFaDigits(r.inbound_calls_count)}</TableCell>
                      <TableCell>{toFaDigits(r.outbound_calls_count)}</TableCell>
                      <TableCell>{toFaDigits(r.talk_time_minutes)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
