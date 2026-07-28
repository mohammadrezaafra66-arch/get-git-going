import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { requireAnyRole } from "@/lib/rbac/route-guards";
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
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Loader2, Pencil, UserRound } from "lucide-react";
import { toast } from "sonner";

/**
 * Item 203 — visitors. A visitor is credited with bringing a deal in and is a
 * different person from the salesperson who issues the pre-invoice, so this is
 * its own registry rather than a flag on profiles.
 *
 * Rows are never deleted, only deactivated: a pre-invoice already points at
 * its visitor and that history has to stay readable.
 */

type Visitor = {
  id: string;
  full_name: string;
  code: string | null;
  phone: string | null;
  is_active: boolean;
  sort_order: number;
  notes: string | null;
};

export const Route = createFileRoute("/_app/admin/visitors")({
  beforeLoad: async () => {
    await requireAnyRole(["admin", "manager"]);
  },
  component: VisitorsPage,
});

function VisitorsPage() {
  const { roles, user } = useAuth();
  const allowed = roles.includes("admin") || roles.includes("manager");

  const [items, setItems] = useState<Visitor[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<Visitor | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    code: "",
    phone: "",
    sort_order: 0,
    is_active: true,
    notes: "",
  });

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("visitors")
      .select("id,full_name,code,phone,is_active,sort_order,notes")
      .order("sort_order", { ascending: true })
      .order("full_name", { ascending: true })
      .limit(500);
    setLoading(false);
    if (error) {
      toast.error("خطا در بارگذاری ویزیتورها");
      return;
    }
    setItems((data ?? []) as unknown as Visitor[]);
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
      full_name: "",
      code: "",
      phone: "",
      sort_order: (items[items.length - 1]?.sort_order ?? 0) + 10,
      is_active: true,
      notes: "",
    });
    setOpen(true);
  };

  const openEdit = (v: Visitor) => {
    setEditing(v);
    setForm({
      full_name: v.full_name,
      code: v.code ?? "",
      phone: v.phone ?? "",
      sort_order: v.sort_order,
      is_active: v.is_active,
      notes: v.notes ?? "",
    });
    setOpen(true);
  };

  const audit = async (action: string, entity_id: string, diff: Record<string, unknown>) => {
    if (!user?.id) return;
    await supabase.from("audit_logs").insert({
      actor_id: user.id,
      entity_type: "visitor",
      entity_id,
      action,
      diff: diff as never,
    });
  };

  const save = async () => {
    const full_name = form.full_name.trim();
    if (full_name.length < 2 || full_name.length > 150) {
      toast.error("نام ویزیتور باید بین ۲ تا ۱۵۰ کاراکتر باشد");
      return;
    }
    const code = form.code.trim() ? form.code.trim() : null;
    const phone = form.phone.trim() ? form.phone.trim() : null;
    const notes = form.notes.trim() ? form.notes.trim() : null;
    const sort_order = Number.isFinite(form.sort_order) ? form.sort_order : 0;

    setSaving(true);
    try {
      if (editing) {
        const { error } = await supabase
          .from("visitors")
          .update({
            full_name,
            code,
            phone,
            sort_order,
            is_active: form.is_active,
            notes,
          } as never)
          .eq("id", editing.id);
        if (error) throw error;
        await audit("visitor_updated", editing.id, {
          before: editing,
          after: { full_name, code, phone, sort_order, is_active: form.is_active, notes },
        });
        toast.success("ویزیتور به‌روزرسانی شد");
      } else {
        const { data, error } = await supabase
          .from("visitors")
          .insert({
            full_name,
            code,
            phone,
            sort_order,
            is_active: form.is_active,
            notes,
            created_by: user?.id ?? null,
          } as never)
          .select("id")
          .single();
        if (error) throw error;
        await audit("visitor_created", (data as { id: string }).id, {
          full_name,
          code,
          phone,
          sort_order,
          is_active: form.is_active,
        });
        toast.success("ویزیتور افزوده شد");
      }
      setOpen(false);
      void load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "خطا در ذخیره";
      // The UNIQUE index on `code` is the usual reason a save is refused.
      toast.error(
        msg.includes("visitors_code_key") ? "این کد ویزیتور قبلاً ثبت شده است." : msg,
      );
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (v: Visitor) => {
    const next = !v.is_active;
    const { error } = await supabase
      .from("visitors")
      .update({ is_active: next } as never)
      .eq("id", v.id);
    if (error) {
      toast.error("خطا در تغییر وضعیت");
      return;
    }
    await audit("visitor_status_changed", v.id, { from: v.is_active, to: next });
    toast.success(next ? "فعال شد" : "غیرفعال شد");
    void load();
  };

  return (
    <div className="space-y-6" dir="rtl">
      <PageHeader
        title="ویزیتورها"
        description="تعریف و ویرایش ویزیتورها. هنگام صدور پیش‌فاکتور می‌توان یکی از ویزیتورهای فعال را انتخاب کرد."
        actions={
          <Button onClick={openNew}>
            <Plus className="ml-2 h-4 w-4" /> ویزیتور جدید
          </Button>
        }
      />

      <div className="rounded-md border">
        {loading ? (
          <div className="flex items-center justify-center p-10 text-sm text-muted-foreground">
            <Loader2 className="ml-2 h-4 w-4 animate-spin" /> در حال بارگذاری...
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-10 text-center text-sm text-muted-foreground">
            <UserRound className="h-8 w-8 opacity-40" />
            هنوز ویزیتوری تعریف نشده است.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">نام ویزیتور</TableHead>
                <TableHead className="text-right">کد</TableHead>
                <TableHead className="text-right">شماره تماس</TableHead>
                <TableHead className="text-right">ترتیب</TableHead>
                <TableHead className="text-right">وضعیت</TableHead>
                <TableHead className="text-right">توضیحات</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="font-medium">{v.full_name}</TableCell>
                  <TableCell dir="ltr" className="text-right font-mono text-xs">
                    {v.code ?? "—"}
                  </TableCell>
                  <TableCell dir="ltr" className="text-right font-mono text-xs">
                    {v.phone ?? "—"}
                  </TableCell>
                  <TableCell>{v.sort_order}</TableCell>
                  <TableCell>
                    <Badge variant={v.is_active ? "default" : "secondary"}>
                      {v.is_active ? "فعال" : "غیرفعال"}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[220px] truncate text-xs text-muted-foreground">
                    {v.notes ?? "—"}
                  </TableCell>
                  <TableCell className="text-left">
                    <div className="flex items-center justify-end gap-2">
                      <Switch checked={v.is_active} onCheckedChange={() => void toggleActive(v)} />
                      <Button variant="ghost" size="sm" onClick={() => openEdit(v)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>{editing ? "ویرایش ویزیتور" : "ویزیتور جدید"}</DialogTitle>
            <DialogDescription>
              ویزیتور از فروشندهٔ صادرکنندهٔ پیش‌فاکتور جداست.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="v_full_name">نام ویزیتور *</Label>
              <Input
                id="v_full_name"
                value={form.full_name}
                onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                maxLength={150}
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="v_code">کد ویزیتور</Label>
                <Input
                  id="v_code"
                  dir="ltr"
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                  maxLength={50}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="v_phone">شماره تماس</Label>
                <Input
                  id="v_phone"
                  dir="ltr"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  maxLength={30}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="v_sort">ترتیب نمایش</Label>
                <Input
                  id="v_sort"
                  type="number"
                  value={form.sort_order}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, sort_order: Number(e.target.value) || 0 }))
                  }
                />
              </div>
              <div className="flex items-end gap-2 pb-2">
                <Switch
                  id="v_active"
                  checked={form.is_active}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
                />
                <Label htmlFor="v_active">فعال</Label>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="v_notes">توضیحات</Label>
              <Textarea
                id="v_notes"
                rows={2}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                maxLength={500}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
              انصراف
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              ذخیره
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
