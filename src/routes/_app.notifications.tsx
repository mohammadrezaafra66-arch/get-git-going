import { createFileRoute, useNavigate } from "@tanstack/react-router";
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
import { toast } from "sonner";

const PAGE_SIZE = 20;

type N = {
  id: string;
  title: string;
  body: string;
  type: string;
  reference_type: string | null;
  reference_id: string | null;
  is_read: boolean;
  created_at: string;
};

function relativeFa(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "هم‌اکنون";
  if (diff < 3600) return `${Math.floor(diff / 60)} دقیقه پیش`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ساعت پیش`;
  return `${Math.floor(diff / 86400)} روز پیش`;
}

function NotificationsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<N[]>([]);
  const [page, setPage] = useState(0);
  const [count, setCount] = useState(0);
  const [filterType, setFilterType] = useState<string>("all");
  const [filterRead, setFilterRead] = useState<string>("all");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    let q = supabase
      .from("notification_queue")
      .select("id,title,body,type,reference_type,reference_id,is_read,created_at", {
        count: "exact",
      })
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (filterType !== "all") q = q.eq("type", filterType);
    if (filterRead === "unread") q = q.eq("is_read", false);
    if (filterRead === "read") q = q.eq("is_read", true);
    const { data, error, count: c } = await q;
    setLoading(false);
    if (error) {
      toast.error("خطا در بارگذاری");
      return;
    }
    setItems((data ?? []) as N[]);
    setCount(c ?? 0);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, page, filterType, filterRead]);

  const onClick = async (n: N) => {
    if (!n.is_read) {
      await supabase.rpc("mark_notification_read", { p_notification_id: n.id });
    }
    if (n.reference_type === "stock_alert_request") {
      navigate({ to: "/sales/stock-alerts" });
    } else if (n.reference_type === "sales_quote" && n.reference_id) {
      navigate({ to: "/sales/quotes/$quoteId", params: { quoteId: n.reference_id } });
    }
  };

  const markAll = async () => {
    const { error } = await supabase.rpc("mark_all_notifications_read");
    if (error) {
      toast.error("خطا");
      return;
    }
    toast.success("همه خوانده شد");
    load();
  };

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <PageHeader title="نوتیفیکیشن‌ها" description="لیست تمام اعلان‌های داخلی شما" />

      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={filterType}
          onValueChange={(v) => {
            setFilterType(v);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="نوع" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">همه نوع‌ها</SelectItem>
            <SelectItem value="stock_alert">موجودی کالا</SelectItem>
            <SelectItem value="system">سیستم</SelectItem>
            <SelectItem value="task">کار</SelectItem>
            <SelectItem value="payment">پرداخت</SelectItem>
            <SelectItem value="quote_rejected">رد پیش‌فاکتور</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={filterRead}
          onValueChange={(v) => {
            setFilterRead(v);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="وضعیت" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">همه</SelectItem>
            <SelectItem value="unread">خوانده‌نشده</SelectItem>
            <SelectItem value="read">خوانده‌شده</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={markAll}>
          علامت همه به‌عنوان خوانده‌شده
        </Button>
      </div>

      <div className="rounded-lg border">
        {loading ? (
          <div className="p-6 text-center text-sm text-muted-foreground">در حال بارگذاری...</div>
        ) : items.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">نوتیفیکیشنی یافت نشد</div>
        ) : (
          items.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => onClick(n)}
              className={`block w-full border-b px-4 py-3 text-right last:border-b-0 hover:bg-accent ${
                n.is_read ? "opacity-70" : "bg-primary/5"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{n.title}</span>
                  {!n.is_read && (
                    <Badge variant="destructive" className="text-[10px]">
                      جدید
                    </Badge>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">{relativeFa(n.created_at)}</span>
              </div>
              <p className="mt-1 whitespace-pre-line text-xs text-muted-foreground">{n.body}</p>
            </button>
          ))
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

export const Route = createFileRoute("/_app/notifications")({
  component: NotificationsPage,
});
