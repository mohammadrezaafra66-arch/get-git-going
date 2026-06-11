import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { Loader2, Plus, Pencil } from "lucide-react";

import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { requireAnyRole } from "@/lib/rbac/route-guards";
import {
  listMissions,
  createMission,
  updateMission,
  setMissionActive,
  listKpiOptions,
  CONDITION_OPERATORS,
  MISSION_TYPES,
  REPEAT_RULES,
  type MissionRow,
  type MissionType,
  type ConditionOperator,
  type RepeatRule,
} from "@/lib/operations/gamification-missions";

export const Route = createFileRoute("/_app/gamification/admin/missions")({
  beforeLoad: async () => {
    await requireAnyRole(["admin", "manager"]);
  },
  component: MissionsAdminPage,
});

const TYPE_FA: Record<MissionType, string> = {
  daily: "روزانه",
  weekly: "هفتگی",
  monthly: "ماهانه",
  custom: "سفارشی",
};
const REPEAT_FA: Record<RepeatRule, string> = {
  none: "بدون تکرار",
  daily: "روزانه",
  weekly: "هفتگی",
  monthly: "ماهانه",
};

const schema = z
  .object({
    title_fa: z.string().trim().min(1, "عنوان فارسی الزامی است").max(120),
    title_en: z.string().trim().max(120).optional().or(z.literal("")),
    description: z.string().max(500).optional().or(z.literal("")),
    mission_type: z.enum(["daily", "weekly", "monthly", "custom"], {
      message: "نوع مأموریت الزامی است",
    }),
    condition_event_key: z.string().trim().min(1, "شرط مأموریت الزامی است"),
    condition_operator: z.enum([">=", ">", "=", "<=", "<"], { message: "اپراتور نامعتبر" }),
    condition_value: z.coerce
      .number()
      .refine((n) => Number.isFinite(n) && n > 0, "مقدار شرط باید عدد معتبر و بزرگ‌تر از صفر باشد"),
    reward_xp: z.coerce.number().min(0, "XP جایزه نمی‌تواند منفی باشد"),
    is_active: z.boolean(),
    starts_at: z.string().optional().or(z.literal("")),
    ends_at: z.string().optional().or(z.literal("")),
    repeat_rule: z.enum(["none", "daily", "weekly", "monthly"]),
    sort_order: z.coerce.number().int().min(0),
  })
  .refine((v) => !v.starts_at || !v.ends_at || new Date(v.ends_at) > new Date(v.starts_at), {
    message: "تاریخ پایان باید بعد از تاریخ شروع باشد",
    path: ["ends_at"],
  });

function fmtDate(d: string | null) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString("fa-IR");
  } catch {
    return d;
  }
}
function fmtRange(s: string | null, e: string | null) {
  if (!s && !e) return "—";
  return `${fmtDate(s)} → ${fmtDate(e)}`;
}

function MissionsAdminPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["admin-missions-v2"], queryFn: listMissions });
  const { data: kpis } = useQuery({
    queryKey: ["admin-kpi-options"],
    queryFn: listKpiOptions,
    staleTime: 60_000,
  });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<MissionRow | null>(null);

  const toggleMut = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      setMissionActive(id, is_active),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-missions-v2"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const kpiMap = useMemo(
    () => Object.fromEntries((kpis ?? []).map((k) => [k.event_key, k])),
    [kpis],
  );

  return (
    <div className="space-y-4 pb-10" dir="rtl">
      <PageHeader
        title="مدیریت مأموریت‌ها"
        description="مأموریت‌ها اهداف زمان‌دار هستند که برای فعال نگه‌داشتن تیم فروش تعریف می‌شوند."
      />
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">مأموریت‌ها</CardTitle>
          <Dialog
            open={open}
            onOpenChange={(v) => {
              setOpen(v);
              if (!v) setEditing(null);
            }}
          >
            <DialogTrigger asChild>
              <Button size="sm" onClick={() => setEditing(null)}>
                <Plus className="ml-1 h-4 w-4" />
                افزودن مأموریت
              </Button>
            </DialogTrigger>
            <MissionDialog
              initial={editing}
              kpiOptions={kpis ?? []}
              onClose={() => {
                setOpen(false);
                setEditing(null);
              }}
            />
          </Dialog>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {isLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (data ?? []).length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              هیچ مأموریتی تعریف نشده است.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>عنوان</TableHead>
                  <TableHead>نوع</TableHead>
                  <TableHead>شرط</TableHead>
                  <TableHead>XP جایزه</TableHead>
                  <TableHead>بازه زمانی</TableHead>
                  <TableHead>وضعیت</TableHead>
                  <TableHead>ترتیب</TableHead>
                  <TableHead>آخرین ویرایش</TableHead>
                  <TableHead className="text-left">عملیات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data ?? []).map((m) => {
                  const kpi = m.condition_event_key ? kpiMap[m.condition_event_key] : undefined;
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">
                        <div>{m.title_fa}</div>
                        {m.title_en && (
                          <div className="text-xs text-muted-foreground">{m.title_en}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{TYPE_FA[m.mission_type]}</Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {m.condition_event_key ? (
                          <span className="inline-flex items-center gap-1 flex-wrap">
                            <code dir="ltr">{m.condition_event_key}</code>
                            <span>{m.condition_operator}</span>
                            <span className="tabular-nums">{m.condition_value}</span>
                            {kpi && !kpi.is_active && (
                              <Badge variant="secondary" className="mr-1">
                                KPI غیرفعال
                              </Badge>
                            )}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="tabular-nums">{m.reward_xp}</TableCell>
                      <TableCell className="text-xs">{fmtRange(m.starts_at, m.ends_at)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={m.is_active}
                            onCheckedChange={(v) => toggleMut.mutate({ id: m.id, is_active: v })}
                          />
                          <Badge variant={m.is_active ? "default" : "secondary"}>
                            {m.is_active ? "فعال" : "غیرفعال"}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="tabular-nums">{m.sort_order}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {fmtDate(m.updated_at)}
                      </TableCell>
                      <TableCell className="text-left">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditing(m);
                            setOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
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
      <p className="text-xs text-muted-foreground">
        برای حذف مأموریت آن را غیرفعال کنید. حذف واقعی پشتیبانی نمی‌شود. موتور پیشرفت مأموریت در فاز
        بعدی اضافه می‌شود.
      </p>
    </div>
  );
}

function MissionDialog({
  initial,
  kpiOptions,
  onClose,
}: {
  initial: MissionRow | null;
  kpiOptions: { event_key: string; title_fa: string; is_active: boolean }[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    title_fa: initial?.title_fa ?? "",
    title_en: initial?.title_en ?? "",
    description: initial?.description ?? "",
    mission_type: (initial?.mission_type ?? "daily") as MissionType,
    condition_event_key: initial?.condition_event_key ?? "",
    condition_operator: (initial?.condition_operator ?? ">=") as ConditionOperator,
    condition_value: initial?.condition_value ?? 1,
    reward_xp: initial?.reward_xp ?? 50,
    is_active: initial?.is_active ?? true,
    starts_at: initial?.starts_at ? initial.starts_at.slice(0, 16) : "",
    ends_at: initial?.ends_at ? initial.ends_at.slice(0, 16) : "",
    repeat_rule: (initial?.repeat_rule ??
      (initial?.mission_type && initial.mission_type !== "custom"
        ? initial.mission_type
        : "none")) as RepeatRule,
    sort_order: initial?.sort_order ?? 0,
  });

  function setMissionType(v: MissionType) {
    setForm((f) => ({
      ...f,
      mission_type: v,
      repeat_rule: v === "custom" ? f.repeat_rule : (v as RepeatRule),
    }));
  }

  const visibleKpis = useMemo(() => {
    if (initial) {
      return kpiOptions.filter((k) => k.is_active || k.event_key === initial.condition_event_key);
    }
    return kpiOptions.filter((k) => k.is_active);
  }, [kpiOptions, initial]);

  const mut = useMutation({
    mutationFn: async () => {
      const parsed = schema.parse({
        ...form,
        title_en: form.title_en || undefined,
        description: form.description || undefined,
        starts_at: form.starts_at || undefined,
        ends_at: form.ends_at || undefined,
      });
      if (!kpiOptions.some((k) => k.event_key === parsed.condition_event_key)) {
        throw new Error("کلید رویداد در فهرست قوانین KPI وجود ندارد");
      }
      const payload = {
        title_fa: parsed.title_fa,
        title_en: parsed.title_en ?? null,
        description: parsed.description ?? null,
        mission_type: parsed.mission_type,
        condition_event_key: parsed.condition_event_key,
        condition_operator: parsed.condition_operator,
        condition_value: parsed.condition_value,
        reward_xp: parsed.reward_xp,
        is_active: parsed.is_active,
        starts_at: parsed.starts_at ? new Date(parsed.starts_at).toISOString() : null,
        ends_at: parsed.ends_at ? new Date(parsed.ends_at).toISOString() : null,
        repeat_rule: parsed.repeat_rule,
        sort_order: parsed.sort_order,
      };
      if (initial) await updateMission(initial.id, payload);
      else await createMission(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-missions-v2"] });
      toast.success(initial ? "ویرایش شد" : "مأموریت اضافه شد");
      onClose();
    },
    onError: (e: unknown) => {
      if (e instanceof z.ZodError) {
        toast.error(e.issues[0]?.message ?? "ورودی نامعتبر");
        return;
      }
      const msg = e instanceof Error ? e.message : "خطا در ذخیره";
      if (
        msg.includes("missions_definition_uniq") ||
        msg.includes("duplicate") ||
        msg.includes("unique")
      ) {
        toast.error("این مأموریت قبلاً تعریف شده است.");
      } else if (msg.includes("missions_dates_chk")) {
        toast.error("تاریخ پایان باید بعد از تاریخ شروع باشد.");
      } else {
        toast.error(msg);
      }
    },
  });

  return (
    <DialogContent dir="rtl" className="max-w-lg max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{initial ? "ویرایش مأموریت" : "افزودن مأموریت"}</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>عنوان فارسی *</Label>
            <Input
              value={form.title_fa}
              onChange={(e) => setForm({ ...form, title_fa: e.target.value })}
            />
          </div>
          <div>
            <Label>عنوان انگلیسی</Label>
            <Input
              value={form.title_en}
              onChange={(e) => setForm({ ...form, title_en: e.target.value })}
            />
          </div>
        </div>
        <div>
          <Label>توضیحات</Label>
          <Textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={2}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>نوع مأموریت *</Label>
            <Select
              value={form.mission_type}
              onValueChange={(v) => setMissionType(v as MissionType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MISSION_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {TYPE_FA[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>قانون تکرار</Label>
            <Select
              value={form.repeat_rule}
              onValueChange={(v) => setForm({ ...form, repeat_rule: v as RepeatRule })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REPEAT_RULES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {REPEAT_FA[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label>شرط — رویداد *</Label>
          <Select
            value={form.condition_event_key}
            onValueChange={(v) => setForm({ ...form, condition_event_key: v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="یک رویداد انتخاب کنید" />
            </SelectTrigger>
            <SelectContent>
              {visibleKpis.length === 0 ? (
                <div className="p-2 text-xs text-muted-foreground">هیچ KPI فعالی موجود نیست</div>
              ) : (
                visibleKpis.map((k) => (
                  <SelectItem key={k.event_key} value={k.event_key}>
                    {k.title_fa}{" "}
                    <span className="text-xs text-muted-foreground" dir="ltr">
                      ({k.event_key})
                    </span>
                    {!k.is_active && " — غیرفعال"}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label>اپراتور *</Label>
            <Select
              value={form.condition_operator}
              onValueChange={(v) =>
                setForm({ ...form, condition_operator: v as ConditionOperator })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONDITION_OPERATORS.map((op) => (
                  <SelectItem key={op} value={op}>
                    {op}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>مقدار شرط *</Label>
            <Input
              type="number"
              min={1}
              value={form.condition_value}
              onChange={(e) => setForm({ ...form, condition_value: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label>پاداش XP *</Label>
            <Input
              type="number"
              min={0}
              value={form.reward_xp}
              onChange={(e) => setForm({ ...form, reward_xp: Number(e.target.value) })}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>شروع</Label>
            <Input
              type="datetime-local"
              value={form.starts_at}
              onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
            />
          </div>
          <div>
            <Label>پایان</Label>
            <Input
              type="datetime-local"
              value={form.ends_at}
              onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>ترتیب نمایش</Label>
            <Input
              type="number"
              min={0}
              value={form.sort_order}
              onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })}
            />
          </div>
          <div className="flex items-end gap-2 pb-2">
            <Switch
              checked={form.is_active}
              onCheckedChange={(v) => setForm({ ...form, is_active: v })}
            />
            <Label>فعال</Label>
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          انصراف
        </Button>
        <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
          {mut.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}ذخیره
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
