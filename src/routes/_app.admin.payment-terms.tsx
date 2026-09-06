import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { requireAdmin } from "@/lib/rbac/route-guards";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Loader2, Pencil, Wallet } from "lucide-react";
import { toast } from "sonner";

type PaymentTerm = {
  id: string;
  name: string;
  days: number | null;
  is_active: boolean;
  sort_order: number;
  notes: string | null;
};

function PaymentTermsPage() {
  const { roles, user } = useAuth();
  const allowed = roles.includes("admin") || roles.includes("accountant");

  const [items, setItems] = useState<PaymentTerm[]>([]);
  const [loading, setLoading] = useState(false);

  const [editing, setEditing] = useState<PaymentTerm | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{
    name: string;
    days: string;
    sort_order: number;
    is_active: boolean;
    notes: string;
  }>({
    name: "",
    days: "",
    sort_order: 0,
    is_active: true,
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("payment_terms")
      .select("id,name,days,is_active,sort_order,notes")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true })
      .limit(500);
    setLoading(false);
    if (error) {
      toast.error("خطا در بارگذاری");
      return;
    }
    setItems((data ?? []) as PaymentTerm[]);
  };

  useEffect(() => {
    void load();
  }, []);

  if (!allowed) {
    return (
      <div className="p-6 text-sm text-muted-foreground" dir="rtl">
        دسترسی غیرمجاز
      </div>
    );
  }

  const openNew = () => {
    setEditing(null);
    setForm({
      name: "",
      days: "",
      sort_order: (items[items.length - 1]?.sort_order ?? 0) + 10,
      is_active: true,
      notes: "",
    });
    setOpen(true);
  };

  const openEdit = (t: PaymentTerm) => {
    setEditing(t);
    setForm({
      name: t.name,
      days: t.days != null ? String(t.days) : "",
      sort_order: t.sort_order,
      is_active: t.is_active,
      notes: t.notes ?? "",
    });
    setOpen(true);
  };

  const audit = async (action: string, entity_id: string, diff: Record<string, unknown>) => {
    if (!user?.id) return;
    await supabase.from("audit_logs").insert({
      actor_id: user.id,
      entity_type: "payment_term",
      entity_id,
      action,
      diff: diff as never,
    });
  };

  const save = async () => {
    const name = form.name.trim();
    if (name.length < 2 || name.length > 100) {
      toast.error("نام باید بین ۲ تا ۱۰۰ کاراکتر باشد");
      return;
    }
    const days = form.days.trim() === "" ? null : Math.max(0, Number(form.days) || 0);
    const sort_order = Number.isFinite(form.sort_order) ? form.sort_order : 0;
    const notes = form.notes.trim() ? form.notes.trim() : null;
    setSaving(true);
    try {
      if (editing) {
        const { error } = await supabase
          .from("payment_terms")
          .update({ name, days, sort_order, is_active: form.is_active, notes })
          .eq("id", editing.id);
        if (error) throw error;
        await audit("payment_term_updated", editing.id, {
          before: editing,
          after: { name, days, sort_order, is_active: form.is_active, notes },
        });
        toast.success("به‌روزرسانی شد");
      } else {
        const { data, error } = await supabase
          .from("payment_terms")
          .insert({
            name,
            days,
            sort_order,
            is_active: form.is_active,
            notes,
            created_by: user?.id ?? null,
          })
          .select("id")
          .single();
        if (error) throw error;
        await audit("payment_term_created", data!.id, {
          name,
          days,
          sort_order,
          is_active: form.is_active,
          notes,
        });
        toast.success("زمان تسویه افزوده شد");
      }
      setOpen(false);
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (t: PaymentTerm) => {
    const next = !t.is_active;
    const { error } = await supabase
      .from("payment_terms")
      .update({ is_active: next })
      .eq("id", t.id);
    if (error) {
      toast.error("خطا در تغییر وضعیت");
      return;
    }
    await audit("payment_term_status_changed", t.id, { from: t.is_active, to: next });
    toast.success(next ? "فعال شد" : "غیرفعال شد");
    void load();
  };

  return (
    <div className="space-y-6" dir="rtl">
      <PageHeader
        title="زمان‌های تسویه"
        description="تعریف و مدیریت زمان‌های تسویه که در فرم ثبت خرید انتخاب می‌شوند"
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openNew}>
                <Plus className="ml-2 h-4 w-4" /> افزودن زمان تسویه
              </Button>
            </DialogTrigger>
            <DialogContent dir="rtl">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Wallet className="h-5 w-5 text-primary" />
                  {editing ? "ویرایش زمان تسویه" : "افزودن زمان تسویه"}
                </DialogTitle>
                <DialogDescription>
                  نام و تعداد روز تسویه را وارد کنید. برای «نقدی» مقدار صفر بگذارید.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label>
                    نام <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    maxLength={100}
                    placeholder="مثلاً ۳۰ روزه یا چک ۴۵ روزه"
                  />
                </div>
                <div className="space-y-1">
                  <Label>تعداد روز</Label>
                  <Input
                    type="number"
                    min={0}
                    dir="ltr"
                    value={form.days}
                    onChange={(e) => setForm((f) => ({ ...f, days: e.target.value }))}
                    placeholder="اختیاری"
                  />
                </div>
                <div className="space-y-1">
                  <Label>ترتیب نمایش</Label>
                  <Input
                    type="number"
                    dir="ltr"
                    value={form.sort_order}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, sort_order: Number(e.target.value) || 0 }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>توضیحات</Label>
                  <Textarea
                    rows={2}
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={form.is_active}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
                  />
                  <Label>فعال</Label>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  انصراف
                </Button>
                <Button onClick={save} disabled={saving}>
                  {saving && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                  ذخیره
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">نام</TableHead>
              <TableHead className="text-right">تعداد روز</TableHead>
              <TableHead className="text-right">ترتیب</TableHead>
              <TableHead className="text-right">وضعیت</TableHead>
              <TableHead className="text-right">عملیات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                  در حال بارگذاری...
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                  موردی یافت نشد
                </TableCell>
              </TableRow>
            ) : (
              items.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">
                    {t.name}
                    {t.notes && (
                      <div className="text-xs text-muted-foreground mt-0.5">{t.notes}</div>
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums">{t.days != null ? t.days : "—"}</TableCell>
                  <TableCell className="tabular-nums">{t.sort_order}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        t.is_active
                          ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                          : "border-destructive/50 bg-destructive/10 text-destructive"
                      }
                    >
                      {t.is_active ? "فعال" : "غیرفعال"}
                    </Badge>
                  </TableCell>
                  <TableCell className="space-x-2 space-x-reverse">
                    <Button variant="outline" size="sm" onClick={() => openEdit(t)}>
                      <Pencil className="ml-1 h-3.5 w-3.5" /> ویرایش
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => void toggleActive(t)}>
                      {t.is_active ? "غیرفعال‌سازی" : "فعال‌سازی"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_app/admin/payment-terms")({
  // Wave 2 / B-1 — the client half of the guard below. `beforeLoad` runs only on the server
  // for a direct navigation and cannot see a localStorage session, so RouteRoleGate reads this.
  // Mirrors requireAdmin() below.
  staticData: { gate: { kind: "admin" } },
  // This route had no beforeLoad guard, unlike every other /admin/* route.
  // Writes were still blocked by the payment_terms RLS policy, so this was not
  // a write leak — but the page itself was reachable by any signed-in user.
  // requireAdmin() matches both the dominant /admin/* pattern and this route's
  // own `adminOnly: true` declaration in src/lib/navigation/registry.ts.
  beforeLoad: async () => {
    await requireAdmin();
  },
  component: PaymentTermsPage,
});
