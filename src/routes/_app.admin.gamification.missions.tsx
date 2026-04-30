import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { Loader2, Plus, Trash2, ChevronRight } from "lucide-react";

import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { requireAdmin } from "@/lib/rbac/route-guards";
import {
  listMissionsAdmin, upsertMission, toggleMission, deleteMission,
  type MissionAdmin,
} from "@/lib/operations/gamification";

export const Route = createFileRoute("/_app/admin/gamification/missions")({
  beforeLoad: async () => { await requireAdmin(); },
  component: MissionsAdminPage,
});

const schema = z.object({
  key: z.string().trim().min(1).max(80),
  title_fa: z.string().trim().min(1).max(120),
  description: z.string().max(500).optional(),
  target_value: z.coerce.number().min(0),
  xp_reward: z.coerce.number().min(0),
  frequency: z.enum(["daily", "weekly", "monthly"]),
  enabled: z.boolean(),
  display_order: z.coerce.number().min(0).optional(),
});

const FREQ_FA: Record<string, string> = { daily: "روزانه", weekly: "هفتگی", monthly: "ماهانه" };

function MissionsAdminPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["admin-missions"], queryFn: listMissionsAdmin });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<MissionAdmin | null>(null);

  const toggleMut = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => toggleMission(id, enabled),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-missions"] }),
  });
  const delMut = useMutation({
    mutationFn: deleteMission,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-missions"] }); toast.success("حذف شد"); },
  });

  return (
    <div className="space-y-4 pb-10">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/admin/gamification" className="hover:text-foreground">مدیریت گیمیفیکیشن</Link>
        <ChevronRight className="h-4 w-4 rotate-180" />
        <span>مأموریت‌ها</span>
      </div>
      <PageHeader title="مدیریت مأموریت‌ها" description="مأموریت‌های روزانه، هفتگی و ماهانه" />
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">مأموریت‌ها</CardTitle>
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
            <DialogTrigger asChild><Button size="sm" onClick={() => setEditing(null)}><Plus className="ml-1 h-4 w-4" />افزودن</Button></DialogTrigger>
            <MissionDialog initial={editing} onClose={() => { setOpen(false); setEditing(null); }} />
          </Dialog>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>عنوان</TableHead><TableHead>تناوب</TableHead>
                  <TableHead>هدف</TableHead><TableHead>XP</TableHead>
                  <TableHead>فعال</TableHead><TableHead>عملیات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data ?? []).map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.title_fa}</TableCell>
                    <TableCell><Badge variant="outline">{FREQ_FA[m.frequency] ?? m.frequency}</Badge></TableCell>
                    <TableCell className="tabular-nums">{m.target_value}</TableCell>
                    <TableCell className="tabular-nums">{m.xp_reward}</TableCell>
                    <TableCell><Switch checked={m.enabled} onCheckedChange={(v) => toggleMut.mutate({ id: m.id, enabled: v })} /></TableCell>
                    <TableCell className="space-x-1 space-x-reverse">
                      <Button size="sm" variant="ghost" onClick={() => { setEditing(m); setOpen(true); }}>ویرایش</Button>
                      <Button size="sm" variant="ghost" onClick={() => { if (confirm("حذف شود؟")) delMut.mutate(m.id); }}>
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
    </div>
  );
}

function MissionDialog({ initial, onClose }: { initial: MissionAdmin | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    key: initial?.key ?? "",
    title_fa: initial?.title_fa ?? "",
    description: initial?.description ?? "",
    target_value: initial?.target_value ?? 1,
    xp_reward: initial?.xp_reward ?? 50,
    frequency: (initial?.frequency ?? "daily") as MissionAdmin["frequency"],
    enabled: initial?.enabled ?? true,
    display_order: initial?.display_order ?? 0,
  });
  const mut = useMutation({
    mutationFn: async () => {
      const parsed = schema.parse(form);
      await upsertMission(parsed);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-missions"] }); toast.success("ذخیره شد"); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>{initial ? "ویرایش مأموریت" : "افزودن مأموریت"}</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div><Label>کلید</Label><Input value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} disabled={!!initial} /></div>
          <div><Label>عنوان</Label><Input value={form.title_fa} onChange={(e) => setForm({ ...form, title_fa: e.target.value })} /></div>
        </div>
        <div><Label>توضیحات</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label>تناوب</Label>
            <Select value={form.frequency} onValueChange={(v) => setForm({ ...form, frequency: v as MissionAdmin["frequency"] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">روزانه</SelectItem>
                <SelectItem value="weekly">هفتگی</SelectItem>
                <SelectItem value="monthly">ماهانه</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>هدف</Label><Input type="number" value={form.target_value} onChange={(e) => setForm({ ...form, target_value: +e.target.value })} /></div>
          <div><Label>پاداش XP</Label><Input type="number" value={form.xp_reward} onChange={(e) => setForm({ ...form, xp_reward: +e.target.value })} /></div>
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