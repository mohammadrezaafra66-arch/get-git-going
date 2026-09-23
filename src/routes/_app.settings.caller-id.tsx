import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  CALLER_ID_SETTINGS_QUERY_KEY,
  DEFAULT_CALLER_ID_SETTINGS,
  clampDisplaySeconds,
  fetchCallerIdSettings,
  upsertCallerIdSettings,
  type CallerIdSettings,
} from "@/lib/calls/caller-id-settings";

export const Route = createFileRoute("/_app/settings/caller-id")({
  component: CallerIdSettingsPage,
});

function CallerIdSettingsPage() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const qc = useQueryClient();

  const settingsQ = useQuery({
    enabled: !!userId,
    queryKey: [...CALLER_ID_SETTINGS_QUERY_KEY, userId],
    queryFn: () => fetchCallerIdSettings(userId!),
  });

  const [draft, setDraft] = useState<CallerIdSettings>(DEFAULT_CALLER_ID_SETTINGS);

  useEffect(() => {
    if (settingsQ.data) setDraft(settingsQ.data);
  }, [settingsQ.data]);

  const saveM = useMutation({
    mutationFn: () => {
      if (!userId) throw new Error("not signed in");
      return upsertCallerIdSettings(userId, {
        ...draft,
        display_seconds: clampDisplaySeconds(draft.display_seconds),
      });
    },
    onSuccess: async (saved) => {
      setDraft(saved);
      await qc.invalidateQueries({ queryKey: [...CALLER_ID_SETTINGS_QUERY_KEY] });
      toast.success("تنظیمات Caller ID ذخیره شد");
    },
    onError: (e: Error) => toast.error(e.message || "خطا در ذخیره"),
  });

  return (
    <div className="mx-auto max-w-lg space-y-6 p-4" dir="rtl">
      <PageHeader
        title="تنظیمات Caller ID"
        description="نمایش تماس‌های ورودی و خروجی را برای حساب خودتان شخصی‌سازی کنید."
      />

      {settingsQ.isLoading ? (
        <p className="text-sm text-muted-foreground">در حال بارگذاری…</p>
      ) : (
        <div className="space-y-5 rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5 text-right">
              <Label htmlFor="cid-enabled" className="text-sm font-medium">
                Caller ID فعال باشد
              </Label>
              <p className="text-xs text-muted-foreground">
                خاموش = هیچ اعلانی نشان داده نمی‌شود و poll هم متوقف می‌شود.
              </p>
            </div>
            <Switch
              id="cid-enabled"
              checked={draft.enabled}
              onCheckedChange={(v) => setDraft((d) => ({ ...d, enabled: v }))}
            />
          </div>

          <div
            className={`space-y-3 border-t pt-4 ${!draft.enabled ? "opacity-50" : ""}`}
          >
            <p className="text-sm font-medium">نوع تماس</p>
            <label className="flex cursor-pointer items-center justify-between gap-3">
              <span className="text-sm">تماس ورودی</span>
              <Checkbox
                checked={draft.show_inbound}
                disabled={!draft.enabled}
                onCheckedChange={(v) =>
                  setDraft((d) => ({ ...d, show_inbound: v === true }))
                }
              />
            </label>
            <label className="flex cursor-pointer items-center justify-between gap-3">
              <span className="text-sm">تماس خروجی</span>
              <Checkbox
                checked={draft.show_outbound}
                disabled={!draft.enabled}
                onCheckedChange={(v) =>
                  setDraft((d) => ({ ...d, show_outbound: v === true }))
                }
              />
            </label>

            {draft.enabled && draft.show_outbound ? (
              <div className="mr-1 space-y-2 rounded-md border border-dashed p-3">
                <label className="flex cursor-pointer items-center justify-between gap-3">
                  <span className="text-sm leading-snug">
                    خروجی داخلی‌های دیگر هم نشان داده شود
                  </span>
                  <Checkbox
                    checked={draft.show_others_outbound}
                    onCheckedChange={(v) =>
                      setDraft((d) => ({
                        ...d,
                        show_others_outbound: v === true,
                      }))
                    }
                  />
                </label>
                <p className="text-xs text-muted-foreground">
                  خاموش = فقط خروجی داخلی‌های متصل به حساب شما (از فهرست داخلی‌ها).
                </p>
              </div>
            ) : null}
          </div>

          <div
            className={`space-y-3 border-t pt-4 ${!draft.enabled ? "opacity-50" : ""}`}
          >
            <div className="space-y-1.5">
              <Label htmlFor="cid-display-seconds">
                مدت زمان نمایش پنجره تماس (ثانیه)
              </Label>
              <Input
                id="cid-display-seconds"
                type="number"
                min={5}
                max={120}
                disabled={!draft.enabled}
                value={draft.display_seconds}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    display_seconds: clampDisplaySeconds(e.target.value),
                  }))
                }
              />
              <p className="text-xs text-muted-foreground">بین ۵ تا ۱۲۰ ثانیه (پیش‌فرض ۱۵).</p>
            </div>

            <label className="flex cursor-pointer items-center justify-between gap-3">
              <span className="text-sm">فقط تماس‌های داخلی خودم</span>
              <Checkbox
                checked={draft.only_my_extension}
                disabled={!draft.enabled}
                onCheckedChange={(v) =>
                  setDraft((d) => ({ ...d, only_my_extension: v === true }))
                }
              />
            </label>
            <label className="flex cursor-pointer items-center justify-between gap-3">
              <span className="text-sm">فقط تماس‌های مربوط به خودم</span>
              <Checkbox
                checked={draft.only_my_customers}
                disabled={!draft.enabled}
                onCheckedChange={(v) =>
                  setDraft((d) => ({ ...d, only_my_customers: v === true }))
                }
              />
            </label>
            <p className="text-xs text-muted-foreground">
              «مربوط به خودم» = مشتریانی که مسئول‌شان شما هستید.
            </p>
          </div>

          <Button
            className="w-full"
            disabled={!userId || saveM.isPending}
            onClick={() => saveM.mutate()}
          >
            {saveM.isPending ? "در حال ذخیره…" : "ذخیره"}
          </Button>
        </div>
      )}
    </div>
  );
}
