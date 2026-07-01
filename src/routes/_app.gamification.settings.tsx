import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, RefreshCw, Plus } from "lucide-react";

import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { requireAnyRole } from "@/lib/rbac/route-guards";
import {
  listKpis,
  updateKpi,
  listKpiRules,
  toggleKpiRule,
  calculateEmployeeScore,
  listEmployeeScores,
  type GamificationKpi,
} from "@/lib/operations/gamification";
import { toPersianDigits } from "@/lib/dashboard/utils";
import { supabase } from "@/integrations/supabase/client";
import { recordManualScoreAdjustment } from "@/lib/gamification/manual-score.functions";

export const Route = createFileRoute("/_app/gamification/settings")({
  beforeLoad: async () => {
    await requireAnyRole(["admin", "manager"]);
  },
  component: GamificationSettingsPage,
});

function GamificationSettingsPage() {
  return (
    <div dir="rtl" className="space-y-4 pb-10">
      <PageHeader
        title="تنظیمات موتور گیمیفیکیشن"
        description="مدیریت وزن KPIهای پیوسته، فعال/غیرفعال کردن قوانین رویدادی و محاسبه مجدد امتیازها"
      />
      <KpiWeightsCard />
      <KpiRulesToggleCard />
      <ManualAdjustmentCard />
      <RecalculateCard />
    </div>
  );
}

function KpiWeightsCard() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["settings-kpis"], queryFn: listKpis });
  const [drafts, setDrafts] = useState<Record<string, number>>({});

  const updateMut = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: { weight?: number; enabled?: boolean } }) => {
      await updateKpi({ id, ...patch });
    },
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ["settings-kpis"] });
      setDrafts((d) => {
        const n = { ...d };
        delete n[vars.id];
        return n;
      });
      toast.success("ذخیره شد");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const totalWeight = (data ?? []).filter((k) => k.enabled).reduce((s, k) => s + Number(k.weight || 0), 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">وزن KPIهای پیوسته</CardTitle>
        <Badge variant={Math.abs(totalWeight - 1) < 0.001 ? "default" : "secondary"}>
          مجموع وزن فعال: {toPersianDigits(totalWeight.toFixed(2))}
        </Badge>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        {isLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (data ?? []).length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">KPIای تعریف نشده است.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>نام</TableHead>
                <TableHead>منبع</TableHead>
                <TableHead>واحد</TableHead>
                <TableHead>وزن</TableHead>
                <TableHead>فعال</TableHead>
                <TableHead className="text-left">عملیات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data ?? []).map((k: GamificationKpi) => {
                const draft = drafts[k.id];
                const value = draft ?? k.weight;
                const dirty = draft !== undefined && draft !== k.weight;
                return (
                  <TableRow key={k.id}>
                    <TableCell className="font-medium">
                      <div>{k.label_fa}</div>
                      <code className="text-xs text-muted-foreground">{k.key}</code>
                    </TableCell>
                    <TableCell className="text-xs">{k.source}</TableCell>
                    <TableCell className="text-xs">{k.unit ?? "—"}</TableCell>
                    <TableCell className="w-28">
                      <Input
                        type="number"
                        min={0}
                        step="0.05"
                        value={value}
                        onChange={(e) =>
                          setDrafts((d) => ({ ...d, [k.id]: Number(e.target.value) }))
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={k.enabled}
                        onCheckedChange={(v) =>
                          updateMut.mutate({ id: k.id, patch: { enabled: v } })
                        }
                      />
                    </TableCell>
                    <TableCell className="text-left">
                      <Button
                        size="sm"
                        disabled={!dirty || updateMut.isPending}
                        onClick={() => updateMut.mutate({ id: k.id, patch: { weight: value } })}
                      >
                        ذخیره
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function KpiRulesToggleCard() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["settings-kpi-rules"], queryFn: listKpiRules });
  const toggleMut = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) => toggleKpiRule(id, is_active),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings-kpi-rules"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">قوانین رویدادی (XP بر اساس رویداد)</CardTitle>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        {isLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (data ?? []).length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">قانونی تعریف نشده است.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>عنوان</TableHead>
                <TableHead>کلید رویداد</TableHead>
                <TableHead>XP</TableHead>
                <TableHead>وضعیت</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data ?? []).map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.title_fa}</TableCell>
                  <TableCell>
                    <code className="text-xs">{r.event_key}</code>
                  </TableCell>
                  <TableCell className="tabular-nums">{toPersianDigits(r.xp_amount)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={r.is_active}
                        onCheckedChange={(v) => toggleMut.mutate({ id: r.id, is_active: v })}
                      />
                      <Badge variant={r.is_active ? "default" : "secondary"}>
                        {r.is_active ? "فعال" : "غیرفعال"}
                      </Badge>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function RecalculateCard() {
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [running, setRunning] = useState(false);

  async function handleRecalculate() {
    setRunning(true);
    setProgress(null);
    try {
      const scores = await listEmployeeScores();
      const ids = Array.from(new Set(scores.map((s) => s.employee_id)));
      setProgress({ done: 0, total: ids.length });
      let done = 0;
      let failed = 0;
      for (const id of ids) {
        try {
          await calculateEmployeeScore(id);
        } catch {
          failed += 1;
        }
        done += 1;
        setProgress({ done, total: ids.length });
      }
      toast.success(
        `محاسبه مجدد انجام شد: ${toPersianDigits(done - failed)}/${toPersianDigits(ids.length)} موفق`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا در اجرای محاسبه");
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">محاسبه مجدد امتیاز همه کارمندان</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          پس از تغییر وزن‌ها، برای اعمال فوری روی امتیاز کارمندان از این دکمه استفاده کنید. در حالت
          عادی، cron هر ۵ دقیقه به‌روزرسانی می‌کند.
        </p>
        {progress && (
          <div className="text-xs text-muted-foreground">
            پیشرفت: {toPersianDigits(progress.done)}/{toPersianDigits(progress.total)}
          </div>
        )}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button disabled={running} className="gap-2">
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              محاسبه مجدد امتیاز همه
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle>تأیید محاسبه مجدد</AlertDialogTitle>
              <AlertDialogDescription>
                این عملیات ممکن است چند دقیقه طول بکشد و امتیاز همه کارمندان با وزن‌های جدید بازمحاسبه
                می‌شود. ادامه می‌دهید؟
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>انصراف</AlertDialogCancel>
              <AlertDialogAction onClick={handleRecalculate}>اجرا</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}