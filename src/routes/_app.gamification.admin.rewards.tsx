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
import { Textarea } from "@/components/ui/textarea";
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
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { requireAnyRole } from "@/lib/rbac/route-guards";
import {
  listRewards,
  createReward,
  updateReward,
  setRewardActive,
  listAchievementOptions,
  listMissionOptions,
  listLeagueOptions,
  REWARD_TYPES,
  REWARD_TYPE_FA,
  TRIGGER_TYPES,
  TRIGGER_TYPE_FA,
  REWARD_UNITS,
  REWARD_UNIT_FA,
  type RewardRow,
  type RewardType,
  type TriggerType,
  type RewardUnit,
} from "@/lib/operations/gamification-rewards";

export const Route = createFileRoute("/_app/gamification/admin/rewards")({
  beforeLoad: async () => {
    await requireAnyRole(["admin", "manager"]);
  },
  component: RewardsAdminPage,
});

const schema = z
  .object({
    title_fa: z.string().trim().min(1, "عنوان فارسی الزامی است").max(120),
    title_en: z.string().trim().max(120).optional().or(z.literal("")),
    description: z.string().max(500).optional().or(z.literal("")),
    reward_type: z.enum(
      ["gift_card", "cash_bonus", "commission_bonus", "paid_leave", "badge_reward", "custom"],
      { message: "نوع پاداش الزامی است" },
    ),
    trigger_type: z.enum(
      [
        "level_reached",
        "achievement_unlocked",
        "mission_completed",
        "league_reached",
        "season_top_rank",
      ],
      { message: "محرک پاداش الزامی است" },
    ),
    trigger_ref_id: z.string().optional().or(z.literal("")),
    trigger_value: z
      .union([z.coerce.number(), z.literal("").transform(() => null), z.null()])
      .optional(),
    reward_value: z
      .union([
        z.coerce.number().min(0, "مقدار پاداش نمی‌تواند منفی باشد"),
        z.literal("").transform(() => null),
        z.null(),
      ])
      .optional(),
    reward_unit: z.enum(["toman", "day", "percent", "point", "item", "custom"]),
    requires_manual_approval: z.boolean(),
    is_active: z.boolean(),
    sort_order: z.coerce.number().int().min(0),
  })
  .superRefine((v, ctx) => {
    if (v.trigger_type === "level_reached" || v.trigger_type === "season_top_rank") {
      const n = typeof v.trigger_value === "number" ? v.trigger_value : NaN;
      if (!Number.isFinite(n) || n <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["trigger_value"],
          message: "برای این نوع محرک، مقدار عددی الزامی است",
        });
      }
    }
    if (
      v.trigger_type === "achievement_unlocked" ||
      v.trigger_type === "mission_completed" ||
      v.trigger_type === "league_reached"
    ) {
      if (!v.trigger_ref_id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["trigger_ref_id"],
          message: "برای این نوع محرک، انتخاب مرجع الزامی است",
        });
      }
    }
  });

function fmtDate(d: string | null) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString("fa-IR");
  } catch {
    return d;
  }
}

function RewardsAdminPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["admin-rewards"], queryFn: listRewards });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RewardRow | null>(null);

  const toggleMut = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      setRewardActive(id, is_active),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-rewards"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="container py-6 space-y-6" dir="rtl">
      <PageHeader
        title="مدیریت پاداش‌ها"
        description="در این بخش پاداش‌های مدیریتی برای سطح، مدال، مأموریت و لیگ تعریف می‌شوند. این فاز فقط تعریف قانون پاداش است و پرداخت یا تسویه انجام نمی‌دهد."
      />
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>پاداش‌ها</CardTitle>
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus className="ml-1 h-4 w-4" />
            افزودن پاداش
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="animate-spin h-6 w-6" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>عنوان</TableHead>
                    <TableHead>نوع پاداش</TableHead>
                    <TableHead>محرک پاداش</TableHead>
                    <TableHead>مقدار پاداش</TableHead>
                    <TableHead>نیاز به تأیید دستی</TableHead>
                    <TableHead>وضعیت</TableHead>
                    <TableHead>ترتیب</TableHead>
                    <TableHead>آخرین ویرایش</TableHead>
                    <TableHead>عملیات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data ?? []).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.title_fa}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{REWARD_TYPE_FA[r.reward_type]}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{TRIGGER_TYPE_FA[r.trigger_type]}</Badge>
                        {r.trigger_value ? (
                          <span className="mr-1 text-xs text-muted-foreground">
                            ({r.trigger_value})
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {r.reward_value ?? "—"}{" "}
                        {r.reward_value != null ? REWARD_UNIT_FA[r.reward_unit] : ""}
                      </TableCell>
                      <TableCell>{r.requires_manual_approval ? "بله" : "خیر"}</TableCell>
                      <TableCell>
                        <Switch
                          checked={r.is_active}
                          onCheckedChange={(v) => toggleMut.mutate({ id: r.id, is_active: v })}
                        />
                      </TableCell>
                      <TableCell>{r.sort_order}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {fmtDate(r.updated_at)}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditing(r);
                            setOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <RewardDialog
            row={editing}
            open={open}
            onClose={() => {
              setOpen(false);
              setEditing(null);
            }}
          />
          <p className="mt-4 text-xs text-muted-foreground border-t pt-2">
            <code>Reward execution engine not implemented yet.</code> در این فاز تعریف پاداش انجام
            می‌شود و اجرای خودکار، پرداخت یا تسویه فعال نیست.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function RewardDialog({
  row,
  open,
  onClose,
}: {
  row: RewardRow | null;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const isEdit = !!row;

  const [form, setForm] = useState({
    title_fa: "",
    title_en: "",
    description: "",
    reward_type: "cash_bonus" as RewardType,
    trigger_type: "level_reached" as TriggerType,
    trigger_ref_id: "",
    trigger_value: "" as string | number,
    reward_value: "" as string | number,
    reward_unit: "toman" as RewardUnit,
    requires_manual_approval: true,
    is_active: true,
    sort_order: 0,
  });

  const rowKey = isEdit ? row!.id : "new";
  const [lastKey, setLastKey] = useState("");
  if (rowKey !== lastKey && open) {
    setLastKey(rowKey);
    setForm({
      title_fa: row?.title_fa ?? "",
      title_en: row?.title_en ?? "",
      description: row?.description ?? "",
      reward_type: row?.reward_type ?? "cash_bonus",
      trigger_type: row?.trigger_type ?? "level_reached",
      trigger_ref_id: row?.trigger_ref_id ?? "",
      trigger_value: row?.trigger_value ?? "",
      reward_value: row?.reward_value ?? "",
      reward_unit: row?.reward_unit ?? "toman",
      requires_manual_approval: row?.requires_manual_approval ?? true,
      is_active: row?.is_active ?? true,
      sort_order: row?.sort_order ?? 0,
    });
  }

  const { data: achievements } = useQuery({
    queryKey: ["reward-options-achievements"],
    queryFn: listAchievementOptions,
    staleTime: 60_000,
    enabled: open && form.trigger_type === "achievement_unlocked",
  });
  const { data: missions } = useQuery({
    queryKey: ["reward-options-missions"],
    queryFn: listMissionOptions,
    staleTime: 60_000,
    enabled: open && form.trigger_type === "mission_completed",
  });
  const { data: leagues } = useQuery({
    queryKey: ["reward-options-leagues"],
    queryFn: listLeagueOptions,
    staleTime: 60_000,
    enabled: open && form.trigger_type === "league_reached",
  });

  const refOptions = useMemo(() => {
    if (form.trigger_type === "achievement_unlocked")
      return (achievements ?? []).map((a) => ({ id: a.id, label: a.title_fa }));
    if (form.trigger_type === "mission_completed")
      return (missions ?? []).map((m) => ({ id: m.id, label: m.title_fa }));
    if (form.trigger_type === "league_reached")
      return (leagues ?? []).map((l) => ({ id: l.id, label: l.title_fa }));
    return [];
  }, [form.trigger_type, achievements, missions, leagues]);

  const needsRef =
    form.trigger_type === "achievement_unlocked" ||
    form.trigger_type === "mission_completed" ||
    form.trigger_type === "league_reached";
  const needsValue =
    form.trigger_type === "level_reached" || form.trigger_type === "season_top_rank";

  const mut = useMutation({
    mutationFn: async () => {
      const parsed = schema.parse(form);
      const input = {
        title_fa: parsed.title_fa,
        title_en: parsed.title_en || null,
        description: parsed.description || null,
        reward_type: parsed.reward_type,
        trigger_type: parsed.trigger_type,
        trigger_ref_id: needsRef ? parsed.trigger_ref_id || null : null,
        trigger_value:
          needsValue && typeof parsed.trigger_value === "number" ? parsed.trigger_value : null,
        reward_value: typeof parsed.reward_value === "number" ? parsed.reward_value : null,
        reward_unit: parsed.reward_unit,
        requires_manual_approval: parsed.requires_manual_approval,
        is_active: parsed.is_active,
        sort_order: parsed.sort_order,
      };
      if (isEdit && row) return updateReward(row.id, input);
      return createReward(input);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-rewards"] });
      toast.success("پاداش ذخیره شد");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "ویرایش پاداش" : "افزودن پاداش"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>عنوان فارسی</Label>
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
          <div className="col-span-2">
            <Label>توضیح</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>

          <div>
            <Label>نوع پاداش</Label>
            <Select
              value={form.reward_type}
              onValueChange={(v) => setForm({ ...form, reward_type: v as RewardType })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REWARD_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {REWARD_TYPE_FA[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>محرک پاداش</Label>
            <Select
              value={form.trigger_type}
              onValueChange={(v) =>
                setForm({
                  ...form,
                  trigger_type: v as TriggerType,
                  trigger_ref_id: "",
                  trigger_value: "",
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRIGGER_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {TRIGGER_TYPE_FA[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {needsRef && (
            <div className="col-span-2">
              <Label>مرجع محرک</Label>
              <Select
                value={form.trigger_ref_id}
                onValueChange={(v) => setForm({ ...form, trigger_ref_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="انتخاب کنید" />
                </SelectTrigger>
                <SelectContent>
                  {refOptions.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {needsValue && (
            <div>
              <Label>{form.trigger_type === "level_reached" ? "سطح هدف" : "رتبه/آستانه"}</Label>
              <Input
                type="number"
                min={1}
                value={form.trigger_value as number | string}
                onChange={(e) => setForm({ ...form, trigger_value: e.target.value })}
              />
            </div>
          )}

          <div>
            <Label>مقدار پاداش</Label>
            <Input
              type="number"
              min={0}
              value={form.reward_value as number | string}
              onChange={(e) => setForm({ ...form, reward_value: e.target.value })}
            />
          </div>
          <div>
            <Label>واحد</Label>
            <Select
              value={form.reward_unit}
              onValueChange={(v) => setForm({ ...form, reward_unit: v as RewardUnit })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REWARD_UNITS.map((u) => (
                  <SelectItem key={u} value={u}>
                    {REWARD_UNIT_FA[u]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>ترتیب</Label>
            <Input
              type="number"
              min={0}
              value={form.sort_order}
              onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })}
            />
          </div>
          <div className="flex items-center gap-2 pt-6">
            <Switch
              checked={form.requires_manual_approval}
              onCheckedChange={(v) => setForm({ ...form, requires_manual_approval: v })}
            />
            <Label>نیاز به تأیید دستی</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={form.is_active}
              onCheckedChange={(v) => setForm({ ...form, is_active: v })}
            />
            <Label>فعال</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            انصراف
          </Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}ذخیره
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
