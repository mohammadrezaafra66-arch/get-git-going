import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, ArrowRight, Loader2, Pencil, Power, Search } from "lucide-react";
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
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { hasAnyRole } from "@/lib/rbac/roles";
import { useDebounce } from "@/hooks/use-debounce";
import { brandSchema, type BrandFormValues } from "@/lib/products/schemas";

export const Route = createFileRoute("/_app/products/brands")({
  beforeLoad: async () => { await requirePermission("products", "view"); },
  component: BrandsPage,
});

interface Brand { id: string; name: string; slug: string; description: string | null; is_active: boolean; }
const PAGE_SIZE = 20;

function BrandsPage() {
  const { roles } = useAuth();
  const canWrite = hasAnyRole(roles, ["admin", "manager", "accountant"]);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Brand | null>(null);
  const [search, setSearch] = useState("");
  const dSearch = useDebounce(search, 350);
  const [page, setPage] = useState(0);
  const [toggleTarget, setToggleTarget] = useState<Brand | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["brands-admin", dSearch, page],
    queryFn: async (): Promise<{ rows: Brand[]; total: number }> => {
      const safe = dSearch.trim().replace(/[%_]/g, "");
      let q = supabase.from("brands")
        .select("id, name, slug, description, is_active")
        .order("name", { ascending: true })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (safe.length >= 2) q = q.ilike("name", `%${safe}%`);
      const { data, error, count } = await q;
      if (error) throw error;
      // separate count query
      let cq = supabase.from("brands").select("id", { count: "exact", head: true });
      if (safe.length >= 2) cq = cq.ilike("name", `%${safe}%`);
      const cr = await cq;
      return { rows: data ?? [], total: cr.count ?? count ?? 0 };
    },
    staleTime: 30_000,
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const productCountsQ = useQuery({
    enabled: rows.length > 0,
    queryKey: ["brands-product-counts", rows.map((b) => b.id).join(",")],
    queryFn: async () => {
      const ids = rows.map((b) => b.id);
      const { data, error } = await supabase
        .from("products")
        .select("brand_id")
        .in("brand_id", ids);
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const r of (data ?? []) as { brand_id: string | null }[]) {
        if (r.brand_id) map[r.brand_id] = (map[r.brand_id] ?? 0) + 1;
      }
      return map;
    },
    staleTime: 60_000,
  });

  const onSaved = () => {
    qc.invalidateQueries({ queryKey: ["brands-admin"] });
    qc.invalidateQueries({ queryKey: ["brands-lite"] });
  };

  const toggleStatus = async (b: Brand) => {
    const { error } = await supabase.from("brands").update({ is_active: !b.is_active }).eq("id", b.id);
    if (error) toast.error(error.message);
    else { toast.success(b.is_active ? "برند غیرفعال شد" : "برند فعال شد"); onSaved(); }
    setToggleTarget(null);
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
        <CardContent className="p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              placeholder="جستجوی نام برند (حداقل ۲ کاراکتر)"
              className="pr-9"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">در حال بارگذاری...</div>
          ) : rows.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">برندی ثبت نشده.</div>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-2 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{b.name}</span>
                      {b.is_active
                        ? <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white">فعال</Badge>
                        : <Badge variant="destructive">غیرفعال</Badge>}
                      <Badge variant="secondary" className="text-[11px]">
                        {productCountsQ.data?.[b.id] ?? 0} محصول
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground" dir="ltr">{b.slug}</div>
                    {b.description && <div className="mt-1 text-xs text-muted-foreground">{b.description}</div>}
                  </div>
                  {canWrite && (
                    <div className="flex shrink-0 gap-1">
                      <Button variant="ghost" size="icon" onClick={() => { setEditing(b); setOpen(true); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setToggleTarget(b)} title={b.is_active ? "غیرفعال" : "فعال"}>
                        <Power className={`h-4 w-4 ${b.is_active ? "text-destructive" : "text-emerald-600"}`} />
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">صفحه {page + 1} از {totalPages} ({total} مورد)</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>قبلی</Button>
            <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>بعدی</Button>
          </div>
        </div>
      )}

      <BrandDialog open={open} onOpenChange={setOpen} editing={editing} onSaved={onSaved} />

      <AlertDialog open={!!toggleTarget} onOpenChange={(v) => !v && setToggleTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{toggleTarget?.is_active ? "غیرفعال‌سازی برند" : "فعال‌سازی برند"}</AlertDialogTitle>
            <AlertDialogDescription>
              {toggleTarget?.is_active
                ? `آیا از غیرفعال‌کردن «${toggleTarget?.name}» اطمینان دارید؟ این برند در فرم‌های جدید نمایش داده نخواهد شد ولی در سوابق باقی می‌ماند.`
                : `آیا از فعال‌کردن «${toggleTarget?.name}» اطمینان دارید؟`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction onClick={() => toggleTarget && toggleStatus(toggleTarget)}>
              تایید
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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