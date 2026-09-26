import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { withOpsSession } from "@/lib/torob-ops/client-session";
import {
  torobOpsGetSettings,
  torobOpsListReportTemplates,
  torobOpsProcessReportQueue,
  torobOpsUpdateSettings,
  torobOpsUpsertReportTemplate,
} from "@/lib/torob-ops/functions";
import { TorobOpsGate } from "./TorobOpsGate";

function SettingsInner() {
  const qc = useQueryClient();
  const settingsFn = useServerFn(torobOpsGetSettings);
  const updateFn = useServerFn(torobOpsUpdateSettings);
  const templatesFn = useServerFn(torobOpsListReportTemplates);
  const upsertTmplFn = useServerFn(torobOpsUpsertReportTemplate);
  const processFn = useServerFn(torobOpsProcessReportQueue);

  const settingsQ = useQuery({
    queryKey: ["torob-ops-settings"],
    queryFn: () => settingsFn({ data: withOpsSession() }),
  });
  const templatesQ = useQuery({
    queryKey: ["torob-ops-templates"],
    queryFn: () => templatesFn({ data: withOpsSession() }),
  });

  const [autoEnabled, setAutoEnabled] = useState(false);
  const [killSwitch, setKillSwitch] = useState(false);
  const [maxPerHour, setMaxPerHour] = useState(10);
  const [dedupeHours, setDedupeHours] = useState(72);
  const [tmplName, setTmplName] = useState("قالب پیش‌فرض طعمه");
  const [tmplBody, setTmplBody] = useState("");
  const [tmplId, setTmplId] = useState<string | undefined>();

  useEffect(() => {
    if (!settingsQ.data) return;
    setAutoEnabled(settingsQ.data.auto_report_enabled);
    setKillSwitch(settingsQ.data.kill_switch);
    setMaxPerHour(settingsQ.data.max_reports_per_hour);
    setDedupeHours(settingsQ.data.dedupe_window_hours);
  }, [settingsQ.data]);

  useEffect(() => {
    const def = (templatesQ.data ?? []).find((t: { is_default: boolean }) => t.is_default);
    if (!def) return;
    setTmplId(def.id);
    setTmplName(def.name);
    setTmplBody(def.body);
  }, [templatesQ.data]);

  const saveSettingsMut = useMutation({
    mutationFn: () =>
      updateFn({
        data: withOpsSession({
          auto_report_enabled: autoEnabled,
          kill_switch: killSwitch,
          max_reports_per_hour: maxPerHour,
          dedupe_window_hours: dedupeHours,
        }),
      }),
    onSuccess: () => {
      toast.success("تنظیمات ذخیره شد.");
      qc.invalidateQueries({ queryKey: ["torob-ops-settings"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const saveTmplMut = useMutation({
    mutationFn: () =>
      upsertTmplFn({
        data: withOpsSession({
          id: tmplId,
          name: tmplName,
          body: tmplBody,
          isDefault: true,
          isActive: true,
        }),
      }),
    onSuccess: () => {
      toast.success("قالب ذخیره شد.");
      qc.invalidateQueries({ queryKey: ["torob-ops-templates"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const processMut = useMutation({
    mutationFn: (dryRunForce: boolean) =>
      processFn({ data: withOpsSession({ dryRunForce, limit: 5 }) }),
    onSuccess: (res) => {
      toast.success(`صف پردازش شد: ${res.processed} مورد`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-4 p-4">
      <PageHeader
        title="تنظیمات عملیات ترب"
        description="چشم ترب، ارسال خودکار، کلید اضطراری، قالب متن، و اجرای صف گزارش."
      />

      <Card>
        <CardContent className="space-y-4 py-4">
          <div className="font-medium">چشم ترب</div>
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm">فعال</div>
            <Switch
              checked={settingsQ.data?.eye_enabled !== false}
              onCheckedChange={(v) =>
                updateFn({ data: withOpsSession({ eye_enabled: v }) }).then(() =>
                  qc.invalidateQueries({ queryKey: ["torob-ops-settings"] }),
                )
              }
            />
          </div>
          <p className="text-xs text-muted-foreground">
            فاصله درخواست ۳۰–۶۰ ثانیه، چرخه هر ۴ ساعت، پنجره ۸ تا ۲۲ تهران. از دکمه ذخیره پایین برای
            سقف گزارش و کلید اضطراری استفاده کنید.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-medium">ارسال خودکار (feature flag)</div>
              <p className="text-xs text-muted-foreground">پیش‌فرض خاموش؛ فقط پس از تأیید مالک روشن شود.</p>
            </div>
            <Switch checked={autoEnabled} onCheckedChange={setAutoEnabled} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-medium text-destructive">کلید اضطراری (kill switch)</div>
              <p className="text-xs text-muted-foreground">کل صف گزارش را فوراً متوقف می‌کند.</p>
            </div>
            <Switch checked={killSwitch} onCheckedChange={setKillSwitch} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>سقف گزارش در ساعت</Label>
              <Input
                type="number"
                value={maxPerHour}
                onChange={(e) => setMaxPerHour(Number(e.target.value) || 1)}
              />
            </div>
            <div className="space-y-1">
              <Label>پنجرهٔ جلوگیری از تکرار (ساعت)</Label>
              <Input
                type="number"
                value={dedupeHours}
                onChange={(e) => setDedupeHours(Number(e.target.value) || 1)}
              />
            </div>
          </div>
          <Button
            type="button"
            disabled={saveSettingsMut.isPending}
            onClick={() => saveSettingsMut.mutate()}
          >
            ذخیره تنظیمات
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 py-4">
          <div className="font-medium">قالب متن گزارش</div>
          <p className="text-xs text-muted-foreground">
            متغیرها: {"{{product_name}}"} {"{{torob_url}}"} {"{{our_price}}"} {"{{their_price}}"}{" "}
            {"{{bait_signals}}"} {"{{seller_domain}}"}
          </p>
          <Input value={tmplName} onChange={(e) => setTmplName(e.target.value)} />
          <Textarea value={tmplBody} onChange={(e) => setTmplBody(e.target.value)} rows={8} />
          <Button
            type="button"
            disabled={saveTmplMut.isPending}
            onClick={() => saveTmplMut.mutate()}
          >
            ذخیره قالب
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-wrap gap-2 py-4">
          <Button
            type="button"
            variant="secondary"
            disabled={processMut.isPending}
            onClick={() => processMut.mutate(true)}
          >
            اجرای dry-run صف (۵ مورد)
          </Button>
          <Button
            type="button"
            variant="default"
            disabled={processMut.isPending || killSwitch || !autoEnabled}
            onClick={() => processMut.mutate(false)}
          >
            اجرای worker واقعی (نیاز به flag)
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export function TorobOpsSettingsPage() {
  return (
    <TorobOpsGate>
      <SettingsInner />
    </TorobOpsGate>
  );
}
