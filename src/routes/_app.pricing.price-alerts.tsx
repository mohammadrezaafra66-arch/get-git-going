import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff, CheckCheck, Edit, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { requireAnyRole } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/common/EmptyState";
import { PriceAlertDialog } from "@/components/pricing/price-alerts/PriceAlertDialog";
import {
  fetchMyAlerts, fetchMyNotifications, toggleAlertRule, deleteAlertRule,
  markNotificationRead, markAllNotificationsRead,
  OPERATOR_LABELS, type PriceAlertRule, type PriceAlertNotification,
} from "@/lib/pricing/price-alerts";
import { formatNumber, formatDateTimeFa } from "@/lib/i18n/formatters";

export const Route = createFileRoute("/_app/pricing/price-alerts")({
  beforeLoad: async () => {
    await requireAnyRole(["admin", "manager", "accountant", "sales"]);
  },
  component: PriceAlertsPage,
});

const PAGE_SIZE = 20;

function PriceAlertsPage() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PriceAlertRule | null>(null);
  const [rulesPage, setRulesPage] = useState(1);
  const [notifPage, setNotifPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);

  const rulesQuery = useQuery({
    queryKey: ["my-price-alerts", rulesPage],
    queryFn: () => fetchMyAlerts({ page: rulesPage, pageSize: PAGE_SIZE }),
    staleTime: 15_000,
  });

  const notifQuery = useQuery({
    queryKey: ["my-price-alert-notifications", notifPage, unreadOnly],
    queryFn: () => fetchMyNotifications({ page: notifPage, pageSize: PAGE_SIZE, unreadOnly }),
    staleTime: 10_000,
  });

  function openCreate() { setEditing(null); setDialogOpen(true); }
  function openEdit(r: PriceAlertRule) { setEditing(r); setDialogOpen(true); }

  async function onToggle(r: PriceAlertRule, v: boolean) {
    try {
      await toggleAlertRule(r.id, v);
      qc.invalidateQueries({ queryKey: ["my-price-alerts"] });
    } catch (e: any) { toast.error(e?.message ?? "خطا"); }
  }

  async function onDelete(r: PriceAlertRule) {
    if (!confirm("هشدار حذف شود؟")) return;
    try {
      await deleteAlertRule(r.id);
      toast.success("هشدار حذف شد.");
      qc.invalidateQueries({ queryKey: ["my-price-alerts"] });
    } catch (e: any) { toast.error(e?.message ?? "خطا"); }
  }

  async function onMarkRead(n: PriceAlertNotification) {
    try {
      await markNotificationRead(n.id, true);
      qc.invalidateQueries({ queryKey: ["my-price-alert-notifications"] });
    } catch (e: any) { toast.error(e?.message ?? "خطا"); }
  }

  async function onMarkAllRead() {
    try {
      await markAllNotificationsRead();
      qc.invalidateQueries({ queryKey: ["my-price-alert-notifications"] });
    } catch (e: any) { toast.error(e?.message ?? "خطا"); }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="مرکز هشدار قیمت"
        description="برای محصولات دلخواه خود شرط قیمت تعریف کنید و هنگام تغییر مهم قیمت مطلع شوید."
        actions={
          <Button onClick={openCreate}>
            <Plus className="ml-1 h-4 w-4" /> ایجاد هشدار جدید
          </Button>
        }
      />

      <Tabs defaultValue="rules">
        <TabsList>
          <TabsTrigger value="rules">هشدارهای من</TabsTrigger>
          <TabsTrigger value="notifications">اعلان‌ها</TabsTrigger>
        </TabsList>

        <TabsContent value="rules" className="mt-4">
          {rulesQuery.isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (rulesQuery.data?.rows.length ?? 0) === 0 ? (
            <EmptyState
              icon={Bell}
              title="هنوز هشداری ندارید"
              description="با کلیک روی «ایجاد هشدار جدید»، اولین شرط قیمت خود را بسازید."
            />
          ) : (
            <div className="space-y-3">
              {rulesQuery.data!.rows.map((r) => (
                <Card key={r.id}>
                  <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-foreground">{r.product?.name ?? "—"}</span>
                        {r.sale_price_type?.title && (
                          <Badge variant="secondary">{r.sale_price_type.title}</Badge>
                        )}
                        {r.is_repeatable && <Badge variant="outline">تکرارپذیر</Badge>}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {OPERATOR_LABELS[r.operator]}
                        {r.target_value !== null && (
                          <span className="mx-1">— مقدار: {formatNumber(Number(r.target_value))} {r.target_currency === "usd" ? "دلار" : r.operator.endsWith("_percent") ? "٪" : "تومان"}</span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        فعال‌شدن: {r.triggered_count}× {r.last_triggered_at && <>· آخرین: {formatDateTimeFa(r.last_triggered_at)}</>}
                      </div>
                      {r.note && <p className="text-xs text-muted-foreground">یادداشت: {r.note}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Switch checked={r.is_active} onCheckedChange={(v) => onToggle(r, v)} />
                        <span>{r.is_active ? "فعال" : "غیرفعال"}</span>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(r)} aria-label="ویرایش">
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => onDelete(r)} aria-label="حذف">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
              <Pagination
                page={rulesPage}
                total={rulesQuery.data!.total}
                pageSize={PAGE_SIZE}
                onChange={setRulesPage}
              />
            </div>
          )}
        </TabsContent>

        <TabsContent value="notifications" className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs">
              <Switch checked={unreadOnly} onCheckedChange={(v) => { setUnreadOnly(v); setNotifPage(1); }} />
              <span>فقط خوانده‌نشده</span>
            </div>
            <Button variant="outline" size="sm" onClick={onMarkAllRead}>
              <CheckCheck className="ml-1 h-4 w-4" /> همه را خوانده کن
            </Button>
          </div>

          {notifQuery.isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (notifQuery.data?.rows.length ?? 0) === 0 ? (
            <EmptyState icon={BellOff} title="اعلانی وجود ندارد" description="هنوز هیچ هشداری برای شما فعال نشده است." />
          ) : (
            <div className="space-y-2">
              {notifQuery.data!.rows.map((n) => (
                <Card key={n.id} className={n.is_read ? "opacity-70" : ""}>
                  <CardContent className="flex items-start justify-between gap-3 p-3">
                    <div className="space-y-1">
                      <div className="text-sm font-semibold">{n.title}</div>
                      <div className="text-sm text-muted-foreground">{n.message}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatDateTimeFa(n.created_at)}
                        {n.current_price !== null && <> · فعلی: {formatNumber(Number(n.current_price))}</>}
                        {n.previous_price !== null && <> · قبلی: {formatNumber(Number(n.previous_price))}</>}
                        {n.change_percent !== null && <> · تغییر: {formatNumber(Number(n.change_percent))}%</>}
                      </div>
                    </div>
                    {!n.is_read && (
                      <Button variant="ghost" size="sm" onClick={() => onMarkRead(n)}>خواندم</Button>
                    )}
                  </CardContent>
                </Card>
              ))}
              <Pagination
                page={notifPage}
                total={notifQuery.data!.total}
                pageSize={PAGE_SIZE}
                onChange={setNotifPage}
              />
            </div>
          )}
        </TabsContent>
      </Tabs>

      <PriceAlertDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />
    </div>
  );
}

function Pagination({ page, total, pageSize, onChange }: { page: number; total: number; pageSize: number; onChange: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between text-xs text-muted-foreground">
      <span>صفحه {page} از {pages} — مجموع {total}</span>
      <div className="flex gap-1">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>قبلی</Button>
        <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>بعدی</Button>
      </div>
    </div>
  );
}