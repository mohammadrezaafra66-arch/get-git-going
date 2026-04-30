import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { useDebounce } from "@/hooks/use-debounce";

type Channel = {
  id: string;
  name: string;
  weight: number;
  is_active: boolean;
  sort_order: number;
};

function MarketingChannelsPage() {
  const { roles, user } = useAuth();
  const allowed = roles.includes("admin") || roles.includes("accountant");

  const [items, setItems] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const debounced = useDebounce(search, 300);

  const [editing, setEditing] = useState<Channel | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{ name: string; weight: number; sort_order: number; is_active: boolean }>({
    name: "", weight: 50, sort_order: 0, is_active: true,
  });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    let q = supabase
      .from("marketing_channels")
      .select("id,name,weight,is_active,sort_order")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true })
      .limit(500);
    if (debounced.trim()) q = q.ilike("name", `%${debounced.trim()}%`);
    const { data, error } = await q;
    setLoading(false);
    if (error) { toast.error("خطا در بارگذاری"); return; }
    setItems((data ?? []) as Channel[]);
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [debounced]);

  if (!allowed) {
    return <div className="p-6 text-sm text-muted-foreground" dir="rtl">دسترسی غیرمجاز</div>;
  }

  const openNew = () => {
    setEditing(null);
    setForm({ name: "", weight: 50, sort_order: (items[items.length - 1]?.sort_order ?? 0) + 10, is_active: true });
    setOpen(true);
  };

  const openEdit = (c: Channel) => {
    setEditing(c);
    setForm({ name: c.name, weight: c.weight, sort_order: c.sort_order, is_active: c.is_active });
    setOpen(true);
  };

  const audit = async (action: string, entity_id: string, diff: Record<string, unknown>) => {
    if (!user?.id) return;
    await supabase.from("audit_logs").insert({
      actor_id: user.id,
      entity_type: "marketing_channel",
      entity_id,
      action,
      diff,
    });
  };

  const save = async () => {
    const name = form.name.trim();
    if (name.length < 2 || name.length > 100) { toast.error("نام باید بین ۲ تا ۱۰۰ کاراکتر باشد"); return; }
    const weight = Math.max(0, Math.min(100, Number(form.weight) || 0));
    const sort_order = Number.isFinite(form.sort_order) ? form.sort_order : 0;
    setSaving(true);
    try {
      if (editing) {
        const { error } = await supabase
          .from("marketing_channels")
          .update({ name, weight, sort_order, is_active: form.is_active })
          .eq("id", editing.id);
        if (error) throw error;
        await audit("marketing_channel_updated", editing.id, {
          before: { name: editing.name, weight: editing.weight, sort_order: editing.sort_order, is_active: editing.is_active },
          after: { name, weight, sort_order, is_active: form.is_active },
        });
        toast.success("به‌روزرسانی شد");
      } else {
        const { data, error } = await supabase
          .from("marketing_channels")
          .insert({ name, weight, sort_order, is_active: form.is_active })
          .select("id")
          .single();
        if (error) throw error;
        await audit("marketing_channel_created", data!.id, { name, weight, sort_order, is_active: form.is_active });
        toast.success("کانال افزوده شد");
      }
      setOpen(false);
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (c: Channel) => {
    const next = !c.is_active;
    const { error } = await supabase
      .from("marketing_channels")
      .update({ is_active: next })
      .eq("id", c.id);
    if (error) { toast.error("خطا در تغییر وضعیت"); return; }
    await audit("marketing_channel_status_changed", c.id, { from: c.is_active, to: next });
    toast.success(next ? "فعال شد" : "غیرفعال شد");
    void load();
  };

  return (
    <div className="space-y-6" dir="rtl">
      <PageHeader
        title="کانال‌های تبلیغاتی"
        description="تعریف کانال‌های تبلیغاتی و وزن‌دهی به آن‌ها برای موتور پیشنهاد تبلیغات"
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openNew}><Plus className="ml-2 h-4 w-4" /> افزودن کانال</Button>
            </DialogTrigger>
            <DialogContent dir="rtl">
              <DialogHeader>
                <DialogTitle>{editing ? "ویرایش کانال" : "افزودن کانال جدید"}</DialogTitle>
                <DialogDescription>نام، وزن (۰ تا ۱۰۰) و ترتیب نمایش را تعیین کنید.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label>نام</Label>
                  <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} maxLength={100} />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label>وزن (۰ تا ۱۰۰)</Label>
                    <span className="text-xs tabular-nums text-muted-foreground">{form.weight}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="range" min={0} max={100} step={1}
                      value={form.weight}
                      onChange={(e) => setForm((f) => ({ ...f, weight: Number(e.target.value) }))}
                      className="flex-1 accent-primary"
                    />
                    <Input
                      type="number" min={0} max={100} dir="ltr"
                      value={form.weight}
                      onChange={(e) => setForm((f) => ({ ...f, weight: Math.max(0, Math.min(100, Number(e.target.value) || 0)) }))}
                      className="w-20"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>ترتیب</Label>
                  <Input
                    type="number"
                    value={form.sort_order}
                    onChange={(e) => setForm((f) => ({ ...f, sort_order: Number(e.target.value) || 0 }))}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={form.is_active} onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))} />
                  <Label>فعال</Label>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>انصراف</Button>
                <Button onClick={save} disabled={saving}>
                  {saving && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                  ذخیره
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <Input
        placeholder="جستجوی نام کانال..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">نام</TableHead>
              <TableHead className="text-right">وزن</TableHead>
              <TableHead className="text-right">ترتیب</TableHead>
              <TableHead className="text-right">وضعیت</TableHead>
              <TableHead className="text-right">عملیات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">در حال بارگذاری...</TableCell></TableRow>
            ) : items.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">کانالی یافت نشد</TableCell></TableRow>
            ) : items.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-32 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${Math.max(0, Math.min(100, c.weight))}%` }}
                      />
                    </div>
                    <span className="text-xs tabular-nums text-muted-foreground">{c.weight}</span>
                  </div>
                </TableCell>
                <TableCell className="tabular-nums">{c.sort_order}</TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={
                      c.is_active
                        ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                        : "border-destructive/50 bg-destructive/10 text-destructive"
                    }
                  >
                    {c.is_active ? "فعال" : "غیرفعال"}
                  </Badge>
                </TableCell>
                <TableCell className="space-x-2 space-x-reverse">
                  <Button variant="outline" size="sm" onClick={() => openEdit(c)}>
                    <Pencil className="ml-1 h-3.5 w-3.5" /> ویرایش
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => void toggleActive(c)}>
                    {c.is_active ? "غیرفعال‌سازی" : "فعال‌سازی"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_app/admin/marketing-channels")({
  component: MarketingChannelsPage,
});