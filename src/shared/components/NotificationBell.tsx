import { useEffect, useMemo, useState } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { toast } from "sonner";

type NotificationRow = {
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
  if (diff < 86400 * 2) return "دیروز";
  return `${Math.floor(diff / 86400)} روز پیش`;
}

export function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [open, setOpen] = useState(false);

  const unread = useMemo(() => items.filter((i) => !i.is_read).length, [items]);

  const load = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("notification_queue")
      .select("id,title,body,type,reference_type,reference_id,is_read,created_at")
      .order("created_at", { ascending: false })
      .limit(10);
    if (!error && data) setItems(data as NotificationRow[]);
  };

  useEffect(() => {
    if (!user) return;
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const onItemClick = async (n: NotificationRow) => {
    if (!n.is_read) {
      await supabase.rpc("mark_notification_read", { p_notification_id: n.id });
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
    }
    setOpen(false);
    if (n.reference_type === "stock_alert_request") {
      navigate({ to: "/sales/stock-alerts" });
    } else if (n.reference_type === "sales_quote" && n.reference_id) {
      navigate({ to: "/sales/quotes/$quoteId", params: { quoteId: n.reference_id } });
    } else {
      navigate({ to: "/notifications" });
    }
  };

  const markAll = async () => {
    const { error } = await supabase.rpc("mark_all_notifications_read");
    if (error) {
      toast.error("خطا در علامت‌گذاری");
      return;
    }
    setItems((prev) => prev.map((x) => ({ ...x, is_read: true })));
    toast.success("همه خوانده شد");
  };

  if (!user) return null;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="نوتیفیکیشن‌ها">
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[10px]"
            >
              {unread > 9 ? "9+" : unread}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-semibold">نوتیفیکیشن‌ها</span>
          <button
            type="button"
            className="text-xs text-primary hover:underline"
            onClick={markAll}
            disabled={unread === 0}
          >
            علامت همه به‌عنوان خوانده‌شده
          </button>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {items.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              نوتیفیکیشنی وجود ندارد
            </div>
          ) : (
            items.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => onItemClick(n)}
                className={`block w-full border-b px-3 py-2 text-right text-xs hover:bg-accent ${
                  n.is_read ? "opacity-70" : "bg-primary/5"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-foreground">
                    {n.type === "birthday" ? "🎂 " : ""}
                    {n.type === "quote_rejected" ? "رد پیش‌فاکتور: " : ""}
                    {n.title}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {relativeFa(n.created_at)}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 whitespace-pre-line text-muted-foreground">
                  {n.body}
                </p>
              </button>
            ))
          )}
        </div>
        <div className="border-t p-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => {
              setOpen(false);
              navigate({ to: "/notifications" });
            }}
          >
            مشاهده همه
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
