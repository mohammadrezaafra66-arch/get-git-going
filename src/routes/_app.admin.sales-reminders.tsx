import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Power, Loader2 } from "lucide-react";
import { requireAnyRole } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { formatNumber } from "@/lib/i18n/formatters";

export const Route = createFileRoute("/_app/admin/sales-reminders")({
  beforeLoad: async () => {
    await requireAnyRole(["admin", "manager"]);
  },
  component: SalesRemindersAdminPage,
});

interface Reminder {
  id: string;
  text: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

interface FormState {
  text: string;
  sort_order: number;
  is_active: boolean;
}

const emptyForm: FormState = { text: "", sort_order: 0, is_active: true };

function SalesRemindersAdminPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Reminder | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-sales-reminders"],
    queryFn: async (): Promise<Reminder[]> => {
      const { data, error } = await supabase
        .from("sales_reminders")
        .select("id, text, sort_order, is_active, created_at")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Reminder[];
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-sales-reminders"] });
    qc.invalidateQueries({ queryKey: ["sales-reminders-active"] });
  };

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (r: Reminder) => {
    setEditing(r);
    setForm({ text: r.text, sort_order: r.sort_order, is_active: r.is_active });
    setOpen(true);
  };

  const submit = async () => {
    const text = form.text.trim();
    if (!text) {
      toast.error("متن یادآوری الزامی است");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        const { error } = await supabase
          .from("sales_reminders")
          .update({
            text,
            sort_order: form.sort_order,
            is_active: form.is_active,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editing.id);
        if (error) throw error;
        toast.success("به‌روزرسانی شد");
      } else {
        const { error } = await supabase
          .from("sales_reminders")
          .insert([{ text, sort_order: form.sort_order, is_active: form.is_active }]);
        if (error) throw error;
        toast.success("ثبت شد");
      }
      refresh();
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا در ذخیره");
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (r: Reminder) => {
    const { error } = await supabase
      .from("sales_reminders")
      .update({ is_active: !r.is_active, updated_at: new Date().toISOString() })
      .eq("id", r.id);
    if (error) toast.error(error.message);
    else {
      toast.success(r.is_active ? "غیرفعال شد" : "فعال شد");
      refresh();
    }
  };

  const remove = async (r: Reminder) => {
    if (!confirm("حذف این یادآوری؟")) return;
    const { error } = await supabase.from("sales_reminders").delete().eq("id", r.id);
    if (error) toast.error(error.message);
    else {
      toast.success("حذف شد");
      refresh();
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="یادآوری‌های جستجوی فروش"
        description="پیام‌هایی که هنگام باز شدن صفحهٔ جستجوی فروش به‌صورت چرخشی نمایش داده می‌شوند"
        actions={
          <Button size="sm" onClick={openNew}>
            <Plus className="ms-1 h-4 w-4" />
            یادآوری جدید
          </Button>
        }
      />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">در حال بارگذاری...</div>
          ) : error ? (
            <div className="p-6 text-center text-sm text-destructive">
              خطا در دریافت یادآوری‌ها.
            </div>
          ) : (data ?? []).length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              یادآوری‌ای ثبت نشده.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50 text-right text-xs text-muted-foreground">
                  <tr>
                    <th className="p-3 w-16">ترتیب</th>
                    <th className="p-3">متن</th>
                    <th className="p-3 w-20">وضعیت</th>
                    <th className="p-3 w-28">عملیات</th>
                  </tr>
                </thead>
                <tbody>
                  {(data ?? []).map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="p-3 tabular-nums">{formatNumber(r.sort_order)}</td>
                      <td className="p-3">{r.text}</td>
                      <td className="p-3">
                        {r.is_active ? (
                          <Badge>فعال</Badge>
                        ) : (
                          <Badge variant="outline">غیرفعال</Badge>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(r)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => toggle(r)}
                            title={r.is_active ? "غیرفعال‌سازی" : "فعال‌سازی"}
                          >
                            <Power className={`h-4 w-4 ${r.is_active ? "text-destructive" : ""}`} />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => remove(r)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "ویرایش یادآوری" : "یادآوری جدید"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>متن یادآوری *</Label>
              <Textarea
                dir="rtl"
                rows={3}
                value={form.text}
                onChange={(e) => setForm((f) => ({ ...f, text: e.target.value }))}
                placeholder="متن پیامی که به کارشناس فروش نمایش داده می‌شود"
              />
            </div>
            <div>
              <Label>ترتیب نمایش</Label>
              <Input
                type="number"
                inputMode="numeric"
                dir="ltr"
                value={form.sort_order}
                onChange={(e) =>
                  setForm((f) => ({ ...f, sort_order: Number(e.target.value) || 0 }))
                }
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
            <Button onClick={submit} disabled={saving}>
              {saving && <Loader2 className="ms-1 h-4 w-4 animate-spin" />}
              {editing ? "ذخیره تغییرات" : "ایجاد"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
