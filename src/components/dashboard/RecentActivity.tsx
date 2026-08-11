import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Loader2 } from "lucide-react";
import { useRecentEvents } from "@/hooks/dashboard/useDashboardStats";
import { timeAgoFa } from "@/lib/dashboard/utils";

const TYPE_DOT: Record<string, string> = {
  inquiry_created: "bg-blue-500",
  inquiry_answered: "bg-emerald-500",
  penalty_created: "bg-red-500",
  document_confirmed: "bg-emerald-500",
  document_rejected: "bg-red-500",
  delivery_receipt_uploaded: "bg-violet-500",
  purchase_request_created: "bg-amber-500",
  purchase_request_status_changed: "bg-amber-500",
};

export function RecentActivity() {
  const { data, isLoading } = useRecentEvents(10);
  const rows = data ?? [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Activity className="h-4 w-4 text-primary" />
          فعالیت‌های اخیر
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex h-32 items-center justify-center text-muted-foreground">
            <Loader2 className="ms-2 h-4 w-4 animate-spin" /> در حال بارگذاری...
          </div>
        ) : rows.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            هیچ فعالیت تازه‌ای ثبت نشده است.
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {rows.map((r) => (
              <li key={r.id} className="flex items-start gap-3 py-2.5">
                <span
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                    TYPE_DOT[r.type] ?? "bg-muted-foreground/40"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-foreground">{r.title}</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {timeAgoFa(r.createdAt)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}