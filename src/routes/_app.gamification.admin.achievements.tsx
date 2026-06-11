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
  listAchievements,
  createAchievement,
  updateAchievement,
  setAchievementActive,
  listKpiOptions,
  CONDITION_OPERATORS,
  type AchievementRow,
  type ConditionOperator,
} from "@/lib/operations/gamification-achievements";

export const Route = createFileRoute("/_app/gamification/admin/achievements")({
  beforeLoad: async () => {
    await requireAnyRole(["admin", "manager"]);
  },
  component: AchievementsAdminPage,
});

const ICON_KEYS = ["phone", "trophy", "target", "star", "fire", "customer", "sale"] as const;

const schema = z.object({
  title_fa: z.string().trim().min(1, "عنوان فارسی الزامی است").max(120),
  title_en: z.string().trim().max(120).optional().or(z.literal("")),
  description: z.string().max(500).optional().or(z.literal("")),
  icon_key: z
    .string()
    .trim()
    .max(40)
    .regex(/^[a-z0-9_-]*$/i, "آیکن نامعتبر")
    .optional()
    .or(z.literal("")),
  condition_event_key: z.string().trim().min(1, "شرط مدال الزامی است"),
  condition_operator: z.enum([">=", ">", "=", "<=", "<"], { message: "اپراتور نامعتبر" }),
  condition_value: z.coerce
    .number()
    .refine((n) => Number.isFinite(n) && n > 0, "مقدار شرط باید عدد معتبر و بزرگ‌تر از صفر باشد"),
  reward_xp: z.coerce.number().min(0, "XP جایزه نمی‌تواند منفی باشد"),
  is_active: z.boolean(),
  sort_order: z.coerce.number().int().min(0),
});

function fmtDate(d: string) {
  try {
    return new Date(d).toLocaleString("fa-IR");
  } catch {
    return d;
  }
}

function AchievementsAdminPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin-achievements-v2"],
    queryFn: listAchievements,
  });
  const { data: kpis } = useQuery({
    queryKey: ["admin-kpi-options"],
    queryFn: listKpiOptions,
    staleTime: 60_000,
  });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AchievementRow | null>(null);

  const toggleMut = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      setAchievementActive(id, is_active),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-achievements-v2"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const kpiMap = useMemo(
    () => Object.fromEntries((kpis ?? []).map((k) => [k.event_key, k])),
    [kpis],
  );

  return (
    <div className="space-y-4 pb-10" dir="rtl">
      <PageHeader
        title="مدیریت مدال‌ها"
        description="مدال‌ها بر اساس رفتارهای امتیازدار کارمندان آزاد می‌شوند."
      />
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">مدال‌ها</CardTitle>
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
                افزودن مدال
              </Button>
            </DialogTrigger>
            <AchievementDialog
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
              هیچ مدالی تعریف نشده است.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>عنوان</TableHead>
                  <TableHead>شرط</TableHead>
                  <TableHead>XP جایزه</TableHead>
                  <TableHead>وضعیت</TableHead>
                  <TableHead>ترتیب</TableHead>
                  <TableHead>آخرین ویرایش</TableHead>
                  <TableHead className="text-left">عملیات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data ?? []).map((a) => {
                  const kpi = a.condition_event_key ? kpiMap[a.condition_event_key] : undefined;
                  return (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">
                        <div>{a.title_fa}</div>
                        {a.title_en && (
                          <div className="text-xs text-muted-foreground">{a.title_en}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {a.condition_event_key ? (
                          <span className="inline-flex items-center gap-1">
                            <code dir="ltr">{a.condition_event_key}</code>
                            <span>{a.condition_operator}</span>
                            <span className="tabular-nums">{a.condition_value}</span>
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
                      <TableCell className="tabular-nums">{a.xp_reward}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={a.enabled}
                            onCheckedChange={(v) => toggleMut.mutate({ id: a.id, is_active: v })}
                          />
                          <Badge variant={a.enabled ? "default" : "secondary"}>
                            {a.enabled ? "فعال" : "غیرفعال"}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="tabular-nums">{a.display_order}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {fmtDate(a.updated_at)}
                      </TableCell>
                      <TableCell className="text-left">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditing(a);
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
        برای حذف مدال آن را غیرفعال کنید. حذف واقعی پشتیبانی نمی‌شود.
      </p>
    </div>
  );
}

function AchievementDialog({
  initial,
  kpiOptions,
  onClose,
}: {
  initial: AchievementRow | null;
  kpiOptions: { event_key: string; title_fa: string; is_active: boolean }[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    title_fa: initial?.title_fa ?? "",
    title_en: initial?.title_en ?? "",
    description: initial?.description ?? "",
    icon_key: initial?.icon ?? "trophy",
    condition_event_key: initial?.condition_event_key ?? "",
    condition_operator: (initial?.condition_operator ?? ">=") as ConditionOperator,
    condition_value: initial?.condition_value ?? 1,
    reward_xp: initial?.xp_reward ?? 100,
    is_active: initial?.enabled ?? true,
    sort_order: initial?.display_order ?? 0,
  });

  // For new achievements only show active KPIs; for editing also include the
  // currently-selected one even if it became inactive.
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
        icon_key: form.icon_key || undefined,
      });
      // ensure event key is in catalog
      if (!kpiOptions.some((k) => k.event_key === parsed.condition_event_key)) {
        throw new Error("کلید رویداد در فهرست قوانین KPI وجود ندارد");
      }
      const payload = {
        title_fa: parsed.title_fa,
        title_en: parsed.title_en ?? null,
        description: parsed.description ?? null,
        icon_key: parsed.icon_key ?? null,
        condition_event_key: parsed.condition_event_key,
        condition_operator: parsed.condition_operator,
        condition_value: parsed.condition_value,
        reward_xp: parsed.reward_xp,
        is_active: parsed.is_active,
        sort_order: parsed.sort_order,
      };
      if (initial) await updateAchievement(initial.id, payload);
      else await createAchievement(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-achievements-v2"] });
      toast.success(initial ? "ویرایش شد" : "مدال اضافه شد");
      onClose();
    },
    onError: (e: unknown) => {
      if (e instanceof z.ZodError) {
        toast.error(e.issues[0]?.message ?? "ورودی نامعتبر");
        return;
      }
      const msg = e instanceof Error ? e.message : "خطا در ذخیره";
      if (
        msg.includes("achievements_condition_uniq") ||
        msg.includes("duplicate") ||
        msg.includes("unique")
      ) {
        toast.error("این شرط قبلاً برای یک مدال دیگر تعریف شده است.");
      } else {
        toast.error(msg);
      }
    },
  });

  return (
    <DialogContent dir="rtl" className="max-w-lg">
      <DialogHeader>
        <DialogTitle>{initial ? "ویرایش مدال" : "افزودن مدال"}</DialogTitle>
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
            <Label>آیکن</Label>
            <Select value={form.icon_key} onValueChange={(v) => setForm({ ...form, icon_key: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ICON_KEYS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {k}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
        <div>
          <Label>شرط دریافت — رویداد *</Label>
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
        <div className="grid grid-cols-2 gap-3">
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
