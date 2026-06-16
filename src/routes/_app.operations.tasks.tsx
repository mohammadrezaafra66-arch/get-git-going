import { createFileRoute, Link } from "@tanstack/react-router";
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
import { CheckCircle2, Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { formatDateFa } from "@/lib/i18n/formatters";

const PAGE_SIZE = 20;

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

function isInvoiceLinkTask(t: Task) {
  return (
    (t.reference_type === "invoice" || t.reference_type === "invoice_workflow") && !!t.reference_id
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

  const load = async () => {
    setLoading(true);
    let q = supabase
      .from("tasks")
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

  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, [page, filterStatus]);

  const startTask = async (id: string) => {
    setActing(id);
    const { error } = await supabase
      .from("tasks")
      .update({ status: "in_progress", updated_at: new Date().toISOString() })
      .eq("id", id);
    setActing(null);
    if (error) {
      toast.error("خطا");
      return;
    }
    toast.success("شروع شد");
    load();
  };

  const completeTask = async (t: Task) => {
    setActing(t.id);
    let error;
    if (t.reference_type === "invoice") {
      ({ error } = await supabase.rpc("complete_invoice_task", { p_task_id: t.id }));
    } else {
      ({ error } = await supabase
        .from("tasks")
        .update({
          status: "done",
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", t.id));
    }
    setActing(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("وظیفه تکمیل شد");
    load();
  };

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  return (
    <div className="space-y-6" dir="rtl">
      <PageHeader
        title="برد وظایف"
        description="وظایف اختصاص‌یافته، بررسی پیش‌فاکتورها و کارهای عملیاتی ارسال/مدرک"
      />

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
                    {isInvoiceLinkTask(t) && (
                      <Button asChild variant="link" size="sm" className="h-auto p-0 text-xs">
                        <Link
                          to="/sales/invoices/$invoiceId"
                          params={{ invoiceId: t.reference_id! }}
                        >
                          <ExternalLink className="ml-1 h-3 w-3" /> مشاهده پیش‌فاکتور
                        </Link>
                      </Button>
                    )}
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
