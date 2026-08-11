import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { Loader2, Plus, Pencil, Eye, Play, Lock } from "lucide-react";

import { PageHeader } from "@/components/common/PageHeader";
import { PersianDatePicker } from "@/components/common/PersianDatePicker";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  listLeagueSettings,
  updateLeagueSetting,
  setLeagueSettingActive,
  listSeasons,
  createSeason,
  updateSeason,
  activateSeason,
  closeSeason,
  previewLeagueSeasonChanges,
  startLeagueSeasonRpc,
  settleLeagueSeasonRpc,
  listRpcSeasons,
  TIER_FA,
  STATUS_FA,
  SEASON_STATUSES,
  type LeagueSettingRow,
  type SeasonRow,
  type SeasonStatus,
  type PreviewRow,
} from "@/lib/operations/gamification-leagues";

export const Route = createFileRoute("/_app/gamification/admin/leagues")({
  beforeLoad: async () => {
    await requireAnyRole(["admin", "manager"]);
  },
  component: LeaguesAdminPage,
});

const tierSchema = z
  .object({
    title_fa: z.string().trim().min(1, "عنوان فارسی الزامی است").max(120),
    title_en: z.string().trim().max(120).optional().or(z.literal("")),
    min_level: z.coerce.number().int().min(0, "حداقل سطح نمی‌تواند منفی باشد"),
    min_xp: z.coerce.number().min(0, "حداقل XP نمی‌تواند منفی باشد"),
    promotion_percent: z.coerce.number().min(0).max(100, "درصد ارتقا باید بین ۰ و ۱۰۰ باشد"),
    demotion_percent: z.coerce.number().min(0).max(100, "درصد سقوط باید بین ۰ و ۱۰۰ باشد"),
    sort_order: z.coerce.number().int().min(0),
    is_active: z.boolean(),
  })
  .refine((v) => v.promotion_percent + v.demotion_percent <= 100, {
    message: "درصد ارتقا و سقوط نمی‌توانند مجموعاً بیشتر از ۱۰۰ باشند",
    path: ["demotion_percent"],
  });

const seasonSchema = z
  .object({
    title_fa: z.string().trim().min(1, "عنوان فارسی الزامی است").max(120),
    title_en: z.string().trim().max(120).optional().or(z.literal("")),
    starts_at: z.string().min(1, "تاریخ شروع الزامی است"),
    ends_at: z.string().min(1, "تاریخ پایان الزامی است"),
    status: z.enum(["draft", "active", "closed"]),
  })
  .refine((v) => new Date(v.ends_at) > new Date(v.starts_at), {
    message: "تاریخ پایان باید بعد از تاریخ شروع باشد",
    path: ["ends_at"],
  });

function fmtDate(d: string | null) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("fa-IR");
  } catch {
    return d;
  }
}

function LeaguesAdminPage() {
  return (
    <div className="container py-6 space-y-6" dir="rtl">
      <PageHeader
        title="مدیریت لیگ‌ها و فصل‌ها"
        description="در این بخش قوانین لیگ‌ها، فصل‌های رقابتی و درصد ارتقا/سقوط مدیریت می‌شود."
      />
      <Tabs defaultValue="tiers" className="w-full">
        <TabsList>
          <TabsTrigger value="tiers">تنظیمات لیگ‌ها</TabsTrigger>
          <TabsTrigger value="seasons">فصل‌ها</TabsTrigger>
          <TabsTrigger value="engine">موتور فصل (RPC)</TabsTrigger>
        </TabsList>
        <TabsContent value="tiers">
          <TiersPanel />
        </TabsContent>
        <TabsContent value="seasons">
          <SeasonsPanel />
        </TabsContent>
        <TabsContent value="engine">
          <SeasonEnginePanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------- Tiers ----------------
function TiersPanel() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["league-settings"],
    queryFn: listLeagueSettings,
  });
  const [editing, setEditing] = useState<LeagueSettingRow | null>(null);

  const toggleMut = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      setLeagueSettingActive(id, is_active),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["league-settings"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>لیگ‌ها</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="animate-spin h-6 w-6" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>لیگ</TableHead>
                <TableHead>عنوان فارسی</TableHead>
                <TableHead>حداقل سطح</TableHead>
                <TableHead>حداقل XP</TableHead>
                <TableHead>درصد ارتقا</TableHead>
                <TableHead>درصد سقوط</TableHead>
                <TableHead>وضعیت</TableHead>
                <TableHead>ترتیب</TableHead>
                <TableHead>عملیات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data ?? []).map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Badge variant="outline">{TIER_FA[row.tier]}</Badge>
                  </TableCell>
                  <TableCell>{row.title_fa}</TableCell>
                  <TableCell>{row.min_level}</TableCell>
                  <TableCell>{row.min_xp}</TableCell>
                  <TableCell>{row.promotion_percent}٪</TableCell>
                  <TableCell>{row.demotion_percent}٪</TableCell>
                  <TableCell>
                    <Switch
                      checked={row.is_active}
                      onCheckedChange={(v) => toggleMut.mutate({ id: row.id, is_active: v })}
                    />
                  </TableCell>
                  <TableCell>{row.sort_order}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(row)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <TierDialog row={editing} open={!!editing} onClose={() => setEditing(null)} />
      </CardContent>
    </Card>
  );
}

function TierDialog({
  row,
  open,
  onClose,
}: {
  row: LeagueSettingRow | null;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState(() => ({
    title_fa: row?.title_fa ?? "",
    title_en: row?.title_en ?? "",
    min_level: row?.min_level ?? 0,
    min_xp: row?.min_xp ?? 0,
    promotion_percent: row?.promotion_percent ?? 20,
    demotion_percent: row?.demotion_percent ?? 20,
    sort_order: row?.sort_order ?? 0,
    is_active: row?.is_active ?? true,
  }));

  // Re-sync when row changes
  const rowKey = row?.id ?? "";
  const [lastKey, setLastKey] = useState(rowKey);
  if (rowKey !== lastKey) {
    setLastKey(rowKey);
    setForm({
      title_fa: row?.title_fa ?? "",
      title_en: row?.title_en ?? "",
      min_level: row?.min_level ?? 0,
      min_xp: row?.min_xp ?? 0,
      promotion_percent: row?.promotion_percent ?? 20,
      demotion_percent: row?.demotion_percent ?? 20,
      sort_order: row?.sort_order ?? 0,
      is_active: row?.is_active ?? true,
    });
  }

  const mut = useMutation({
    mutationFn: async () => {
      if (!row) throw new Error("ردیف نامعتبر");
      const parsed = tierSchema.parse(form);
      return updateLeagueSetting(row.id, {
        ...parsed,
        tier: row.tier,
        title_en: parsed.title_en || null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["league-settings"] });
      toast.success("تنظیمات لیگ به‌روزرسانی شد");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl">
        <DialogHeader>
          <DialogTitle>ویرایش لیگ {row ? TIER_FA[row.tier] : ""}</DialogTitle>
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
          <div>
            <Label>حداقل سطح</Label>
            <Input
              type="number"
              min={0}
              value={form.min_level}
              onChange={(e) => setForm({ ...form, min_level: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label>حداقل XP</Label>
            <Input
              type="number"
              min={0}
              value={form.min_xp}
              onChange={(e) => setForm({ ...form, min_xp: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label>درصد ارتقا</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={form.promotion_percent}
              onChange={(e) => setForm({ ...form, promotion_percent: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label>درصد سقوط</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={form.demotion_percent}
              onChange={(e) => setForm({ ...form, demotion_percent: Number(e.target.value) })}
            />
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

// ---------------- Seasons ----------------
function SeasonsPanel() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["league-seasons-admin"],
    queryFn: listSeasons,
  });
  const [editing, setEditing] = useState<SeasonRow | null>(null);
  const [openCreate, setOpenCreate] = useState(false);
  const [previewSeason, setPreviewSeason] = useState<SeasonRow | null>(null);

  const activateMut = useMutation({
    mutationFn: (id: string) => activateSeason(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["league-seasons-admin"] });
      toast.success("فصل فعال شد");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const closeMut = useMutation({
    mutationFn: (id: string) => closeSeason(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["league-seasons-admin"] });
      toast.success("فصل بسته شد");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>فصل‌ها</CardTitle>
        <Button size="sm" onClick={() => setOpenCreate(true)}>
          <Plus className="ml-1 h-4 w-4" />
          افزودن فصل
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="animate-spin h-6 w-6" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>عنوان فصل</TableHead>
                <TableHead>تاریخ شروع</TableHead>
                <TableHead>تاریخ پایان</TableHead>
                <TableHead>وضعیت</TableHead>
                <TableHead>فعال؟</TableHead>
                <TableHead>عملیات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data ?? []).map((s) => (
                <TableRow key={s.id}>
                  <TableCell>{s.title_fa}</TableCell>
                  <TableCell>{fmtDate(s.starts_at)}</TableCell>
                  <TableCell>{fmtDate(s.ends_at)}</TableCell>
                  <TableCell>
                    <Badge>{STATUS_FA[s.status]}</Badge>
                  </TableCell>
                  <TableCell>{s.is_active ? "بله" : "خیر"}</TableCell>
                  <TableCell className="flex gap-1 flex-wrap">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditing(s)}
                      disabled={s.status === "closed"}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {s.status === "draft" && (
                      <Button size="sm" variant="ghost" onClick={() => activateMut.mutate(s.id)}>
                        <Play className="h-4 w-4" />
                      </Button>
                    )}
                    {s.status === "active" && (
                      <Button size="sm" variant="ghost" onClick={() => closeMut.mutate(s.id)}>
                        <Lock className="h-4 w-4" />
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setPreviewSeason(s)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <SeasonDialog
          row={editing}
          open={!!editing || openCreate}
          isCreate={openCreate}
          onClose={() => {
            setEditing(null);
            setOpenCreate(false);
          }}
        />
        <PreviewDialog season={previewSeason} onClose={() => setPreviewSeason(null)} />
      </CardContent>
    </Card>
  );
}

function SeasonDialog({
  row,
  open,
  isCreate,
  onClose,
}: {
  row: SeasonRow | null;
  open: boolean;
  isCreate: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    title_fa: "",
    title_en: "",
    starts_at: "",
    ends_at: "",
    status: "draft" as SeasonStatus,
  });

  const rowKey = isCreate ? "new" : (row?.id ?? "");
  const [lastKey, setLastKey] = useState("");
  if (rowKey !== lastKey && open) {
    setLastKey(rowKey);
    setForm({
      title_fa: row?.title_fa ?? "",
      title_en: row?.title_en ?? "",
      starts_at: row?.starts_at ? row.starts_at.slice(0, 10) : "",
      ends_at: row?.ends_at ? row.ends_at.slice(0, 10) : "",
      status: row?.status ?? "draft",
    });
  }

  const mut = useMutation({
    mutationFn: async () => {
      const parsed = seasonSchema.parse(form);
      const input = {
        title_fa: parsed.title_fa,
        title_en: parsed.title_en || null,
        starts_at: new Date(parsed.starts_at).toISOString(),
        ends_at: new Date(parsed.ends_at).toISOString(),
        status: parsed.status,
      };
      if (isCreate) return createSeason(input);
      if (!row) throw new Error("ردیف نامعتبر");
      return updateSeason(row.id, input);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["league-seasons-admin"] });
      toast.success("فصل ذخیره شد");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl">
        <DialogHeader>
          <DialogTitle>{isCreate ? "افزودن فصل" : "ویرایش فصل"}</DialogTitle>
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
          <div>
            <Label>تاریخ شروع</Label>
            <PersianDatePicker
              value={form.starts_at || null}
              onChange={(v) => setForm({ ...form, starts_at: v ?? "" })}
              placeholder="تاریخ شروع"
            />
          </div>
          <div>
            <Label>تاریخ پایان</Label>
            <PersianDatePicker
              value={form.ends_at || null}
              onChange={(v) => setForm({ ...form, ends_at: v ?? "" })}
              placeholder="تاریخ پایان"
            />
          </div>
          <div className="col-span-2">
            <Label>وضعیت</Label>
            <Select
              value={form.status}
              onValueChange={(v) => setForm({ ...form, status: v as SeasonStatus })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SEASON_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_FA[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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

function SeasonEnginePanel() {
  const qc = useQueryClient();
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    .toISOString()
    .slice(0, 10);
  const defaultName = monthStart.slice(0, 7);

  const [name, setName] = useState(defaultName);
  const [start, setStart] = useState(monthStart);
  const [end, setEnd] = useState(monthEnd);
  const [lastSettle, setLastSettle] = useState<Record<string, unknown> | null>(null);

  const seasonsQ = useQuery({
    queryKey: ["league-rpc-seasons"],
    queryFn: listRpcSeasons,
  });

  const startMut = useMutation({
    mutationFn: () => startLeagueSeasonRpc({ name, start, end }),
    onSuccess: (id) => {
      toast.success(`فصل با RPC شروع شد (${id.slice(0, 8)}…)`);
      qc.invalidateQueries({ queryKey: ["league-rpc-seasons"] });
      qc.invalidateQueries({ queryKey: ["league-seasons-admin"] });
      qc.invalidateQueries({ queryKey: ["current-league"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const settleMut = useMutation({
    mutationFn: () => settleLeagueSeasonRpc(),
    onSuccess: (result) => {
      setLastSettle(result);
      if (result.bootstrapped) {
        toast.success("فصل جاری بوت‌استرپ شد (فصل فعالی نبود)");
      } else {
        toast.success(
          `تسویه شد — فصل بعد: ${String(result.new_season_name ?? "—")}، اعضا: ${String(result.employees_settled ?? 0)}`,
        );
      }
      qc.invalidateQueries({ queryKey: ["league-rpc-seasons"] });
      qc.invalidateQueries({ queryKey: ["league-seasons-admin"] });
      qc.invalidateQueries({ queryKey: ["current-league"] });
      qc.invalidateQueries({ queryKey: ["league-leaderboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
        توجه: RPCهای <code>start_league_season</code> / <code>settle_league_season</code> ستون‌های
        قدیمی را می‌نویسند، در حالی که تریگر <code>validate_league_season</code> فیلدهای{" "}
        <code>title_fa</code> / <code>starts_at</code> / <code>ends_at</code> را اجباری کرده است. تا
        رفع با مهاجرت، از تب «فصل‌ها» استفاده کنید یا خطای فارسی RPC را اینجا ببینید.
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">شروع فصل (`start_league_season`)</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <Label>نام فصل</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="2026-08" />
          </div>
          <div>
            <Label>شروع</Label>
            <PersianDatePicker
              value={start || null}
              onChange={(v) => setStart(v ?? "")}
              placeholder="شروع"
            />
          </div>
          <div>
            <Label>پایان</Label>
            <PersianDatePicker
              value={end || null}
              onChange={(v) => setEnd(v ?? "")}
              placeholder="پایان"
            />
          </div>
          <div className="flex items-end">
            <Button
              className="w-full"
              onClick={() => startMut.mutate()}
              disabled={startMut.isPending || !name || !start || !end}
            >
              {startMut.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              شروع فصل فعال
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">تسویه فصل (`settle_league_season`)</CardTitle>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => settleMut.mutate()}
            disabled={settleMut.isPending}
          >
            {settleMut.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
            تسویه و باز کردن فصل بعد
          </Button>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            امتیاز ماهانه از <code>employee_scores</code> خوانده می‌شود؛ منطق ارتقا/سقوط فقط در
            بک‌اند است.
          </p>
          {lastSettle && (
            <pre className="rounded-md border bg-muted/40 p-3 text-xs overflow-x-auto" dir="ltr">
              {JSON.stringify(lastSettle, null, 2)}
            </pre>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">فصل‌های ثبت‌شده</CardTitle>
        </CardHeader>
        <CardContent>
          {seasonsQ.isLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>نام</TableHead>
                  <TableHead>بازه</TableHead>
                  <TableHead>فعال؟</TableHead>
                  <TableHead>وضعیت UI</TableHead>
                  <TableHead>تسویه</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(seasonsQ.data ?? []).map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>{s.season_name || s.title_fa || "—"}</TableCell>
                    <TableCell>
                      {s.start_date || s.end_date
                        ? `${s.start_date ?? "—"} ← ${s.end_date ?? "—"}`
                        : "—"}
                    </TableCell>
                    <TableCell>{s.is_active ? "بله" : "خیر"}</TableCell>
                    <TableCell>
                      <Badge>{STATUS_FA[s.status] ?? s.status}</Badge>
                    </TableCell>
                    <TableCell>{s.settled_at ? fmtDate(s.settled_at) : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PreviewDialog({ season, onClose }: { season: SeasonRow | null; onClose: () => void }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["league-preview", season?.id],
    queryFn: () => previewLeagueSeasonChanges(season!.id),
    enabled: !!season,
  });

  return (
    <Dialog open={!!season} onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>پیش‌نمایش ارتقا/سقوط — {season?.title_fa}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="animate-spin h-6 w-6" />
          </div>
        ) : error ? (
          <div className="text-destructive text-sm">{(error as Error).message}</div>
        ) : (data ?? []).length === 0 ? (
          <div className="text-sm text-muted-foreground py-4">
            داده‌ای برای این فصل ثبت نشده است. منبع امتیازدهی فصل برای پیش‌نمایش ارتقا/سقوط هنوز
            کامل نیست.
          </div>
        ) : (
          <div className="max-h-[60vh] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>کارمند</TableHead>
                  <TableHead>لیگ فعلی</TableHead>
                  <TableHead>امتیاز</TableHead>
                  <TableHead>رتبه</TableHead>
                  <TableHead>پیشنهاد</TableHead>
                  <TableHead>لیگ هدف</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data as PreviewRow[]).map((r) => (
                  <TableRow key={r.employee_id}>
                    <TableCell>{r.full_name}</TableCell>
                    <TableCell>{TIER_FA[r.current_tier]}</TableCell>
                    <TableCell>{r.score}</TableCell>
                    <TableCell>{r.rank_in_tier}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          r.suggested_action === "promote"
                            ? "default"
                            : r.suggested_action === "demote"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {r.suggested_action === "promote"
                          ? "ارتقا"
                          : r.suggested_action === "demote"
                            ? "سقوط"
                            : "ماندن"}
                      </Badge>
                    </TableCell>
                    <TableCell>{TIER_FA[r.target_tier]}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <div className="text-xs text-muted-foreground border-t pt-2">
          اعمال خودکار ارتقا/سقوط در این فاز فعال نیست.{" "}
          <code>Apply league season changes deferred until scoring source is finalized.</code>
        </div>
      </DialogContent>
    </Dialog>
  );
}
