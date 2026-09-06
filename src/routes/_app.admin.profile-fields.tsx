import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { requireAdmin } from "@/lib/rbac/route-guards";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Pencil } from "lucide-react";
import type {
  ProfileFieldDefinition,
  ProfileFieldType,
  ProfileFieldOption,
} from "@/lib/profile-fields/types";

export const Route = createFileRoute("/_app/admin/profile-fields")({
  // Wave 2 / B-1 — the client half of the guard below. `beforeLoad` runs only on the server
  // for a direct navigation and cannot see a localStorage session, so RouteRoleGate reads this.
  // Mirrors requireAdmin() below.
  staticData: { gate: { kind: "admin" } },
  beforeLoad: async () => {
    await requireAdmin();
  },
  component: ProfileFieldsAdminPage,
});

export const TYPE_LABELS: Record<ProfileFieldType, string> = {
  text: "متن",
  number: "عدد",
  textarea: "متن چندخطی",
  select: "انتخاب از لیست",
  multiselect: "چندانتخابی",
  time: "ساعت",
  days: "روزهای هفته",
  date: "تاریخ",
};

const TYPES_WITH_OPTIONS: ProfileFieldType[] = ["select", "multiselect"];

function ProfileFieldsAdminPage() {
  const qc = useQueryClient();
  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<ProfileFieldDefinition | null>(null);

  const { data: fields = [], isLoading } = useQuery({
    queryKey: ["profile-fields-admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profile_field_definitions")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return ((data ?? []) as unknown as ProfileFieldDefinition[]).map((r) => ({
        ...r,
        options: Array.isArray(r.options) ? (r.options as ProfileFieldOption[]) : [],
      }));
    },
  });

  const toggleActive = useMutation({
    mutationFn: async (v: { id: string; next: boolean }) => {
      const { error } = await supabase
        .from("profile_field_definitions")
        .update({ is_active: v.next })
        .eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile-fields-admin"] });
      qc.invalidateQueries({ queryKey: ["profile-fields-register"] });
      qc.invalidateQueries({ queryKey: ["profile-fields-all"] });
    },
    onError: (e: Error) => toast.error("خطا", { description: e.message }),
  });

  const toggleRegister = useMutation({
    mutationFn: async (v: { id: string; next: boolean }) => {
      const { error } = await supabase
        .from("profile_field_definitions")
        .update({ show_on_register: v.next })
        .eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile-fields-admin"] });
      qc.invalidateQueries({ queryKey: ["profile-fields-register"] });
    },
    onError: (e: Error) => toast.error("خطا", { description: e.message }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("profile_field_definitions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("فیلد حذف شد");
      qc.invalidateQueries({ queryKey: ["profile-fields-admin"] });
    },
    onError: (e: Error) => toast.error("حذف ناموفق", { description: e.message }),
  });

  return (
    <div dir="rtl" className="space-y-6">
      <PageHeader
        title="فیلدهای پویای کاربر"
        description="فیلدهای ثبت‌نام و پروفایل کاربر را اضافه، ویرایش، فعال یا غیرفعال کنید."
      />
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">فهرست فیلدها</CardTitle>
          <Dialog
            open={openForm}
            onOpenChange={(o) => {
              setOpenForm(o);
              if (!o) setEditing(null);
            }}
          >
            <DialogTrigger asChild>
              <Button size="sm" onClick={() => setEditing(null)}>
                <Plus className="ml-1 h-4 w-4" />
                افزودن فیلد
              </Button>
            </DialogTrigger>
            <FieldFormDialog
              editing={editing}
              onClose={() => {
                setOpenForm(false);
                setEditing(null);
              }}
            />
          </Dialog>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : fields.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">فیلدی تعریف نشده.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50 text-right text-xs text-muted-foreground">
                  <tr>
                    <th className="p-3 font-medium">برچسب</th>
                    <th className="p-3 font-medium">نام</th>
                    <th className="p-3 font-medium">نوع</th>
                    <th className="p-3 text-center font-medium">الزامی</th>
                    <th className="p-3 text-center font-medium">در ثبت‌نام</th>
                    <th className="p-3 text-center font-medium">فعال</th>
                    <th className="p-3 font-medium">عملیات</th>
                  </tr>
                </thead>
                <tbody>
                  {fields.map((f) => (
                    <tr key={f.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="p-3 font-medium">{f.label}</td>
                      <td className="p-3 font-mono text-xs" dir="ltr">
                        {f.name}
                      </td>
                      <td className="p-3">
                        <Badge variant="outline">{TYPE_LABELS[f.field_type]}</Badge>
                      </td>
                      <td className="p-3 text-center">{f.is_required ? "بله" : "—"}</td>
                      <td className="p-3 text-center">
                        <Switch
                          checked={f.show_on_register}
                          onCheckedChange={(v) => toggleRegister.mutate({ id: f.id, next: v })}
                        />
                      </td>
                      <td className="p-3 text-center">
                        <Switch
                          checked={f.is_active}
                          onCheckedChange={(v) => toggleActive.mutate({ id: f.id, next: v })}
                        />
                      </td>
                      <td className="p-3">
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditing(f);
                              setOpenForm(true);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              if (confirm(`فیلد «${f.label}» و همه مقادیرش حذف شود؟`)) {
                                remove.mutate(f.id);
                              }
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
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
    </div>
  );
}

function FieldFormDialog({
  editing,
  onClose,
}: {
  editing: ProfileFieldDefinition | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: editing?.name ?? "",
    label: editing?.label ?? "",
    field_type: editing?.field_type ?? ("text" as ProfileFieldType),
    is_required: editing?.is_required ?? false,
    show_on_register: editing?.show_on_register ?? true,
    sort_order: editing?.sort_order ?? 100,
    help_text: editing?.help_text ?? "",
    options: editing?.options ?? [],
  });
  const [optionsText, setOptionsText] = useState(
    (editing?.options ?? []).map((o) => `${o.value}|${o.label}`).join("\n"),
  );

  const save = useMutation({
    mutationFn: async () => {
      if (!/^[a-z_][a-z0-9_]*$/.test(form.name)) {
        throw new Error("نام فقط حروف انگلیسی کوچک، عدد و زیرخط (شروع با حرف یا زیرخط)");
      }
      if (form.label.trim().length < 2) throw new Error("برچسب الزامی است");

      let parsedOptions: ProfileFieldOption[] = [];
      if (TYPES_WITH_OPTIONS.includes(form.field_type)) {
        parsedOptions = optionsText
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean)
          .map((line) => {
            const [value, ...rest] = line.split("|");
            return { value: value.trim(), label: rest.join("|").trim() || value.trim() };
          });
        if (parsedOptions.length === 0)
          throw new Error("برای نوع انتخابی، حداقل یک گزینه لازم است");
      }

      const payload = {
        name: form.name,
        label: form.label.trim(),
        field_type: form.field_type,
        is_required: form.is_required,
        show_on_register: form.show_on_register,
        sort_order: form.sort_order,
        help_text: form.help_text.trim() || null,
        options: parsedOptions,
      };

      if (editing) {
        const { error } = await supabase
          .from("profile_field_definitions")
          .update(payload as never)
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("profile_field_definitions").insert(payload as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "فیلد ویرایش شد" : "فیلد جدید اضافه شد");
      qc.invalidateQueries({ queryKey: ["profile-fields-admin"] });
      qc.invalidateQueries({ queryKey: ["profile-fields-register"] });
      qc.invalidateQueries({ queryKey: ["profile-fields-all"] });
      onClose();
    },
    onError: (e: Error) => toast.error("خطا", { description: e.message }),
  });

  const showOptions = TYPES_WITH_OPTIONS.includes(form.field_type);

  return (
    <DialogContent dir="rtl" className="max-w-lg">
      <DialogHeader>
        <DialogTitle>{editing ? "ویرایش فیلد" : "افزودن فیلد جدید"}</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>نام (انگلیسی){!editing && <span className="text-destructive"> *</span>}</Label>
            <Input
              dir="ltr"
              value={form.name}
              disabled={!!editing}
              onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
              placeholder="emergency_contact"
            />
          </div>
          <div>
            <Label>
              برچسب فارسی <span className="text-destructive">*</span>
            </Label>
            <Input
              value={form.label}
              onChange={(e) => setForm((s) => ({ ...s, label: e.target.value }))}
              placeholder="تماس اضطراری"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>نوع فیلد</Label>
            <Select
              value={form.field_type}
              onValueChange={(v) => setForm((s) => ({ ...s, field_type: v as ProfileFieldType }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TYPE_LABELS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>ترتیب نمایش</Label>
            <Input
              type="number"
              dir="ltr"
              value={form.sort_order}
              onChange={(e) => setForm((s) => ({ ...s, sort_order: Number(e.target.value) || 0 }))}
            />
          </div>
        </div>
        {showOptions && (
          <div>
            <Label>
              گزینه‌ها (هر خط: <code dir="ltr">value|label</code>)
            </Label>
            <Textarea
              dir="ltr"
              rows={5}
              value={optionsText}
              onChange={(e) => setOptionsText(e.target.value)}
              placeholder={"full_time|تمام وقت\npart_time|پاره‌وقت"}
            />
          </div>
        )}
        <div>
          <Label>توضیح راهنما</Label>
          <Input
            value={form.help_text}
            onChange={(e) => setForm((s) => ({ ...s, help_text: e.target.value }))}
          />
        </div>
        <div className="flex gap-6">
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={form.is_required}
              onCheckedChange={(v) => setForm((s) => ({ ...s, is_required: v }))}
            />
            الزامی
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={form.show_on_register}
              onCheckedChange={(v) => setForm((s) => ({ ...s, show_on_register: v }))}
            />
            نمایش در فرم ثبت‌نام
          </label>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          انصراف
        </Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending && <Loader2 className="ml-1 h-4 w-4 animate-spin" />}
          {editing ? "ذخیره" : "افزودن"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
