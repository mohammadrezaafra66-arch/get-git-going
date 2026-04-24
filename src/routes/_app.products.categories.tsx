import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { hasPermission } from "@/lib/rbac/roles";
import { categorySchema, type CategoryFormValues } from "@/lib/products/schemas";

export const Route = createFileRoute("/_app/products/categories")({
  beforeLoad: async () => { await requirePermission("products", "view"); },
  component: CategoriesPage,
});

interface Cat { id: string; name: string; slug: string; parent_id: string | null; description: string | null; is_active: boolean; }

function CategoriesPage() {
  const { roles } = useAuth();
  const canWrite = hasPermission(roles, "products", "update");
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Cat | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["categories-full"],
    queryFn: async (): Promise<Cat[]> => {
      const { data, error } = await supabase.from("categories")
        .select("id, name, slug, parent_id, description, is_active")
        .order("name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // ساخت ساختار درختی برای نمایش
  const tree = useMemo(() => {
    const list = data ?? [];
    const byParent = new Map<string | null, Cat[]>();
    for (const c of list) {
      const arr = byParent.get(c.parent_id) ?? [];
      arr.push(c); byParent.set(c.parent_id, arr);
    }
    return byParent;
  }, [data]);

  const onSaved = () => {
    qc.invalidateQueries({ queryKey: ["categories-full"] });
    qc.invalidateQueries({ queryKey: ["categories-lite"] });
  };

  const remove = async (c: Cat) => {
    if (!confirm(`حذف دسته "${c.name}"؟ زیردسته‌ها بدون والد می‌شوند.`)) return;
    const { error } = await supabase.from("categories").delete().eq("id", c.id);
    if (error) toast.error(error.message);
    else { toast.success("دسته حذف شد"); onSaved(); }
  };

  const renderNode = (c: Cat, depth: number): React.ReactNode => {
    const children = tree.get(c.id) ?? [];
    return (
      <div key={c.id}>
        <div className="flex items-center justify-between gap-2 border-b border-border p-3" style={{ paddingInlineStart: 12 + depth * 20 }}>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium">{c.name}</span>
              {!c.is_active && <Badge variant="outline">غیرفعال</Badge>}
            </div>
            <div className="text-xs text-muted-foreground" dir="ltr">{c.slug}</div>
          </div>
          {canWrite && (
            <div className="flex shrink-0 gap-1">
              <Button variant="ghost" size="icon" onClick={() => { setEditing(c); setOpen(true); }}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => remove(c)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          )}
        </div>
        {children.map((ch) => renderNode(ch, depth + 1))}
      </div>
    );
  };

  const roots = tree.get(null) ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="دسته‌بندی‌ها"
        description="مدیریت دسته‌بندی محصولات با ساختار درختی"
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link to="/products"><ArrowRight className="ms-1 h-4 w-4" />بازگشت</Link>
            </Button>
            {canWrite && (
              <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}>
                <Plus className="ms-1 h-4 w-4" />دسته جدید
              </Button>
            )}
          </>
        }
      />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">در حال بارگذاری...</div>
          ) : roots.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">دسته‌ای ثبت نشده.</div>
          ) : (
            <div>{roots.map((c) => renderNode(c, 0))}</div>
          )}
        </CardContent>
      </Card>

      <CategoryDialog
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        all={data ?? []}
        onSaved={onSaved}
      />
    </div>
  );
}

function CategoryDialog({ open, onOpenChange, editing, all, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; editing: Cat | null; all: Cat[]; onSaved: () => void;
}) {
  const [values, setValues] = useState<CategoryFormValues>({
    name: "", slug: "", parent_id: null, description: "", is_active: true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setValues(editing
      ? { name: editing.name, slug: editing.slug, parent_id: editing.parent_id, description: editing.description ?? "", is_active: editing.is_active }
      : { name: "", slug: "", parent_id: null, description: "", is_active: true });
    setErrors({});
  };

  const handleOpenChange = (v: boolean) => { if (v) reset(); onOpenChange(v); };

  const submit = async () => {
    const parsed = categorySchema.safeParse(values);
    if (!parsed.success) {
      const flat: Record<string, string> = {};
      for (const i of parsed.error.issues) flat[i.path.join(".")] = i.message;
      setErrors(flat); return;
    }
    if (editing && parsed.data.parent_id === editing.id) {
      toast.error("دسته نمی‌تواند والد خود باشد"); return;
    }
    setErrors({}); setLoading(true);
    try {
      const payload = { ...parsed.data, parent_id: parsed.data.parent_id || null };
      if (editing) {
        const { error } = await supabase.from("categories").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("دسته به‌روزرسانی شد");
      } else {
        const { error } = await supabase.from("categories").insert(payload);
        if (error) throw error;
        toast.success("دسته ایجاد شد");
      }
      onSaved(); onOpenChange(false);
    } catch (e: any) { toast.error(e?.message ?? "خطا"); }
    finally { setLoading(false); }
  };

  const parents = all.filter((c) => !editing || c.id !== editing.id);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? "ویرایش دسته" : "دسته جدید"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>نام *</Label>
            <Input value={values.name} onChange={(e) => setValues((s) => ({ ...s, name: e.target.value }))} />
            {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name}</p>}
          </div>
          <div>
            <Label>اسلاگ *</Label>
            <Input dir="ltr" value={values.slug} onChange={(e) => setValues((s) => ({ ...s, slug: e.target.value }))} />
            {errors.slug && <p className="mt-1 text-xs text-destructive">{errors.slug}</p>}
          </div>
          <div>
            <Label>دسته والد</Label>
            <Select value={values.parent_id ?? "__none"} onValueChange={(v) => setValues((s) => ({ ...s, parent_id: v === "__none" ? null : v }))}>
              <SelectTrigger><SelectValue placeholder="بدون والد" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— بدون والد —</SelectItem>
                {parents.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
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