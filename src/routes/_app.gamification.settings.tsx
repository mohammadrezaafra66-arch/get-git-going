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
  upsertKpi,
  listKpiRules,
  toggleKpiRule,
  calculateEmployeeScore,
  listEmployeeScores,
  type GamificationKpi,
} from "@/lib/operations/gamification";
import { toPersianDigits } from "@/lib/dashboard/utils";
import { supabase } from "@/integrations/supabase/client";
import {
  recordManualScoreAdjustment,
  previewManualScoreAdjustment,
  type ManualScorePreview,
} from "@/lib/gamification/manual-score.functions";

export const Route = createFileRoute("/_app/gamification/settings")({
  beforeLoad: async () => {
    await requireAnyRole(["admin"]);
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
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: { weight?: number; enabled?: boolean };
    }) => {
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

  const totalWeight = (data ?? [])
    .filter((k) => k.enabled)
    .reduce((s, k) => s + Number(k.weight || 0), 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">وزن KPIهای پیوسته</CardTitle>
        <div className="flex items-center gap-2">
          <Badge variant={Math.abs(totalWeight - 1) < 0.001 ? "default" : "secondary"}>
            مجموع وزن فعال: {toPersianDigits(totalWeight.toFixed(2))}
          </Badge>
          <NewKpiDialog onCreated={() => qc.invalidateQueries({ queryKey: ["settings-kpis"] })} />
        </div>
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
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      toggleKpiRule(id, is_active),
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
          <div className="p-8 text-center text-sm text-muted-foreground">
            قانونی تعریف نشده است.
          </div>
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
  return <RecalculateCardImpl />;
}

function ManualAdjustmentCard() {
  return <ManualAdjustmentCardImpl />;
}

function NewKpiDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [labelFa, setLabelFa] = useState("");
  const [weight, setWeight] = useState("1");
  const [source, setSource] = useState<string>("invoices");
  const [direction, setDirection] = useState<string>("higher_better");
  const [unit, setUnit] = useState("");
  const [enabled, setEnabled] = useState(true);

  function reset() {
    setKey("");
    setLabelFa("");
    setWeight("1");
    setSource("invoices");
    setDirection("higher_better");
    setUnit("");
    setEnabled(true);
  }

  const mut = useMutation({
    mutationFn: async () => {
      const k = key.trim();
      if (!/^[a-z][a-z0-9_]{1,63}$/.test(k)) {
        throw new Error("کلید باید انگلیسی کوچک، snake_case و حداقل ۲ حرف باشد");
      }
      if (labelFa.trim().length < 2) throw new Error("عنوان فارسی الزامی است");
      const w = Number(weight);
      if (!Number.isFinite(w) || w < 0) throw new Error("وزن باید عددی نامنفی باشد");
      await upsertKpi({
        key: k,
        label_fa: labelFa.trim(),
        weight: w,
        source,
        direction: direction as "higher_better" | "lower_better",
        unit: unit.trim() || null,
        enabled,
      });
    },
    onSuccess: () => {
      toast.success("پارامتر جدید ذخیره شد");
      onCreated();
      setOpen(false);
      reset();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-2">
          <Plus className="h-4 w-4" />
          پارامتر جدید
        </Button>
      </DialogTrigger>
      <DialogContent dir="rtl">
        <DialogHeader>
          <DialogTitle>افزودن پارامتر امتیازدهی جدید</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>کلید (انگلیسی، snake_case) *</Label>
            <Input
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="مثلاً total_sales"
              dir="ltr"
            />
          </div>
          <div>
            <Label>عنوان فارسی *</Label>
            <Input
              value={labelFa}
              onChange={(e) => setLabelFa(e.target.value)}
              placeholder="مثلاً مجموع فروش"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>وزن *</Label>
              <Input
                type="number"
                min={0}
                step="0.05"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                dir="ltr"
              />
            </div>
            <div>
              <Label>واحد</Label>
              <Input
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="تومان، عدد، درصد…"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>منبع</Label>
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="invoices">فاکتورها</SelectItem>
                  <SelectItem value="manual">دستی</SelectItem>
                  <SelectItem value="penalty">جریمه</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>جهت</Label>
              <Select value={direction} onValueChange={setDirection}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="higher_better">بیشتر = بهتر</SelectItem>
                  <SelectItem value="lower_better">کمتر = بهتر</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <Label>فعال</Label>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            انصراف
          </Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
            ثبت
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatScore(n: number): string {
  return toPersianDigits(
    Number(n).toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 0 }),
  );
}

/**
 * D8-5(b): what the manager confirms is a number they have actually seen.
 *
 * Every figure here comes straight from `preview_manual_score_adjustment`.
 * Nothing is recalculated in the browser — a second copy of the scoring maths
 * in the frontend would drift from the database the first time the KPIs or the
 * decay shape changed, and a preview that disagrees with the result is worse
 * than showing no preview at all.
 */
function ManualAdjustmentPreview({
  enabled,
  isLoading,
  error,
  preview,
}: {
  enabled: boolean;
  isLoading: boolean;
  error: Error | null;
  preview: ManualScorePreview | null;
}) {
  if (!enabled) {
    return (
      <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
        برای دیدن پیش‌نمایش اثر، کارمند، مقدار امتیاز و مدت اثر را کامل کنید.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-md border p-3 text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        در حال محاسبهٔ پیش‌نمایش…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-xs text-destructive">
        پیش‌نمایش محاسبه نشد: {error.message}
      </div>
    );
  }

  if (!preview) return null;

  const leveledDown = preview.projected.level < preview.current.level;

  return (
    <div className="space-y-3 rounded-md border bg-muted/30 p-3">
      <p className="text-xs font-medium">پیش‌نمایش اثر (پیش از ثبت)</p>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded border bg-background p-2">
          <p className="text-muted-foreground">امتیاز ماهانهٔ فعلی</p>
          <p className="font-semibold" dir="ltr">
            {formatScore(preview.current.monthly_score)}
          </p>
          <p className="mt-1 text-muted-foreground">
            سطح فعلی: {toPersianDigits(preview.current.level)}
          </p>
        </div>
        <div className="rounded border bg-background p-2">
          <p className="text-muted-foreground">پس از این ثبت</p>
          <p
            className={`font-semibold ${
              preview.delta.monthly_score < 0 ? "text-destructive" : "text-emerald-600"
            }`}
            dir="ltr"
          >
            {formatScore(preview.projected.monthly_score)}
          </p>
          <p className="mt-1 text-muted-foreground">
            سطح: {toPersianDigits(preview.projected.level)}
            {preview.projected.leveled_up && " (ارتقا)"}
            {leveledDown && " (نزول)"}
          </p>
        </div>
      </div>

      <div>
        <p className="mb-1 text-xs text-muted-foreground">
          اثر ماه‌به‌ماه در طول {toPersianDigits(preview.effect_months)} ماه (کاهش خطی)
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="text-muted-foreground">
                <th className="p-1 font-normal">ماه</th>
                <th className="p-1 font-normal">ضریب</th>
                <th className="p-1 font-normal">اثر بر امتیاز</th>
              </tr>
            </thead>
            <tbody>
              {preview.schedule.map((row) => (
                <tr key={row.month_offset} className="border-t">
                  <td className="p-1">
                    {row.month_offset === 0
                      ? "همین ماه"
                      : `${toPersianDigits(row.month_offset)} ماه بعد`}
                  </td>
                  <td className="p-1" dir="ltr">
                    {toPersianDigits(Number(row.factor).toFixed(2))}
                  </td>
                  <td
                    className={`p-1 ${
                      Number(row.effective_amount) < 0 ? "text-destructive" : "text-emerald-600"
                    }`}
                    dir="ltr"
                  >
                    {formatScore(row.effective_amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          پس از پایان این مدت، اثر عددی صفر می‌شود ولی خودِ رکورد در تاریخچه می‌ماند.
        </p>
      </div>
    </div>
  );
}

function ManualAdjustmentCardImpl() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [effectMonths, setEffectMonths] = useState<string>("1");
  const recordFn = useServerFn(recordManualScoreAdjustment);
  const previewFn = useServerFn(previewManualScoreAdjustment);

  const usersQ = useQuery({
    queryKey: ["active-profiles-for-manual-adj"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("is_active", true)
        .order("full_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; full_name: string | null }>;
    },
    staleTime: 60_000,
  });

  const amountNum = Number(amount);
  const monthsNum = Number(effectMonths);
  const previewInputsValid =
    !!employeeId &&
    Number.isFinite(amountNum) &&
    amountNum !== 0 &&
    Number.isInteger(monthsNum) &&
    monthsNum >= 1 &&
    monthsNum <= 60;

  // D8-5(b): the manager must SEE the effect before confirming. The numbers come
  // from preview_manual_score_adjustment, which runs the same computation that
  // produces the real score — nothing here is recomputed in the browser.
  const previewQ = useQuery({
    queryKey: ["manual-score-preview", employeeId, amountNum, monthsNum],
    queryFn: () => previewFn({ data: { employeeId, amount: amountNum, effectMonths: monthsNum } }),
    enabled: open && previewInputsValid,
    staleTime: 0,
  });

  function resetForm() {
    setEmployeeId("");
    setAmount("");
    setReason("");
    setEffectMonths("1");
  }

  const mut = useMutation({
    mutationFn: async () => {
      const num = Number(amount);
      const months = Number(effectMonths);
      if (!employeeId) throw new Error("لطفاً کارمند را انتخاب کنید");
      if (!Number.isFinite(num) || num === 0)
        throw new Error("مقدار امتیاز باید عددی غیر صفر باشد");
      if (!Number.isInteger(months) || months < 1 || months > 60)
        throw new Error("مدت اثر باید عددی صحیح بین ۱ تا ۶۰ ماه باشد");
      if (reason.trim().length < 10) throw new Error("دلیل باید حداقل ۱۰ کاراکتر باشد");
      if (!previewQ.data) throw new Error("ابتدا پیش‌نمایش اثر را ببینید");
      await recordFn({
        data: { employeeId, amount: num, reason: reason.trim(), effectMonths: months },
      });
    },
    onSuccess: () => {
      toast.success("امتیاز دستی ثبت و امتیاز کارمند به‌روز شد");
      qc.invalidateQueries({ queryKey: ["my-score-breakdown"] });
      qc.invalidateQueries({ queryKey: ["settings-kpis"] });
      qc.invalidateQueries({ queryKey: ["manual-score-preview"] });
      setOpen(false);
      resetForm();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">ثبت امتیاز دستی</CardTitle>
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) resetForm();
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" />
              ثبت امتیاز دستی
            </Button>
          </DialogTrigger>
          <DialogContent dir="rtl">
            <DialogHeader>
              <DialogTitle>ثبت امتیاز دستی (پاداش/جریمه)</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>کارمند *</Label>
                <Select value={employeeId} onValueChange={setEmployeeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="کارمند را انتخاب کنید" />
                  </SelectTrigger>
                  <SelectContent>
                    {(usersQ.data ?? []).map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.full_name ?? u.id.slice(0, 8)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>مقدار امتیاز * (مثبت = پاداش، منفی = جریمه)</Label>
                <Input
                  type="number"
                  step="1"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="مثلاً ۱۰ یا -۵"
                  dir="ltr"
                />
              </div>
              <div>
                <Label>مدت اثر * (چند ماه روی امتیاز اثر بگذارد؟)</Label>
                <Input
                  type="number"
                  step="1"
                  min={1}
                  max={60}
                  value={effectMonths}
                  onChange={(e) => setEffectMonths(e.target.value)}
                  dir="ltr"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  شکل کاهش: <strong>کاهش خطی</strong> — اثر در ماه ثبت کامل است و تا پایان مدت
                  انتخابی به‌تدریج به صفر می‌رسد. با مدت ۱ ماه، فقط در همین ماه اثر دارد. خودِ رکورد
                  هرگز پاک نمی‌شود؛ فقط اثر عددی‌اش تمام می‌شود.
                </p>
              </div>
              <div>
                <Label>دلیل * (حداقل ۱۰ کاراکتر)</Label>
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder="توضیح دهید چرا این امتیاز اعمال می‌شود"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {toPersianDigits(reason.trim().length)} / ۵۰۰
                </p>
              </div>

              <ManualAdjustmentPreview
                enabled={previewInputsValid}
                isLoading={previewQ.isFetching}
                error={previewQ.error as Error | null}
                preview={previewQ.data ?? null}
              />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                انصراف
              </Button>
              <Button
                onClick={() => mut.mutate()}
                disabled={mut.isPending || !previewQ.data || previewQ.isFetching}
              >
                {mut.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                ثبت
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          هر ثبت به صورت رویداد <code className="text-xs">manual_adjustment</code> در تاریخچه امتیاز
          کارمند ذخیره می‌شود و در ویجت «این امتیاز از کجا آمد» با برچسب «تعدیل دستی» قابل مشاهده
          است. مدت اثر برای هر ثبت جداگانه انتخاب می‌شود و اثر عددی با <strong>کاهش خطی</strong> تا
          پایان آن مدت به صفر می‌رسد؛ خودِ رکورد باقی می‌ماند. پیش از ثبت، اثر روی امتیاز و سطح
          کارمند نمایش داده می‌شود.
        </p>
      </CardContent>
    </Card>
  );
}

function RecalculateCardImpl() {
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
              {running ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              محاسبه مجدد امتیاز همه
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle>تأیید محاسبه مجدد</AlertDialogTitle>
              <AlertDialogDescription>
                این عملیات ممکن است چند دقیقه طول بکشد و امتیاز همه کارمندان با وزن‌های جدید
                بازمحاسبه می‌شود. ادامه می‌دهید؟
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
