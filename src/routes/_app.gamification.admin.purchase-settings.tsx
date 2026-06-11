import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Coins, Loader2, Save } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { requireAnyRole } from "@/lib/rbac/route-guards";
import { toFaDigits } from "@/lib/i18n/formatters";

import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";

export const Route = createFileRoute("/_app/gamification/admin/purchase-settings")({
  beforeLoad: async () => { await requireAnyRole(["admin", "manager", "accountant"]); },
  component: PurchaseGamificationSettingsPage,
});

const KEYS = [
  "accountant_daily_interest_rate",
  "purchase_score_enabled",
  "purchase_score_grace_days",
] as const;

type SettingsMap = {
  accountant_daily_interest_rate: string;
  purchase_score_enabled: string;
  purchase_score_grace_days: string;
};

function PurchaseGamificationSettingsPage() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["purchase-gamification-settings"],
    queryFn: async (): Promise<SettingsMap> => {
      const { data, error } = await supabase
        .from("shop_settings")
        .select("key, value")
        .in("key", KEYS as unknown as string[]);
      if (error) throw error;
      const map: SettingsMap = {
        accountant_daily_interest_rate: "0.001",
        purchase_score_enabled: "true",
        purchase_score_grace_days: "2",
      };
      for (const row of data ?? []) {
        const k = (row as { key: string }).key;
        if ((KEYS as readonly string[]).includes(k)) {
          (map as Record<string, string>)[k] = (row as { value: string }).value ?? "";
        }
      }
      return map;
    },
  });

  const [rate, setRate] = useState("0.001");
  const [enabled, setEnabled] = useState(true);
  const [grace, setGrace] = useState("2");

  useEffect(() => {
    if (!data) return;
    setRate(data.accountant_daily_interest_rate || "0.001");
    setEnabled((data.purchase_score_enabled ?? "true") === "true");
    setGrace(data.purchase_score_grace_days || "2");
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      const rateNum = Number(rate);
      if (!Number.isFinite(rateNum) || rateNum < 0 || rateNum > 1) {
        throw new Error("نرخ بهره روزانه باید بین ۰ و ۱ باشد");
      }
      const graceNum = Number(grace);
      if (!Number.isInteger(graceNum) || graceNum < 0 || graceNum > 90) {
        throw new Error("روزهای ارفاق باید عدد صحیح بین ۰ تا ۹۰ باشد");
      }
      const rows = [
        { key: "accountant_daily_interest_rate", value: String(rateNum) },
        { key: "purchase_score_enabled", value: enabled ? "true" : "false" },
        { key: "purchase_score_grace_days", value: String(graceNum) },
      ];
      for (const r of rows) {
        const { error } = await supabase
          .from("shop_settings")
          .upsert(r, { onConflict: "key" });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("تنظیمات ذخیره شد");
      qc.invalidateQueries({ queryKey: ["purchase-gamification-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const annualPct = useMemo(() => {
    const r = Number(rate);
    if (!Number.isFinite(r)) return "—";
    return toFaDigits((r * 365 * 100).toFixed(1)) + "٪";
  }, [rate]);

  const dailyPct = useMemo(() => {
    const r = Number(rate);
    if (!Number.isFinite(r)) return "—";
    return toFaDigits((r * 100).toFixed(3)) + "٪";
  }, [rate]);

  // Preview: cash 100k, term 120k, 30 days
  const previewScore = useMemo(() => {
    const cash = 100_000;
    const term = 120_000;
    const days = 30;
    const amount = term * 1;
    const ref = Number(rate);
    if (!Number.isFinite(ref)) return "—";
    const implied = ((term - cash) / cash) / days;
    const raw = (ref - implied) * days * amount;
    const final = Math.max(0, Math.round((raw / 100000) * 100) / 100);
    return toFaDigits(final.toString());
  }, [rate]);

  return (
    <div className="space-y-4 pb-10" dir="rtl">
      <PageHeader
        title="طلای زمان — تنظیمات گیمیفیکیشن خرید"
        description="نرخ بهره روزانه‌ی مرجع، کلید فعال‌سازی و روزهای ارفاق دیرکرد را اینجا تنظیم کنید"
      />

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Coins className="h-5 w-5 text-amber-500" />
                نرخ بهره روزانه‌ی مرجع
              </CardTitle>
              <CardDescription>
                این عدد، «هزینه‌ی منصفانه‌ی نگهداری پول به ازای هر روز» است. خریدی که گرانی روزانه‌ی آن کمتر از این عدد باشد امتیاز مثبت می‌گیرد.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Label htmlFor="rate">نرخ روزانه (اعشاری — مثلاً ۰.۰۰۱ یعنی ۰.۱٪ روزانه)</Label>
              <Input
                id="rate"
                type="number"
                step="0.0001"
                min="0"
                max="1"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
              />
              <div className="rounded-md bg-muted/40 p-3 text-xs leading-6">
                <div>روزانه: <strong>{dailyPct}</strong></div>
                <div>سالانه (تقریبی): <strong>{annualPct}</strong></div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>کلیدهای کنترلی</CardTitle>
              <CardDescription>فعال/خاموش بودن امتیازدهی خرید و روزهای ارفاق دیرکرد حسابدار</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <div className="font-medium">امتیازدهی خرید فعال است</div>
                  <div className="text-xs text-muted-foreground">با خاموش کردن، هیچ امتیازی برای خرید/پرداخت ثبت نمی‌شود</div>
                </div>
                <Switch checked={enabled} onCheckedChange={setEnabled} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="grace">روزهای ارفاق دیرکرد حسابدار</Label>
                <Input
                  id="grace"
                  type="number"
                  step="1"
                  min="0"
                  max="90"
                  value={grace}
                  onChange={(e) => setGrace(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">
                  پرداخت تا این تعداد روز بعد از مهلت، جریمه نمی‌شود.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>پیش‌نمایش امتیاز</CardTitle>
              <CardDescription>
                خرید نمونه: قیمت نقدی ۱۰۰٬۰۰۰، قیمت با مهلت ۱۲۰٬۰۰۰، مهلت ۳۰ روز، تعداد ۱
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-500">
                {previewScore} امتیاز
              </div>
              <Separator className="my-3" />
              <ul className="list-disc space-y-1 pr-5 text-xs text-muted-foreground">
                <li>هزینه‌ی ضمنی روزانه‌ی این خرید = (۱۲۰٬۰۰۰ − ۱۰۰٬۰۰۰) ÷ ۱۰۰٬۰۰۰ ÷ ۳۰</li>
                <li>اگر این عدد از نرخ مرجع کمتر باشد ⇒ خرید سودآور و امتیاز مثبت</li>
                <li>اگر مسئول خرید قیمت نقدی را وارد نکند ⇒ امتیاز ۰</li>
              </ul>
            </CardContent>
          </Card>

          <div className="md:col-span-2 flex justify-end">
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Save className="ml-2 h-4 w-4" />}
              ذخیره تنظیمات
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}