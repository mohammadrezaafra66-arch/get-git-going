import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { requireAnyRole } from "@/lib/rbac/route-guards";
import {
  listKpiRules, createKpiRule, updateKpiRule, toggleKpiRule,
  type KpiRule,
} from "@/lib/operations/gamification";

export const Route = createFileRoute("/_app/gamification/admin/kpi-rules")({
  beforeLoad: async () => { await requireAnyRole(["admin", "manager"]); },
  component: KpiRulesPage,
});

const schema = z.object({
  title_fa: z.string().trim().min(1, "عنوان فارسی الزامی است").max(120),
  title_en: z.string().trim().max(120).optional().or(z.literal("")),
  description: z.string().max(500).optional().or(z.literal("")),
  event_key: z.string().trim().min(1, "کلید رویداد الزامی است").max(80)
    .regex(/^[a-z0-9_]+$/i, "فقط حروف انگلیسی، عدد و _ مجاز است"),
  xp_amount: z.coerce.number().min(0, "XP باید بزرگ‌تر یا مساوی صفر باشد"),
  is_active: z.boolean(),
  sort_order: z.coerce.number().int().min(0),
});

function fmtDate(d: string) {
  try { return new Date(d).toLocaleString("fa-IR"); } catch { return d; }
}

function KpiRulesPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["admin-kpi-rules"], queryFn: listKpiRules });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<KpiRule | null>(null);

  const toggleMut = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) => toggleKpiRule(id, is_active),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-kpi-rules"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4 pb-10" dir="rtl">
      <PageHeader
        title="مدیریت قوانین امتیازدهی (KPI Engine)"
        description="تعریف رویدادها و میزان XP که هر اقدام به کارمند می‌دهد"
      />
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">قوانین KPI</CardTitle>
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={() => setEditing(null)}>
                <Plus className="ml-1 h-4 w-4" />افزودن قانون
              </Button>
            </DialogTrigger>
            <KpiRuleDialog initial={editing} onClose={() => { setOpen(false); setEditing(null); }} />
          </Dialog>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {isLoading ? (
            <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : (data ?? []).length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">هیچ قانونی تعریف نشده است.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>عنوان</TableHead>
                  <TableHead>کلید رویداد</TableHead>
                  <TableHead>XP</TableHead>
                  <TableHead>وضعیت</TableHead>
                  <TableHead>آخرین به‌روزرسانی</TableHead>
                  <TableHead className="text-left">عملیات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data ?? []).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">
                      <div>{r.title_fa}</div>
                      {r.title_en && <div className="text-xs text-muted-foreground">{r.title_en}</div>}
                    </TableCell>
                    <TableCell><code className="text-xs">{r.event_key}</code></TableCell>
                    <TableCell className="tabular-nums">{r.xp_amount}</TableCell>
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
                    <TableCell className="text-xs text-muted-foreground">{fmtDate(r.updated_at)}</TableCell>
                    <TableCell className="space-x-1 space-x-reverse text-left">
                      <Button size="sm" variant="ghost" onClick={() => { setEditing(r); setOpen(true); }}>
                        <Pencil className="h-4 w-4" />
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

function KpiRuleDialog({ initial, onClose }: { initial: KpiRule | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    title_fa: initial?.title_fa ?? "",
    title_en: initial?.title_en ?? "",
    description: initial?.description ?? "",
    event_key: initial?.event_key ?? "",
    xp_amount: initial?.xp_amount ?? 0,
    is_active: initial?.is_active ?? true,
    sort_order: initial?.sort_order ?? 0,
  });

  const mut = useMutation({
    mutationFn: async () => {
      const parsed = schema.parse({
        ...form,
        title_en: form.title_en || undefined,
        description: form.description || undefined,
      });
      const payload = {
        title_fa: parsed.title_fa,
        title_en: parsed.title_en || null,
        description: parsed.description || null,
        event_key: parsed.event_key,
        xp_amount: parsed.xp_amount,
        is_active: parsed.is_active,
        sort_order: parsed.sort_order,
      };
      if (initial) {
        await updateKpiRule(initial.id, payload);
      } else {
        await createKpiRule(payload);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-kpi-rules"] });
      toast.success(initial ? "ویرایش شد" : "قانون اضافه شد");
      onClose();
    },
    onError: (e: unknown) => {
      if (e instanceof z.ZodError) {
        toast.error(e.issues[0]?.message ?? "ورودی نامعتبر");
      } else {
        const msg = e instanceof Error ? e.message : "خطا در ذخیره";
        if (msg.includes("duplicate") || msg.includes("unique")) {
          toast.error("کلید رویداد تکراری است");
        } else {
          toast.error(msg);
        }
      }
    },
  });

  return (
    <DialogContent dir="rtl">
      <DialogHeader>
        <DialogTitle>{initial ? "ویرایش قانون KPI" : "افزودن قانون KPI"}</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>عنوان فارسی *</Label>
            <Input value={form.title_fa} onChange={(e) => setForm({ ...form, title_fa: e.target.value })} />
          </div>
          <div>
            <Label>عنوان انگلیسی</Label>
            <Input value={form.title_en} onChange={(e) => setForm({ ...form, title_en: e.target.value })} />
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
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <Label>کلید رویداد (event_key) *</Label>
            <Input
              value={form.event_key}
              onChange={(e) => setForm({ ...form, event_key: e.target.value })}
              disabled={!!initial}
              placeholder="مثلا: outbound_call"
              dir="ltr"
            />
            {!initial && (
              <p className="text-xs text-muted-foreground mt-1">
                نمونه: outbound_call, inbound_call, new_customer_created, sale_closed
              </p>
            )}
          </div>
          <div>
            <Label>مقدار XP *</Label>
            <Input
              type="number" min={0} step="1"
              value={form.xp_amount}
              onChange={(e) => setForm({ ...form, xp_amount: Number(e.target.value) })}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>ترتیب نمایش</Label>
            <Input
              type="number" min={0}
              value={form.sort_order}
              onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })}
            />
          </div>
          <div className="flex items-end gap-2 pb-2">
            <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
            <Label>فعال</Label>
          </div>
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