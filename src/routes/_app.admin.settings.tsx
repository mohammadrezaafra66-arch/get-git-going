import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { requireAdmin } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import {
  SHOP_SETTING_KEYS,
  SHOP_SETTING_LABELS,
  emptyShopSettings,
  fetchShopSettings,
  type ShopSettingKey,
  type ShopSettingsMap,
} from "@/lib/shop/settings";
import { BRANDING } from "@/config/branding";

export const Route = createFileRoute("/_app/admin/settings")({
  beforeLoad: async () => {
    await requireAdmin();
  },
  component: ShopSettingsPage,
});

const TEXTAREA_KEYS: ShopSettingKey[] = [
  "shop_address",
  "default_seller_info",
  "birthday_message_template",
];

const PLACEHOLDERS: Record<ShopSettingKey, string> = {
  shop_name: `مثلاً فروشگاه ${BRANDING.platformName}`,
  shop_address: "آدرس کامل فروشگاه",
  shop_phone: "مثلاً ۰۲۱-۱۲۳۴۵۶۷۸",
  shop_website: "https://example.com",
  shop_rubika: "https://rubika.ir/...",
  shop_whatsapp: "https://wa.me/...",
  shop_eitaa: "https://eitaa.com/...",
  shop_baleh: "https://ble.ir/...",
  default_seller_info: "نام، شماره تماس و سمت پیش‌فرض فروشنده",
  alert_threshold_percent: "مثلاً 5",
  birthday_message_template: "🎂 تولدت مبارک! ...",
  holding_tier1_days: "30",
  holding_tier2_days: "60",
  holding_tier3_days: "90",
  holding_tier1_margin_add: "0",
  holding_tier2_margin_add: "2",
  holding_tier3_margin_add: "5",
  holding_tier4_margin_add: "10",
};

function ShopSettingsPage() {
  const qc = useQueryClient();
  const [values, setValues] = useState<ShopSettingsMap>(emptyShopSettings());
  const [saving, setSaving] = useState(false);

  const settingsQ = useQuery({
    queryKey: ["shop-settings"],
    queryFn: fetchShopSettings,
    staleTime: 300_000,
  });

  useEffect(() => {
    if (settingsQ.data) setValues(settingsQ.data);
  }, [settingsQ.data]);

  const update = (k: ShopSettingKey, v: string) => {
    setValues((prev) => ({ ...prev, [k]: v }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Validate alert threshold
      const threshold = Number(values.alert_threshold_percent);
      if (
        values.alert_threshold_percent &&
        (isNaN(threshold) || threshold < 1 || threshold > 100)
      ) {
        toast.error("آستانه هشدار باید عددی بین ۱ تا ۱۰۰ باشد.");
        setSaving(false);
        return;
      }
      // Validate birthday message length
      if ((values.birthday_message_template ?? "").length > 500) {
        toast.error("متن پیام تولد نباید بیش از ۵۰۰ کاراکتر باشد.");
        setSaving(false);
        return;
      }
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id ?? null;
      const original = settingsQ.data ?? emptyShopSettings();
      const changed: Record<string, { from: string; to: string }> = {};
      const rows = SHOP_SETTING_KEYS.map((k) => {
        const oldV = original[k] ?? "";
        const newV = values[k] ?? "";
        if (oldV !== newV) changed[k] = { from: oldV, to: newV };
        return { key: k, value: newV, updated_at: new Date().toISOString(), updated_by: userId };
      });

      const { error } = await supabase.from("shop_settings").upsert(rows, { onConflict: "key" });
      if (error) throw error;

      if (Object.keys(changed).length > 0 && userId) {
        await supabase.from("audit_logs").insert({
          action: "shop_settings_updated",
          entity_type: "shop_settings",
          entity_id: "global",
          actor_id: userId,
          diff: changed,
        });
      }

      toast.success("تنظیمات فروشگاه با موفقیت ذخیره شد.");
      await qc.invalidateQueries({ queryKey: ["shop-settings"] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "خطا در ذخیره تنظیمات.";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="تنظیمات فروشگاه"
        description="اطلاعات ثابت فروشگاه که در خروجی PDF لیست‌های فروش درج می‌شود"
      />

      {settingsQ.isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : settingsQ.isError ? (
        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          خطا در بارگذاری تنظیمات.
        </div>
      ) : (
        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {SHOP_SETTING_KEYS.map((k) => {
                const isTextarea = TEXTAREA_KEYS.includes(k);
                return (
                  <div key={k} className={`space-y-1 ${isTextarea ? "md:col-span-2" : ""}`}>
                    <Label htmlFor={`ss-${k}`}>{SHOP_SETTING_LABELS[k]}</Label>
                    {isTextarea ? (
                      <Textarea
                        id={`ss-${k}`}
                        value={values[k]}
                        onChange={(e) => update(k, e.target.value)}
                        rows={3}
                        placeholder={PLACEHOLDERS[k]}
                        dir="rtl"
                      />
                    ) : (
                      <Input
                        id={`ss-${k}`}
                        value={values[k]}
                        onChange={(e) => update(k, e.target.value)}
                        placeholder={PLACEHOLDERS[k]}
                        dir="rtl"
                      />
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={handleSave} disabled={saving} className="gap-2">
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                ذخیره تنظیمات
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
