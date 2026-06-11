import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { POPUP_TTL_MS, usePopupCenter } from "@/lib/popups/PopupCenterProvider";

function relativeFa(ts: number): string {
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return "هم‌اکنون";
  if (diff < 3600) return `${Math.floor(diff / 60)} دقیقه پیش`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ساعت پیش`;
  return `${Math.floor(diff / 86400)} روز پیش`;
}

function PopupCenterPage() {
  const { items, markSeen, clearAll } = usePopupCenter();
  const ttlHours = Math.round(POPUP_TTL_MS / (60 * 60 * 1000));

  return (
    <div className="space-y-6">
      <PageHeader
        title="مرکز اعلان‌ها"
        description={`پاپ‌آپ‌های مشاهده‌نشدهٔ شما (نگه‌داری حداکثر ${ttlHours} ساعت)`}
      />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">تعداد:</span>
          <Badge variant={items.length ? "destructive" : "secondary"}>{items.length}</Badge>
        </div>
        <Button variant="outline" size="sm" onClick={clearAll} disabled={items.length === 0}>
          همه را دیدم
        </Button>
      </div>

      <div className="rounded-lg border">
        {items.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            پاپ‌آپ مشاهده‌نشده‌ای وجود ندارد
          </div>
        ) : (
          items.map((n) => (
            <div
              key={n.id}
              className="flex items-start justify-between gap-3 border-b px-4 py-3 last:border-b-0"
            >
              <div className="min-w-0 flex-1 text-right">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{n.title}</span>
                  <span className="text-xs text-muted-foreground">{relativeFa(n.createdAt)}</span>
                </div>
                <p className="mt-1 whitespace-pre-line text-xs text-muted-foreground">{n.body}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => markSeen(n.id)}>
                دیده شد
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_app/popup-center")({
  component: PopupCenterPage,
});
