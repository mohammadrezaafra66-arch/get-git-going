import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Plus, Pencil } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/admin/receipt-fields")({
  component: ReceiptCustomFieldsAdminPage,
});

const TYPE_LABEL: Record<string, string> = {
  text: "متن",
  number: "عدد",
  date: "تاریخ",
  select: "انتخابی",
};

const fieldSchema = z.object({
  field_key: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]{0,29}$/, "کلید نامعتبر (فقط حروف کوچک انگلیسی، عدد و _ ، حداکثر ۳۰)"),
  field_label: z.string().trim().min(1, "الزامی").max(100),
  field_type: z.enum(["text", "number", "date", "select"]),
  is_required: z.boolean(),
  is_active: z.boolean(),
  sort_order: z.number().int().min(0).max(9999),
  options_text: z.string().optional(),
});

type FieldRow = {
  id: string;
  field_key: string;
  field_label: string;
  field_type: "text" | "number" | "date" | "select";
  field_options: unknown;
  is_required: boolean;
  is_active: boolean;
  sort_order: number;
};

function ReceiptCustomFieldsAdminPage() {
  const { user, roles } = useAuth();
  const allowed = roles.includes("admin") || roles.includes("accountant");
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<FieldRow | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    field_key: "",
    field_label: "",
    field_type: "text" as "text" | "number" | "date" | "select",
    is_required: false,
    is_active: true,
    sort_order: 0,
    options_text: "",
  });

  const { data: rows, isLoading } = useQuery({
    enabled: allowed,
    queryKey: ["receipt-custom-fields", "all"],
    staleTime: 30_000,
    queryFn: async (): Promise<FieldRow[]> => {
      const { data, error } = await supabase
        .from("payment_receipt_custom_fields")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("field_label", { ascending: true });
      if (error) throw error;
      return (data ?? []) as FieldRow[];
    },
  });

  if (!allowed) return <Navigate to="/unauthorized" />;

  const openNew = () => {
    setEditing(null);
    setForm({
      field_key: "",
      field_label: "",
      field_type: "text",
      is_required: false,
      is_active: true,
      sort_order: 0,
      options_text: "",
    });
    setOpen(true);
  };

  const openEdit = (row: FieldRow) => {
    setEditing(row);
    const opts = Array.isArray(row.field_options) ? row.field_options : [];
    const optsText = (opts as unknown[])
      .map((o) => (typeof o === "string" ? o : (o as { value: string }).value))
      .join("\n");
    setForm({
      field_key: row.field_key,
      field_label: row.field_label,
      field_type: row.field_type,
      is_required: row.is_required,
      is_active: row.is_active,
      sort_order: row.sort_order,
      options_text: optsText,
    });
    setOpen(true);
  };

  const save = async () => {
    const r = fieldSchema.safeParse(form);
    if (!r.success) {
      toast.error(r.error.issues[0]?.message ?? "ورودی نامعتبر");
      return;
    }
    let options: { value: string; label: string }[] | null = null;
    if (form.field_type === "select") {
      options = form.options_text
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => ({ value: s, label: s }));
      if (options.length === 0) {
        toast.error("برای فیلد انتخابی حداقل یک گزینه وارد کنید");
        return;
      }
    }
    setSubmitting(true);
    const payload = {
      field_key: r.data.field_key,
      field_label: r.data.field_label,
      field_type: r.data.field_type,
      field_options: options,
      is_required: r.data.is_required,
      is_active: r.data.is_active,
      sort_order: r.data.sort_order,
    };
    let err: { message: string } | null = null;
    let savedId: string | null = editing?.id ?? null;
    if (editing) {
      const { error } = await supabase
        .from("payment_receipt_custom_fields")
        .update(payload)
        .eq("id", editing.id);
      err = error;
    } else {
      const { data, error } = await supabase
        .from("payment_receipt_custom_fields")
        .insert(payload)
        .select("id")
        .maybeSingle();
      err = error;
      savedId = data?.id ?? null;
    }
    setSubmitting(false);
    if (err) {
      toast.error(err.message);
      return;
    }
    if (user?.id && savedId) {
      await supabase.from("audit_logs").insert({
        actor_id: user.id,
        entity_type: "payment_receipt_custom_field",
        entity_id: savedId,
        action: editing
          ? "payment_receipt_custom_field_updated"
          : "payment_receipt_custom_field_created",
        diff: payload as never,
      });
    }
    toast.success("ذخیره شد");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["receipt-custom-fields"] });
  };

  const toggleActive = async (row: FieldRow) => {
    const next = !row.is_active;
    const { error } = await supabase
      .from("payment_receipt_custom_fields")
      .update({ is_active: next })
      .eq("id", row.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (user?.id) {
      await supabase.from("audit_logs").insert({
        actor_id: user.id,
        entity_type: "payment_receipt_custom_field",
        entity_id: row.id,
        action: "payment_receipt_custom_field_status_changed",
        diff: { is_active: next } as never,
      });
    }
    qc.invalidateQueries({ queryKey: ["receipt-custom-fields"] });
  };

  return (
    <div dir="rtl" className="space-y-4">
      <PageHeader
        title="فیلدهای سفارشی فیش واریزی"
        description="مدیریت فیلدهای دستی نمایش‌داده‌شده در فرم ثبت فیش واریزی"
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openNew}>
                <Plus className="ms-1 h-4 w-4" /> افزودن فیلد جدید
              </Button>
            </DialogTrigger>
            <DialogContent dir="rtl" className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{editing ? "ویرایش فیلد" : "فیلد جدید"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>کلید فیلد *</Label>
                    <Input
                      dir="ltr"
                      value={form.field_key}
                      onChange={(e) => setForm({ ...form, field_key: e.target.value })}
                      placeholder="plate_number"
                      maxLength={30}
                      disabled={!!editing}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>عنوان فارسی *</Label>
                    <Input
                      value={form.field_label}
                      onChange={(e) => setForm({ ...form, field_label: e.target.value })}
                      maxLength={100}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>نوع</Label>
                    <Select
                      value={form.field_type}
                      onValueChange={(v) =>
                        setForm({ ...form, field_type: v as typeof form.field_type })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">متن</SelectItem>
                        <SelectItem value="number">عدد</SelectItem>
                        <SelectItem value="date">تاریخ</SelectItem>
                        <SelectItem value="select">انتخابی</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>ترتیب</Label>
                    <Input
                      type="number"
                      min={0}
                      value={form.sort_order}
                      onChange={(e) =>
                        setForm({ ...form, sort_order: Number(e.target.value) || 0 })
                      }
                    />
                  </div>
                </div>
                {form.field_type === "select" && (
                  <div className="space-y-1">
                    <Label>گزینه‌ها (هر خط یک گزینه)</Label>
                    <Textarea
                      rows={4}
                      value={form.options_text}
                      onChange={(e) => setForm({ ...form, options_text: e.target.value })}
                      placeholder={"گزینه ۱\nگزینه ۲"}
                    />
                  </div>
                )}
                <div className="flex items-center gap-6">
                  <label className="flex items-center gap-2 text-sm">
                    <Switch
                      checked={form.is_required}
                      onCheckedChange={(c) => setForm({ ...form, is_required: c })}
                    />
                    الزامی
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Switch
                      checked={form.is_active}
                      onCheckedChange={(c) => setForm({ ...form, is_active: c })}
                    />
                    فعال
                  </label>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  انصراف
                </Button>
                <Button onClick={save} disabled={submitting}>
                  {submitting && <Loader2 className="ms-1 h-4 w-4 animate-spin" />}
                  ذخیره
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">عنوان</TableHead>
              <TableHead className="text-right">کلید</TableHead>
              <TableHead className="text-right">نوع</TableHead>
              <TableHead className="text-right">الزامی</TableHead>
              <TableHead className="text-right">ترتیب</TableHead>
              <TableHead className="text-right">وضعیت</TableHead>
              <TableHead className="text-right">عملیات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </TableCell>
              </TableRow>
            ) : (rows ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  فیلدی تعریف نشده است
                </TableCell>
              </TableRow>
            ) : (
              (rows ?? []).map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.field_label}</TableCell>
                  <TableCell dir="ltr" className="text-xs text-muted-foreground">
                    {r.field_key}
                  </TableCell>
                  <TableCell>{TYPE_LABEL[r.field_type]}</TableCell>
                  <TableCell>{r.is_required ? "بله" : "خیر"}</TableCell>
                  <TableCell>{r.sort_order}</TableCell>
                  <TableCell>
                    <Badge variant={r.is_active ? "default" : "secondary"}>
                      {r.is_active ? "فعال" : "غیرفعال"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => openEdit(r)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => toggleActive(r)}>
                        {r.is_active ? "غیرفعال‌سازی" : "فعال‌سازی"}
                      </Button>
                    </div>
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
