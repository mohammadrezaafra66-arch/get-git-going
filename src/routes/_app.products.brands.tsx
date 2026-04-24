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
import { brandSchema, type BrandFormValues } from "@/lib/products/schemas";

export const Route = createFileRoute("/_app/products/brands")({
  beforeLoad: async () => { await requirePermission("products", "view"); },
  component: BrandsPage,
});

interface Brand { id: string; name: string; slug: string; description: string | null; is_active: boolean; }

function BrandsPage() {
  const { roles } = useAuth();
  const canWrite = hasPermission(roles, "products", "update");
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Brand | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["brands"],
    queryFn: async (): Promise<Brand[]> => {
      const { data, error } = await supabase.from("brands")
        .select("id, name, slug, description, is_active")
        .order("name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const onSaved = () => {
    qc.invalidateQueries({ queryKey: ["brands"] });
    qc.invalidateQueries({ queryKey: ["brands-lite"] });
  };

  const remove = async (b: Brand) => {
    if (!confirm(`حذف برند "${b.name}"؟`)) return;
    const { error } = await supabase.from("brands").delete().eq("id", b.id);
    if (error) toast.error(error.message);
    else { toast.success("برند حذف شد"); onSaved(); }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="برندها"
        description="مدیریت برندهای محصولات"
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link to="/products"><ArrowRight className="ms-1 h-4 w-4" />بازگشت</Link>
            </Button>
            {canWrite && (
              <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}>
                <Plus className="ms-1 h-4 w-4" />برند جدید
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
            <div className="p-6 text-center text-sm text-muted-foreground">برندی ثبت نشده.</div>
          ) : (
            <ul className="divide-y divide-border">
              {(data ?? []).map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-2 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{b.name}</span>
                      {!b.is_active && <Badge variant="outline">غیرفعال</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground" dir="ltr">{b.slug}</div>
                    {b.description && <div className="mt-1 text-xs text-muted-foreground">{b.description}</div>}
                  </div>
                  {canWrite && (
                    <div className="flex shrink-0 gap-1">
                      <Button variant="ghost" size="icon" onClick={() => { setEditing(b); setOpen(true); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => remove(b)}>
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

      <BrandDialog open={open} onOpenChange={setOpen} editing={editing} onSaved={onSaved} />
    </div>
  );
}

function BrandDialog({ open, onOpenChange, editing, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; editing: Brand | null; onSaved: () => void;
}) {
  const [values, setValues] = useState<BrandFormValues>({ name: "", slug: "", description: "", is_active: true });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  // Reset on open
  useState(() => {});
  const reset = () => {
    setValues(editing
      ? { name: editing.name, slug: editing.slug, description: editing.description ?? "", is_active: editing.is_active }
      : { name: "", slug: "", description: "", is_active: true });
    setErrors({});
  };

  const handleOpenChange = (v: boolean) => {
    if (v) reset();
    onOpenChange(v);
  };

  const submit = async () => {
    const parsed = brandSchema.safeParse(values);
    if (!parsed.success) {
      const flat: Record<string, string> = {};
      for (const i of parsed.error.issues) flat[i.path.join(".")] = i.message;
      setErrors(flat); return;
    }
    setErrors({}); setLoading(true);
    try {
      if (editing) {
        const { error } = await supabase.from("brands").update(parsed.data).eq("id", editing.id);
        if (error) throw error;
        toast.success("برند به‌روزرسانی شد");
      } else {
        const { error } = await supabase.from("brands").insert(parsed.data);
        if (error) throw error;
        toast.success("برند ایجاد شد");
      }
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "خطا");
    } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? "ویرایش برند" : "برند جدید"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>نام *</Label>
            <Input value={values.name} onChange={(e) => setValues((s) => ({ ...s, name: e.target.value }))} />
            {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name}</p>}
          </div>
          <div>
            <Label>اسلاگ * <span className="text-xs text-muted-foreground">(انگلیسی، بدون فاصله)</span></Label>
            <Input dir="ltr" value={values.slug} onChange={(e) => setValues((s) => ({ ...s, slug: e.target.value }))} placeholder="e.g. siemens" />
            {errors.slug && <p className="mt-1 text-xs text-destructive">{errors.slug}</p>}
          </div>
          <div>
            <Label>توضیحات</Label>
            <Textarea value={values.description ?? ""} onChange={(e) => setValues((s) => ({ ...s, description: e.target.value }))} rows={3} />
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