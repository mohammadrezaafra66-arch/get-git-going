import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, ArrowRight, Loader2, Pencil, Trash2 } from "lucide-react";
import { requirePermission } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { hasPermission } from "@/lib/rbac/roles";
import { labelSchema, type LabelFormValues } from "@/lib/products/schemas";

export const Route = createFileRoute("/_app/products/labels")({
  beforeLoad: async () => { await requirePermission("products", "view"); },
  component: LabelsPage,
});

interface Lbl { id: string; title: string; color: string; description: string | null; is_active: boolean; }

function LabelsPage() {
  const { roles } = useAuth();
  const canWrite = hasPermission(roles, "products", "update");
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Lbl | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["labels-full"],
    queryFn: async (): Promise<Lbl[]> => {
      const { data, error } = await supabase.from("product_labels")
        .select("id, title, color, description, is_active")
        .order("title", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const onSaved = () => {
    qc.invalidateQueries({ queryKey: ["labels-full"] });
    qc.invalidateQueries({ queryKey: ["labels-lite"] });
  };

  const remove = async (l: Lbl) => {
    if (!confirm(`حذف برچسب "${l.title}"؟`)) return;
    const { error } = await supabase.from("product_labels").delete().eq("id", l.id);
    if (error) toast.error(error.message);
    else { toast.success("برچسب حذف شد"); onSaved(); }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="برچسب‌های محصول"
        description="مدیریت برچسب‌ها برای دسته‌بندی نرم محصولات"
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link to="/products"><ArrowRight className="ms-1 h-4 w-4" />بازگشت</Link>
            </Button>
            {canWrite && (
              <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}>
                <Plus className="ms-1 h-4 w-4" />برچسب جدید
              </Button>
            )}
          </>
        }
      />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">در حال بارگذاری...</div>
          ) : (data ?? []).length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">برچسبی ثبت نشده.</div>
          ) : (
            <ul className="divide-y divide-border">
              {(data ?? []).map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-2 p-3">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="inline-block h-5 w-5 shrink-0 rounded-full border border-border" style={{ backgroundColor: l.color }} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{l.title}</span>
                        {!l.is_active && <Badge variant="outline">غیرفعال</Badge>}
                      </div>
                      {l.description && <div className="text-xs text-muted-foreground">{l.description}</div>}
                    </div>
                  </div>
                  {canWrite && (
                    <div className="flex shrink-0 gap-1">
                      <Button variant="ghost" size="icon" onClick={() => { setEditing(l); setOpen(true); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => remove(l)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <LabelDialog open={open} onOpenChange={setOpen} editing={editing} onSaved={onSaved} />
    </div>
  );
}

function LabelDialog({ open, onOpenChange, editing, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; editing: Lbl | null; onSaved: () => void;
}) {
  const [values, setValues] = useState<LabelFormValues>({ title: "", color: "#0ea5e9", description: "", is_active: true });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setValues(editing
      ? { title: editing.title, color: editing.color, description: editing.description ?? "", is_active: editing.is_active }
      : { title: "", color: "#0ea5e9", description: "", is_active: true });
    setErrors({});
  };

  const handleOpenChange = (v: boolean) => { if (v) reset(); onOpenChange(v); };

  const submit = async () => {
    const parsed = labelSchema.safeParse(values);
    if (!parsed.success) {
      const flat: Record<string, string> = {};
      for (const i of parsed.error.issues) flat[i.path.join(".")] = i.message;
      setErrors(flat); return;
    }
    setErrors({}); setLoading(true);
    try {
      if (editing) {
        const { error } = await supabase.from("product_labels").update(parsed.data).eq("id", editing.id);
        if (error) throw error;
        toast.success("برچسب به‌روزرسانی شد");
      } else {
        const { error } = await supabase.from("product_labels").insert(parsed.data);
        if (error) throw error;
        toast.success("برچسب ایجاد شد");
      }
      onSaved(); onOpenChange(false);
    } catch (e: any) { toast.error(e?.message ?? "خطا"); }
    finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? "ویرایش برچسب" : "برچسب جدید"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>عنوان *</Label>
            <Input value={values.title} onChange={(e) => setValues((s) => ({ ...s, title: e.target.value }))} />
            {errors.title && <p className="mt-1 text-xs text-destructive">{errors.title}</p>}
          </div>
          <div>
            <Label>رنگ *</Label>
            <div className="flex items-center gap-2">
              <Input
                type="color"
                value={values.color}
                onChange={(e) => setValues((s) => ({ ...s, color: e.target.value }))}
                className="h-10 w-16 p-1"
              />
              <Input dir="ltr" value={values.color} onChange={(e) => setValues((s) => ({ ...s, color: e.target.value }))} className="flex-1" />
            </div>
            {errors.color && <p className="mt-1 text-xs text-destructive">{errors.color}</p>}
          </div>
          <div>
            <Label>توضیحات</Label>
            <Textarea value={values.description ?? ""} onChange={(e) => setValues((s) => ({ ...s, description: e.target.value }))} rows={2} />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={values.is_active} onCheckedChange={(v) => setValues((s) => ({ ...s, is_active: v }))} />
            <Label>فعال</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>انصراف</Button>
          <Button onClick={submit} disabled={loading}>
            {loading && <Loader2 className="ms-1 h-4 w-4 animate-spin" />}ذخیره
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}