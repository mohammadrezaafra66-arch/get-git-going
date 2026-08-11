import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Loader2, CircleAlert, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { formatDateFa } from "@/lib/i18n/formatters";
import { tehranToday } from "@/lib/marketing/tehran-date";

/**
 * Phase 10 / requirement 224 — the marketer's daily checklist.
 *
 * Mobile-first on purpose: this is ticked on a phone, standing in a shop, not
 * at a desk. Hence full-width cards, a large tap target, and no table.
 *
 * It reads the SAME `tasks` table as /operations/tasks. That page is a
 * manager's board (filters, KPI tables, admin/accountant-only ticking); this
 * one is the assignee's own list. Two views, one task system — building a
 * second task table is explicitly forbidden.
 *
 * The owner's binding rules are visible in the UI, not just enforced server
 * side: no evidence upload, no approval step, and yesterday's unfinished work
 * shown as «منقضی» rather than silently reappearing in today's list.
 */

type MarketingTask = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  due_date: string;
  completed_at: string | null;
};

const HISTORY_DAYS = 7;

function statusBadge(status: string) {
  switch (status) {
    case "done":
      return <Badge variant="secondary">انجام‌شده</Badge>;
    case "expired":
      return <Badge variant="destructive">منقضی (ناتمام)</Badge>;
    case "in_progress":
      return <Badge variant="outline">در حال انجام</Badge>;
    default:
      return <Badge variant="outline">در انتظار</Badge>;
  }
}

function MyMarketingTasksPage() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [items, setItems] = useState<MarketingTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  // "Today" must be the Tehran day, not the browser's. A marketer in another
  // timezone — or simply a phone whose clock is off — must still see the same
  // day the server generated and will accept a tick for.
  const today = useMemo(() => tehranToday(), []);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const since = new Date(`${today}T00:00:00Z`);
    since.setUTCDate(since.getUTCDate() - HISTORY_DAYS);
    const sinceStr = since.toISOString().slice(0, 10);

    const { data, error } = await (supabase as any)
      .from("tasks")
      .select("id,title,description,status,due_date,completed_at")
      .eq("reference_type", "marketing_recurring_task")
      .eq("assigned_to", userId)
      .gte("due_date", sinceStr)
      .order("due_date", { ascending: false })
      .order("title", { ascending: true })
      .limit(200);

    setLoading(false);
    if (error) {
      toast.error("خطا در بارگذاری وظایف");
      return;
    }
    setItems((data ?? []) as MarketingTask[]);
  }, [userId, today]);

  useEffect(() => {
    void load();
  }, [load]);

  const complete = async (t: MarketingTask) => {
    setActing(t.id);
    const { error } = await (supabase as any).rpc("complete_marketing_task", {
      p_task_id: t.id,
    });
    setActing(null);
    if (error) {
      // The database raises Persian messages for expiry, wrong day and
      // already-done, so show them verbatim rather than a generic string.
      toast.error(error.message);
      void load();
      return;
    }
    toast.success("ثبت شد. امتیاز شما به‌روزرسانی شد.");
    void load();
  };

  const todayItems = items.filter((t) => t.due_date === today);
  const pastItems = items.filter((t) => t.due_date !== today);
  const doneToday = todayItems.filter((t) => t.status === "done").length;

  return (
    <div className="space-y-6" dir="rtl">
      <PageHeader
        title="وظایف بازاریابی امروز"
        description="تیک‌زدن بدون نیاز به مدرک و بدون تأیید مدیر. کار ناتمام به فردا منتقل نمی‌شود."
      />

      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
        <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="font-medium">{formatDateFa(today)}</span>
        <span className="text-muted-foreground">
          — {doneToday.toLocaleString("fa-IR")} از {todayItems.length.toLocaleString("fa-IR")} انجام
          شد
        </span>
      </div>

      {loading ? (
        <div className="p-6 text-center text-sm text-muted-foreground">در حال بارگذاری...</div>
      ) : todayItems.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          امروز وظیفهٔ بازاریابی‌ای برای شما ثبت نشده است.
        </div>
      ) : (
        <div className="space-y-3">
          {todayItems.map((t) => {
            const isDone = t.status === "done";
            return (
              <div
                key={t.id}
                className={`rounded-lg border p-4 ${isDone ? "bg-muted/40" : "bg-card"}`}
              >
                <div className="flex flex-col gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold">{t.title}</span>
                      {statusBadge(t.status)}
                    </div>
                    {t.description && (
                      <p className="whitespace-pre-line text-xs text-muted-foreground">
                        {t.description}
                      </p>
                    )}
                  </div>

                  {isDone ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      انجام شد
                    </div>
                  ) : (
                    <Button
                      className="h-12 w-full text-base"
                      onClick={() => void complete(t)}
                      disabled={acting === t.id}
                    >
                      {acting === t.id ? (
                        <Loader2 className="ml-2 h-5 w-5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="ml-2 h-5 w-5" />
                      )}
                      انجام شد
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {pastItems.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold">کارنامهٔ روزهای گذشته</h2>
            <span className="text-xs text-muted-foreground">
              ({HISTORY_DAYS.toLocaleString("fa-IR")} روز اخیر)
            </span>
          </div>
          <div className="rounded-lg border">
            {pastItems.map((t) => (
              <div
                key={t.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b p-3 text-sm last:border-b-0"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="truncate font-medium">{t.title}</span>
                  <span className="text-xs text-muted-foreground">{formatDateFa(t.due_date)}</span>
                </div>
                {statusBadge(t.status)}
              </div>
            ))}
          </div>
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            وظیفهٔ ناتمام یک روز، فردا دوباره ساخته نمی‌شود؛ به‌صورت «منقضی» ثبت می‌ماند و در گزارش
            عملکرد دیده می‌شود.
          </p>
        </div>
      )}
    </div>
  );
}

export const Route = createFileRoute("/_app/marketing/my-tasks")({
  component: MyMarketingTasksPage,
});
