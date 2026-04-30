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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { requireAdmin } from "@/lib/rbac/route-guards";
import {
  listAchievementsAdmin, upsertAchievement, toggleAchievement, deleteAchievement,
  type AchievementAdmin,
} from "@/lib/operations/gamification";

export const Route = createFileRoute("/_app/admin/gamification/achievements")({
  beforeLoad: async () => { await requireAdmin(); },
  component: AchievementsAdminPage,
});

const schema = z.object({
  key: z.string().trim().min(1).max(80),
  title_fa: z.string().trim().min(1).max(120),
  description: z.string().max(500).optional(),
  icon: z.string().max(60).optional(),
  rule_type: z.enum(["manual", "level", "streak", "score", "missions_completed"]),
  rule_value: z.coerce.number().nullable().optional(),
  xp_reward: z.coerce.number().min(0),
  enabled: z.boolean(),
  display_order: z.coerce.number().min(0).optional(),
});

function AchievementsAdminPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["admin-achievements"], queryFn: listAchievementsAdmin });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AchievementAdmin | null>(null);

  const toggleMut = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => toggleAchievement(id, enabled),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-achievements"] }),
  });
  const delMut = useMutation({
    mutationFn: deleteAchievement,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-achievements"] }); toast.success("حذف شد"); },
  });

  return (
    <div className="space-y-4 pb-10">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/admin/gamification" className="hover:text-foreground">مدیریت گیمیفیکیشن</Link>
        <ChevronRight className="h-4 w-4 rotate-180" />
        <span>نشان‌ها</span>
      </div>
      <PageHeader title="مدیریت نشان‌ها" description="افزودن، ویرایش و فعال/غیرفعال کردن نشان‌ها" />
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">نشان‌ها</CardTitle>
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
            <DialogTrigger asChild><Button size="sm" onClick={() => setEditing(null)}><Plus className="ml-1 h-4 w-4" />افزودن</Button></DialogTrigger>
            <AchievementDialog initial={editing} onClose={() => { setOpen(false); setEditing(null); }} />
          </Dialog>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>عنوان</TableHead><TableHead>قانون</TableHead>
                  <TableHead>XP</TableHead><TableHead>فعال</TableHead><TableHead>عملیات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data ?? []).map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.title_fa}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{a.rule_type}{a.rule_value != null ? ` ≥ ${a.rule_value}` : ""}</TableCell>
                    <TableCell className="tabular-nums">{a.xp_reward}</TableCell>
                    <TableCell><Switch checked={a.enabled} onCheckedChange={(v) => toggleMut.mutate({ id: a.id, enabled: v })} /></TableCell>
                    <TableCell className="space-x-1 space-x-reverse">
                      <Button size="sm" variant="ghost" onClick={() => { setEditing(a); setOpen(true); }}>ویرایش</Button>
                      <Button size="sm" variant="ghost" onClick={() => { if (confirm("حذف شود؟")) delMut.mutate(a.id); }}>
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

function AchievementDialog({ initial, onClose }: { initial: AchievementAdmin | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    key: initial?.key ?? "",
    title_fa: initial?.title_fa ?? "",
    description: initial?.description ?? "",
    icon: initial?.icon ?? "trophy",
    rule_type: (initial?.rule_type ?? "manual") as AchievementAdmin["rule_type"],
    rule_value: initial?.rule_value ?? null,
    xp_reward: initial?.xp_reward ?? 100,
    enabled: initial?.enabled ?? true,
    display_order: initial?.display_order ?? 0,
  });
  const mut = useMutation({
    mutationFn: async () => {
      const parsed = schema.parse(form);
      await upsertAchievement(parsed);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-achievements"] }); toast.success("ذخیره شد"); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>{initial ? "ویرایش نشان" : "افزودن نشان"}</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div><Label>کلید</Label><Input value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} disabled={!!initial} /></div>
          <div><Label>عنوان</Label><Input value={form.title_fa} onChange={(e) => setForm({ ...form, title_fa: e.target.value })} /></div>
        </div>
        <div><Label>توضیحات</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        <div className="grid grid-cols-3 gap-3">
          <div><Label>آیکن</Label><Input value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} /></div>
          <div>
            <Label>نوع قانون</Label>
            <Select value={form.rule_type} onValueChange={(v) => setForm({ ...form, rule_type: v as AchievementAdmin["rule_type"] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">دستی</SelectItem>
                <SelectItem value="level">سطح</SelectItem>
                <SelectItem value="streak">زنجیره</SelectItem>
                <SelectItem value="score">امتیاز</SelectItem>
                <SelectItem value="missions_completed">مأموریت‌ها</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>مقدار قانون</Label><Input type="number" value={form.rule_value ?? ""} onChange={(e) => setForm({ ...form, rule_value: e.target.value === "" ? null : +e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>پاداش XP</Label><Input type="number" value={form.xp_reward} onChange={(e) => setForm({ ...form, xp_reward: +e.target.value })} /></div>
          <div><Label>ترتیب نمایش</Label><Input type="number" value={form.display_order} onChange={(e) => setForm({ ...form, display_order: +e.target.value })} /></div>
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