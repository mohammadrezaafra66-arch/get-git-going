import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { requireAdmin } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_app/admin/recent-purchase-settings")({
  // Wave 2 / B-1 — the client half of the guard below. `beforeLoad` runs only on the server
  // for a direct navigation and cannot see a localStorage session, so RouteRoleGate reads this.
  // Mirrors requireAdmin() below.
  staticData: { gate: { kind: "admin" } },
  beforeLoad: async () => {
    await requireAdmin();
  },
  component: RecentPurchaseSettingsPage,
});

type Row = {
  id: string;
  limited_after_hours: number;
  unavailable_after_hours: number;
  updated_at: string;
};

function RecentPurchaseSettingsPage() {
  const qc = useQueryClient();
  const [limited, setLimited] = useState<string>("6");
  const [unavail, setUnavail] = useState<string>("12");
  const [saving, setSaving] = useState(false);

  const q = useQuery({
    queryKey: ["recent-purchase-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recent_purchase_settings")
        .select("id,limited_after_hours,unavailable_after_hours,updated_at")
        .eq("singleton", true)
        .maybeSingle();
      if (error) throw error;
      return data as Row | null;
    },
  });

  useEffect(() => {
    if (q.data) {
      setLimited(String(q.data.limited_after_hours));
      setUnavail(String(q.data.unavailable_after_hours));
    }
  }, [q.data]);

  const onSave = async () => {
    const lim = Number(limited);
    const una = Number(unavail);
    if (!Number.isFinite(lim) || !Number.isFinite(una) || lim <= 0 || una <= lim) {
      toast.error("ساعات نامعتبر است. ساعات «ناموجود» باید بزرگ‌تر از «محدود» باشد.");
      return;
    }
    if (!q.data) {
      toast.error("تنظیمات یافت نشد.");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("recent_purchase_settings")
      .update({ limited_after_hours: lim, unavailable_after_hours: una })
      .eq("id", q.data.id);
    setSaving(false);
    if (error) {
      toast.error("ذخیره با خطا مواجه شد: " + error.message);
      return;
    }
    toast.success("تنظیمات ذخیره شد.");
    qc.invalidateQueries({ queryKey: ["recent-purchase-settings"] });
    qc.invalidateQueries({ queryKey: ["recent-purchase-label"] });
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="تنظیمات وضعیت موجودی پس از خرید"
        description="تعیین ساعات تبدیل به «موجودی محدود» و «ناموجود» پس از ثبت خرید برای هر محصول."
      />
      <Card>
        <CardContent className="space-y-4 p-4">
          {q.isLoading ? (
            <Skeleton className="h-24" />
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="limited">پس از چند ساعت به «موجودی محدود» تبدیل شود؟</Label>
                <Input
                  id="limited"
                  type="number"
                  min="0.1"
                  step="0.5"
                  value={limited}
                  onChange={(e) => setLimited(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">پیش‌فرض: ۶ ساعت</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="unavail">
                  پس از چند ساعت «ناموجود» شود و برچسب «خرید روز» برداشته شود؟
                </Label>
                <Input
                  id="unavail"
                  type="number"
                  min="0.2"
                  step="0.5"
                  value={unavail}
                  onChange={(e) => setUnavail(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">
                  پیش‌فرض: ۱۲ ساعت — باید بزرگ‌تر از مقدار بالا باشد.
                </p>
              </div>
              <Button onClick={onSave} disabled={saving}>
                {saving ? (
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="ml-2 h-4 w-4" />
                )}
                ذخیره تنظیمات
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
