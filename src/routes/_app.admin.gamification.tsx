import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Loader2, Plus, Trash2, Trophy, Users, Sparkles, Award, Crown, Settings } from "lucide-react";

import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { requireAdmin } from "@/lib/rbac/route-guards";
import {
  getAdminGamificationOverview,
  listKpis, upsertKpi, toggleKpi, deleteKpi,
  getLeagueSettings, updateLeagueSettings,
  listRewards, upsertReward, toggleReward, deleteReward,
  type GamificationReward,
} from "@/lib/operations/gamification";

export const Route = createFileRoute("/_app/admin/gamification")({
  beforeLoad: async () => { await requireAdmin(); },
  component: AdminGamificationPage,
});

const COLORS = ["#f59e0b", "#94a3b8", "#eab308", "#22d3ee", "#a78bfa", "#ec4899"];

function AdminGamificationPage() {
  return (
    <div className="space-y-6 pb-10">
      <PageHeader title="مدیریت گیمیفیکیشن" description="نمای کلی، شاخص‌ها، لیگ و پاداش‌ها" />
      <Tabs defaultValue="overview" dir="rtl">
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview"><Trophy className="ml-1 h-4 w-4" />نمای کلی</TabsTrigger>
          <TabsTrigger value="kpis"><Sparkles className="ml-1 h-4 w-4" />KPIها</TabsTrigger>
          <TabsTrigger value="league"><Crown className="ml-1 h-4 w-4" />تنظیمات لیگ</TabsTrigger>
          <TabsTrigger value="rewards"><Award className="ml-1 h-4 w-4" />پاداش‌ها</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="mt-4"><OverviewTab /></TabsContent>
        <TabsContent value="kpis" className="mt-4"><KpiTab /></TabsContent>
        <TabsContent value="league" className="mt-4"><LeagueSettingsTab /></TabsContent>
        <TabsContent value="rewards" className="mt-4"><RewardsTab /></TabsContent>
      </Tabs>
    </div>
  );
}

// ============== Overview ==============
function OverviewTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-gam-overview"],
    queryFn: getAdminGamificationOverview,
  });

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!data) return <div className="p-8 text-center text-sm text-muted-foreground">داده‌ای یافت نشد.</div>;

  const stats = [
    { label: "تعداد کارمندان", value: data.total_employees, icon: Users, color: "text-blue-500" },
    { label: "میانگین XP", value: Math.floor(data.avg_xp), icon: Sparkles, color: "text-yellow-500" },
    { label: "میانگین سطح", value: data.avg_level, icon: Trophy, color: "text-amber-500" },
    { label: "بازیکن برتر", value: data.top_players[0]?.full_name ?? "—", icon: Crown, color: "text-fuchsia-500" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="flex items-center gap-3 p-4">
              <s.icon className={`h-8 w-8 ${s.color}`} />
              <div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
                <div className="text-xl font-bold tabular-nums truncate">{s.value}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">توزیع لیگ</CardTitle></CardHeader>
          <CardContent>
            {data.league_distribution.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">داده‌ای موجود نیست.</div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={data.league_distribution} dataKey="count" nameKey="league" outerRadius={80} label>
                    {data.league_distribution.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip /><Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">توزیع XP</CardTitle></CardHeader>
          <CardContent>
            {data.xp_distribution.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">داده‌ای موجود نیست.</div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data.xp_distribution}>
                  <XAxis dataKey="bucket" /><YAxis /><Tooltip />
                  <Bar dataKey="count" fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">تکمیل مأموریت‌ها</CardTitle></CardHeader>
        <CardContent>
          {data.missions_completion.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">مأموریتی تعریف نشده.</div>
          ) : (
            <div className="space-y-2">
              {data.missions_completion.map((m) => {
                const pct = m.total > 0 ? (m.completed / m.total) * 100 : 0;
                return (
                  <div key={m.mission}>
                    <div className="flex justify-between text-sm">
                      <span>{m.mission}</span>
                      <span className="tabular-nums text-muted-foreground">{m.completed}/{m.total}</span>
                    </div>
                    <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">برترین بازیکنان</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow><TableHead>رتبه</TableHead><TableHead>نام</TableHead><TableHead>سطح</TableHead><TableHead>XP</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {data.top_players.map((p, i) => (
                <TableRow key={p.employee_id}>
                  <TableCell>{i + 1}</TableCell>
                  <TableCell>{p.full_name ?? "—"}</TableCell>
                  <TableCell>{p.level}</TableCell>
                  <TableCell className="tabular-nums">{Math.floor(p.xp_total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ============== KPIs ==============
const kpiSchema = z.object({
  key: z.string().trim().min(1).max(80),
  label_fa: z.string().trim().min(1).max(120),
  description: z.string().max(500).optional(),
  weight: z.coerce.number().min(0).max(100),
  unit: z.string().max(20).optional(),
  team_scope: z.enum(["all", "sales", "support", "manager"]),
  source: z.string().min(1).max(60),
  direction: z.enum(["higher_better", "lower_better"]),
  enabled: z.boolean(),
});

function KpiTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["admin-kpis"], queryFn: listKpis });
  const [open, setOpen] = useState(false);

  const toggleMut = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => toggleKpi(id, enabled),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-kpis"] }),
  });
  const delMut = useMutation({
    mutationFn: deleteKpi,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-kpis"] }); toast.success("حذف شد"); },
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">شاخص‌های گیمیفیکیشن</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="ml-1 h-4 w-4" />افزودن</Button></DialogTrigger>
          <KpiDialog onClose={() => setOpen(false)} />
        </Dialog>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>عنوان</TableHead><TableHead>کلید</TableHead>
                <TableHead>وزن</TableHead><TableHead>واحد</TableHead>
                <TableHead>فعال</TableHead><TableHead>عملیات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data ?? []).map((k) => (
                <TableRow key={k.id}>
                  <TableCell className="font-medium">{k.label_fa}</TableCell>
                  <TableCell className="font-mono text-xs">{k.key}</TableCell>
                  <TableCell className="tabular-nums">{k.weight}</TableCell>
                  <TableCell>{k.unit ?? "—"}</TableCell>
                  <TableCell>
                    <Switch checked={k.enabled} onCheckedChange={(v) => toggleMut.mutate({ id: k.id, enabled: v })} />
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost" onClick={() => { if (confirm("حذف شود؟")) delMut.mutate(k.id); }}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
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

function KpiDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    key: "", label_fa: "", description: "", weight: 1,
    unit: "", team_scope: "all" as const, source: "invoices",
    direction: "higher_better" as const, enabled: true,
  });
  const mut = useMutation({
    mutationFn: async () => {
      const parsed = kpiSchema.parse(form);
      await upsertKpi(parsed);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-kpis"] });
      toast.success("ذخیره شد"); onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>افزودن KPI</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div><Label>کلید</Label><Input value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} /></div>
          <div><Label>عنوان</Label><Input value={form.label_fa} onChange={(e) => setForm({ ...form, label_fa: e.target.value })} /></div>
        </div>
        <div><Label>توضیحات</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        <div className="grid grid-cols-3 gap-3">
          <div><Label>وزن</Label><Input type="number" step="0.1" value={form.weight} onChange={(e) => setForm({ ...form, weight: +e.target.value })} /></div>
          <div><Label>واحد</Label><Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} /></div>
          <div><Label>منبع</Label><Input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>دامنه تیم</Label>
            <Select value={form.team_scope} onValueChange={(v) => setForm({ ...form, team_scope: v as typeof form.team_scope })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه</SelectItem><SelectItem value="sales">فروش</SelectItem>
                <SelectItem value="support">پشتیبانی</SelectItem><SelectItem value="manager">مدیر</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>جهت</Label>
            <Select value={form.direction} onValueChange={(v) => setForm({ ...form, direction: v as typeof form.direction })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="higher_better">بیشتر = بهتر</SelectItem>
                <SelectItem value="lower_better">کمتر = بهتر</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: v })} />
          <Label>فعال</Label>
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>انصراف</Button>
        <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
          {mut.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}ذخیره
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ============== League Settings ==============
function LeagueSettingsTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["league-settings"], queryFn: getLeagueSettings });
  const [form, setForm] = useState({ promotion_percent: 20, demotion_percent: 20, season_duration_days: 30 });
  const [loaded, setLoaded] = useState(false);

  if (data && !loaded) {
    setForm({ promotion_percent: data.promotion_percent, demotion_percent: data.demotion_percent, season_duration_days: data.season_duration_days });
    setLoaded(true);
  }

  const mut = useMutation({
    mutationFn: () => updateLeagueSettings(data!.id, form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["league-settings"] }); toast.success("تنظیمات ذخیره شد"); },
  });

  if (isLoading || !data) return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Settings className="h-5 w-5" />تنظیمات لیگ</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>درصد ارتقا (%)</Label>
          <Input type="number" min={0} max={100} value={form.promotion_percent}
            onChange={(e) => setForm({ ...form, promotion_percent: +e.target.value })} />
          <p className="mt-1 text-xs text-muted-foreground">درصد بالایی که در پایان فصل به لیگ بالاتر می‌روند.</p>
        </div>
        <div>
          <Label>درصد تنزل (%)</Label>
          <Input type="number" min={0} max={100} value={form.demotion_percent}
            onChange={(e) => setForm({ ...form, demotion_percent: +e.target.value })} />
          <p className="mt-1 text-xs text-muted-foreground">درصد پایینی که به لیگ پایین‌تر می‌روند.</p>
        </div>
        <div>
          <Label>طول فصل (روز)</Label>
          <Input type="number" min={1} value={form.season_duration_days}
            onChange={(e) => setForm({ ...form, season_duration_days: +e.target.value })} />
        </div>
        <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
          {mut.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}ذخیره تنظیمات
        </Button>
      </CardContent>
    </Card>
  );
}

// ============== Rewards ==============
const rewardSchema = z.object({
  key: z.string().trim().min(1).max(80),
  title_fa: z.string().trim().min(1).max(120),
  description: z.string().max(500).optional(),
  trigger_type: z.enum(["level", "league", "streak", "manual"]),
  trigger_value: z.coerce.number().min(0),
  reward_type: z.enum(["xp_bonus", "badge", "gift", "custom"]),
  reward_value: z.coerce.number().nullable().optional(),
  notes: z.string().max(500).optional(),
  enabled: z.boolean(),
});

function RewardsTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["rewards"], queryFn: listRewards });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<GamificationReward | null>(null);

  const toggleMut = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => toggleReward(id, enabled),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rewards"] }),
  });
  const delMut = useMutation({
    mutationFn: deleteReward,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["rewards"] }); toast.success("حذف شد"); },
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">پاداش‌ها</CardTitle>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={() => setEditing(null)}><Plus className="ml-1 h-4 w-4" />افزودن</Button>
          </DialogTrigger>
          <RewardDialog initial={editing} onClose={() => { setOpen(false); setEditing(null); }} />
        </Dialog>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>عنوان</TableHead><TableHead>محرک</TableHead><TableHead>پاداش</TableHead>
                <TableHead>فعال</TableHead><TableHead>عملیات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data ?? []).map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.title_fa}</TableCell>
                  <TableCell><Badge variant="outline">{r.trigger_type} ≥ {r.trigger_value}</Badge></TableCell>
                  <TableCell><Badge>{r.reward_type}{r.reward_value != null ? ` (${r.reward_value})` : ""}</Badge></TableCell>
                  <TableCell>
                    <Switch checked={r.enabled} onCheckedChange={(v) => toggleMut.mutate({ id: r.id, enabled: v })} />
                  </TableCell>
                  <TableCell className="space-x-1 space-x-reverse">
                    <Button size="sm" variant="ghost" onClick={() => { setEditing(r); setOpen(true); }}>ویرایش</Button>
                    <Button size="sm" variant="ghost" onClick={() => { if (confirm("حذف شود؟")) delMut.mutate(r.id); }}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
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

function RewardDialog({ initial, onClose }: { initial: GamificationReward | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    key: initial?.key ?? "",
    title_fa: initial?.title_fa ?? "",
    description: initial?.description ?? "",
    trigger_type: (initial?.trigger_type ?? "level") as "level" | "league" | "streak" | "manual",
    trigger_value: initial?.trigger_value ?? 1,
    reward_type: (initial?.reward_type ?? "xp_bonus") as "xp_bonus" | "badge" | "gift" | "custom",
    reward_value: initial?.reward_value ?? null,
    notes: initial?.notes ?? "",
    enabled: initial?.enabled ?? true,
  });
  const mut = useMutation({
    mutationFn: async () => {
      const parsed = rewardSchema.parse(form);
      await upsertReward(parsed);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["rewards"] }); toast.success("ذخیره شد"); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>{initial ? "ویرایش پاداش" : "افزودن پاداش"}</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div><Label>کلید</Label><Input value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} disabled={!!initial} /></div>
          <div><Label>عنوان</Label><Input value={form.title_fa} onChange={(e) => setForm({ ...form, title_fa: e.target.value })} /></div>
        </div>
        <div><Label>توضیحات</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>نوع محرک</Label>
            <Select value={form.trigger_type} onValueChange={(v) => setForm({ ...form, trigger_type: v as typeof form.trigger_type })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="level">سطح</SelectItem><SelectItem value="league">لیگ</SelectItem>
                <SelectItem value="streak">زنجیره</SelectItem><SelectItem value="manual">دستی</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>مقدار محرک</Label><Input type="number" value={form.trigger_value} onChange={(e) => setForm({ ...form, trigger_value: +e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>نوع پاداش</Label>
            <Select value={form.reward_type} onValueChange={(v) => setForm({ ...form, reward_type: v as typeof form.reward_type })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="xp_bonus">XP اضافه</SelectItem><SelectItem value="badge">نشان</SelectItem>
                <SelectItem value="gift">هدیه</SelectItem><SelectItem value="custom">سفارشی</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>مقدار پاداش</Label><Input type="number" value={form.reward_value ?? ""} onChange={(e) => setForm({ ...form, reward_value: e.target.value === "" ? null : +e.target.value })} /></div>
        </div>
        <div><Label>یادداشت</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        <div className="flex items-center gap-2">
          <Switch checked={form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: v })} />
          <Label>فعال</Label>
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>انصراف</Button>
        <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
          {mut.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}ذخیره
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}