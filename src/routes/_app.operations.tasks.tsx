import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatDateFa } from "@/lib/i18n/formatters";

const PAGE_SIZE = 20;

const tasksTable = () => (supabase as any).from("tasks");

type Task = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assigned_queue: string | null;
  proof_requirement: string | null;
  due_date: string | null;
  reference_type: string | null;
  reference_id: string | null;
  created_at: string;
  completed_at: string | null;
};

type NumericValue = number | string | null | undefined;

type TaskKpiRow = {
  section: "overall" | "queue" | "proof" | "status" | string;
  bucket_key: string;
  bucket_label: string;
  task_count: NumericValue;
  open_count: NumericValue;
  pending_count: NumericValue;
  in_progress_count: NumericValue;
  done_count: NumericValue;
  blocked_count: NumericValue;
  canceled_count: NumericValue;
  /** Added by migration 277 (phase 10) — unfinished recurring tasks that expired. */
  expired_count: NumericValue;
  overdue_count: NumericValue;
  due_soon_count: NumericValue;
  avg_completion_hours: NumericValue;
  completion_rate: NumericValue;
  overdue_rate: NumericValue;
  oldest_open_at: string | null;
  newest_task_at: string | null;
};

function statusLabel(s: string) {
  switch (s) {
    case "pending":
      return "در انتظار";
    case "in_progress":
      return "در حال انجام";
    case "done":
      return "انجام‌شده";
    case "blocked":
      return "متوقف";
    case "canceled":
      return "لغو";
    // Phase 10 (224): a recurring marketing task that was not ticked on its own
    // day. It is never carried forward, so it settles here rather than staying
    // "pending" forever.
    case "expired":
      return "منقضی (ناتمام)";
    default:
      return s;
  }
}

function queueLabel(q: string | null) {
  switch (q) {
    case "sales":
      return "فروش";
    case "shipping":
      return "ارسال";
    case "store":
      return "فروشگاه/انبار";
    case "accounting":
      return "حسابداری";
    case "marketing":
      return "بازاریابی";
    default:
      return "—";
  }
}

function proofLabel(p: string | null) {
  switch (p) {
    case "receipt":
      return "رسید تهران";
    case "carrier_waybill_photo":
      return "عکس بیجک باربری";
    case "product_video":
      return "فیلم محصول";
    case "none":
      return "بدون مدرک";
    default:
      return null;
  }
}

// isInvoiceLinkTask() was removed 2026-08-08 with its only caller, the
// "مشاهده پیش‌فاکتور" link. It gated on reference_type in ('invoice','invoice_workflow').
// Those task rows can still exist; they simply no longer render a link to a route that
// no longer exists.

function asNumber(value: NumericValue) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatNumber(value: NumericValue) {
  const n = asNumber(value);
  return n === null ? "—" : Math.round(n).toLocaleString("fa-IR");
}

function formatPercent(value: NumericValue) {
  const n = asNumber(value);
  return n === null ? "—" : `${n.toLocaleString("fa-IR", { maximumFractionDigits: 1 })}٪`;
}

function formatHours(value: NumericValue) {
  const n = asNumber(value);
  return n === null ? "—" : `${n.toLocaleString("fa-IR", { maximumFractionDigits: 1 })} ساعت`;
}

function formatDateOnly(value: string | null) {
  return value ? formatDateFa(value.slice(0, 10)) : "—";
}

function KpiCard({ title, value, hint }: { title: string; value: string; hint: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs text-muted-foreground">{title}</div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
    </div>
  );
}

function KpiTable({ title, rows }: { title: string; rows: TaskKpiRow[] }) {
  if (rows.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="border-b bg-muted/40 px-4 py-2 text-sm font-semibold">{title}</div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[780px] text-sm">
          <thead className="bg-muted/30 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-right">بخش</th>
              <th className="px-3 py-2 text-right">کل</th>
              <th className="px-3 py-2 text-right">باز</th>
              <th className="px-3 py-2 text-right">معوق</th>
              <th className="px-3 py-2 text-right">نزدیک موعد</th>
              <th className="px-3 py-2 text-right">انجام‌شده</th>
              <th className="px-3 py-2 text-right">منقضی</th>
              <th className="px-3 py-2 text-right">نرخ تکمیل</th>
              <th className="px-3 py-2 text-right">نرخ معوق</th>
              <th className="px-3 py-2 text-right">قدیمی‌ترین باز</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.section}:${r.bucket_key}`} className="border-t">
                <td className="px-3 py-2 font-medium">{r.bucket_label}</td>
                <td className="px-3 py-2">{formatNumber(r.task_count)}</td>
                <td className="px-3 py-2">{formatNumber(r.open_count)}</td>
                <td className="px-3 py-2">{formatNumber(r.overdue_count)}</td>
                <td className="px-3 py-2">{formatNumber(r.due_soon_count)}</td>
                <td className="px-3 py-2">{formatNumber(r.done_count)}</td>
                <td className="px-3 py-2">{formatNumber(r.expired_count)}</td>
                <td className="px-3 py-2">{formatPercent(r.completion_rate)}</td>
                <td className="px-3 py-2">{formatPercent(r.overdue_rate)}</td>
                <td className="px-3 py-2">{formatDateOnly(r.oldest_open_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TasksBoardPage() {
  const { roles } = useAuth();
  const canTick = roles.includes("admin") || roles.includes("accountant");
  const [items, setItems] = useState<Task[]>([]);
  const [page, setPage] = useState(0);
  const [count, setCount] = useState(0);
  const [filterStatus, setFilterStatus] = useState<string>("pending");
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [kpiRows, setKpiRows] = useState<TaskKpiRow[]>([]);
  const [kpiDays, setKpiDays] = useState<string>("30");
  const [kpiLoading, setKpiLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    let q = tasksTable()
      .select(
        "id,title,description,status,priority,assigned_queue,proof_requirement,due_date,reference_type,reference_id,created_at,completed_at",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (filterStatus !== "all") q = q.eq("status", filterStatus);
    const { data, error, count: c } = await q;
    setLoading(false);
    if (error) {
      toast.error("خطا در بارگذاری");
      return;
    }
    setItems((data ?? []) as Task[]);
    setCount(c ?? 0);
  };

  const loadKpi = async () => {
    setKpiLoading(true);
    const { data, error } = await (supabase as any).rpc("get_task_kpi_report", {
      p_days: Number(kpiDays),
    });
    setKpiLoading(false);
    if (error) {
      toast.error("خطا در بارگذاری گزارش وظایف");
      return;
    }
    setKpiRows((data ?? []) as TaskKpiRow[]);
  };

  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, [page, filterStatus]);

  useEffect(() => {
    loadKpi(); /* eslint-disable-next-line */
  }, [kpiDays]);

  const startTask = async (id: string) => {
    setActing(id);
    const { error } = await tasksTable()
      .update({ status: "in_progress", updated_at: new Date().toISOString() })
      .eq("id", id);
    setActing(null);
    if (error) {
      toast.error("خطا");
      return;
    }
    toast.success("شروع شد");
    load();
    loadKpi();
  };

  const completeTask = async (t: Task) => {
    setActing(t.id);
    // 2026-08-08: the reference_type === "invoice" branch called complete_invoice_task,
    // which also moved the linked invoice's status. Both that RPC and the invoices table
    // were removed by migration 332 (the subsystem held 0 rows and its UI was deleted in
    // 323). No task row uses that reference_type — measured 0 before removal, against 5
    // marketing_recurring_task rows — so every task now completes through the generic
    // update below, which is the path they already took.
    let error;
    ({ error } = await tasksTable()
      .update({
        status: "done",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", t.id));
    setActing(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("وظیفه تکمیل شد");
    load();
    loadKpi();
  };

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const overall = kpiRows.find((r) => r.section === "overall");
  const queueRows = kpiRows.filter((r) => r.section === "queue");
  const proofRows = kpiRows.filter((r) => r.section === "proof");
  const statusRows = kpiRows.filter((r) => r.section === "status");

  return (
    <div className="space-y-6" dir="rtl">
      <PageHeader
        title="برد وظایف"
        description="وظایف اختصاص‌یافته، بررسی پیش‌فاکتورها و کارهای عملیاتی ارسال/مدرک"
      />

      <div className="space-y-4 rounded-lg border p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">گزارش عملکرد وظایف</h2>
            <p className="text-xs text-muted-foreground">
              نمای مدیریتی از وظایف باز، معوق، نزدیک موعد، تکمیل‌شده و عملکرد صف‌ها
            </p>
          </div>
          <Select value={kpiDays} onValueChange={setKpiDays}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">۷ روز اخیر</SelectItem>
              <SelectItem value="30">۳۰ روز اخیر</SelectItem>
              <SelectItem value="90">۹۰ روز اخیر</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {kpiLoading ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            در حال بارگذاری گزارش...
          </div>
        ) : kpiRows.length === 0 ? (
          <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
            هنوز داده‌ای برای گزارش عملکرد وظایف وجود ندارد.
          </div>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-4">
              <KpiCard
                title="کل وظایف"
                value={formatNumber(overall?.task_count)}
                hint="در بازه انتخابی + وظایف باز قدیمی"
              />
              <KpiCard
                title="وظایف باز"
                value={formatNumber(overall?.open_count)}
                hint={`نزدیک موعد: ${formatNumber(overall?.due_soon_count)}`}
              />
              <KpiCard
                title="وظایف معوق"
                value={formatNumber(overall?.overdue_count)}
                hint={`نرخ معوق: ${formatPercent(overall?.overdue_rate)}`}
              />
              <KpiCard
                title="نرخ تکمیل"
                value={formatPercent(overall?.completion_rate)}
                hint={`میانگین زمان تکمیل: ${formatHours(overall?.avg_completion_hours)}`}
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <KpiTable title="عملکرد به تفکیک صف" rows={queueRows} />
              <KpiTable title="عملکرد به تفکیک مدرک" rows={proofRows} />
            </div>
            <KpiTable title="عملکرد به تفکیک وضعیت" rows={statusRows} />
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={filterStatus}
          onValueChange={(v) => {
            setFilterStatus(v);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">همه</SelectItem>
            <SelectItem value="pending">در انتظار</SelectItem>
            <SelectItem value="in_progress">در حال انجام</SelectItem>
            <SelectItem value="done">انجام‌شده</SelectItem>
            <SelectItem value="blocked">متوقف</SelectItem>
            <SelectItem value="expired">منقضی (ناتمام)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border">
        {loading ? (
          <div className="p-6 text-center text-sm text-muted-foreground">در حال بارگذاری...</div>
        ) : items.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">وظیفه‌ای یافت نشد</div>
        ) : (
          items.map((t) => {
            const proof = proofLabel(t.proof_requirement);
            return (
              <div key={t.id} className="border-b p-4 last:border-b-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-sm">{t.title}</span>
                      <Badge variant={t.status === "done" ? "secondary" : "outline"}>
                        {statusLabel(t.status)}
                      </Badge>
                      {t.assigned_queue && (
                        <Badge variant="outline">صف: {queueLabel(t.assigned_queue)}</Badge>
                      )}
                      {proof && <Badge variant="secondary">مدرک: {proof}</Badge>}
                      {t.due_date && (
                        <Badge variant="outline">مهلت: {formatDateFa(t.due_date)}</Badge>
                      )}
                    </div>
                    {t.description && (
                      <p className="text-xs text-muted-foreground whitespace-pre-line">
                        {t.description}
                      </p>
                    )}
                    {/* 2026-08-08: the "مشاهده پیش‌فاکتور" link pointed at /sales/invoices/$invoiceId,
                        removed with the invoice routes (migration 323). The invoices table held 0
                        rows, so this link could never resolve to a real document. The task itself,
                        its description and its tick action are unchanged. */}
                  </div>
                  {canTick && t.status !== "done" && t.status !== "canceled" && (
                    <div className="flex flex-col gap-2">
                      {t.status === "pending" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => startTask(t.id)}
                          disabled={acting === t.id}
                        >
                          شروع
                        </Button>
                      )}
                      <Button size="sm" onClick={() => completeTask(t)} disabled={acting === t.id}>
                        {acting === t.id ? (
                          <Loader2 className="ml-1 h-3 w-3 animate-spin" />
                        ) : (
                          <CheckCircle2 className="ml-1 h-3 w-3" />
                        )}
                        تکمیل
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
          >
            قبلی
          </Button>
          <span className="text-xs text-muted-foreground">
            صفحه {page + 1} از {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page + 1 >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            بعدی
          </Button>
        </div>
      )}
    </div>
  );
}

export const Route = createFileRoute("/_app/operations/tasks")({
  component: TasksBoardPage,
});
