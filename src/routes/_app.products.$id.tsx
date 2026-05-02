import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Pencil, ArrowRight, UserPlus, Trash2, Loader2 } from "lucide-react";
import { requirePermission } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { hasPermission } from "@/lib/rbac/roles";
import {
  PRODUCT_TYPE_LABELS, BASE_CURRENCY_LABELS, STOCK_STATUS_LABELS, STOCK_STATUS_VARIANTS,
  PRODUCT_STATUS_LABELS, PRODUCT_STATUS_VARIANTS,
} from "@/lib/products/constants";
import { formatDateFa } from "@/lib/i18n/formatters";
import { OwnerAssignDialog } from "@/components/products/OwnerAssignDialog";
import { ProductSupplierManager } from "@/shared/components/ProductSupplierManager";

export const Route = createFileRoute("/_app/products/$id")({
  beforeLoad: async () => { await requirePermission("products", "view"); },
  component: ProductDetailPage,
});

function ProductDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { roles } = useAuth();
  const canUpdate = hasPermission(roles, "products", "update");
  const canDelete = hasPermission(roles, "products", "delete");
  const [ownerOpen, setOwnerOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["product", id],
    queryFn: async () => {
      const { data: p, error } = await supabase
        .from("products")
        .select(`
          id, name, sku, description, technical_notes, unit, color, capacity, model, primary_spec,
          product_type, base_currency, stock_status, status,
          created_at, updated_at,
          brand:brands(id,name), category:categories(id,name,primary_spec_label),
          product_label_links(label:product_labels(id,title,color))
        `)
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!p) return null;

      const { data: owners } = await supabase
        .from("product_owner_assignments")
        .select("user_id, created_at")
        .eq("product_id", id);

      const userIds = (owners ?? []).map((o) => o.user_id);
      let profiles: { id: string; full_name: string | null }[] = [];
      if (userIds.length > 0) {
        const { data: prof } = await supabase
          .from("profiles").select("id, full_name").in("id", userIds);
        profiles = prof ?? [];
      }
      return { product: p, owners: (owners ?? []).map((o) => ({
        user_id: o.user_id,
        full_name: profiles.find((x) => x.id === o.user_id)?.full_name ?? "—",
        created_at: o.created_at,
      })) };
    },
  });

  const dynamicQ = useQuery({
    queryKey: ["product-dynamic-attrs", id],
    queryFn: async () => {
      const { data: vals, error } = await supabase
        .from("product_category_attribute_values")
        .select("value, category_attribute_id, def:category_product_attributes(id, label_fa, sort_order, is_active)")
        .eq("product_id", id);
      if (error) throw error;
      const rows = (vals ?? [])
        .map((r: any) => ({
          id: r.def?.id ?? r.category_attribute_id,
          label: r.def?.label_fa ?? "—",
          sort_order: r.def?.sort_order ?? 0,
          value: r.value ?? "",
          is_active: r.def?.is_active ?? true,
        }))
        .filter((r) => r.value !== "");
      rows.sort((a, b) => (a.sort_order - b.sort_order) || a.label.localeCompare(b.label, "fa"));
      return rows;
    },
  });

  if (isLoading) return <div className="py-10 text-center text-sm text-muted-foreground">در حال بارگذاری...</div>;
  if (!data?.product) return <div className="py-10 text-center text-sm text-muted-foreground">محصول یافت نشد.</div>;

  const p = data.product as any;
  const labels = (p.product_label_links ?? []).map((x: any) => x.label).filter(Boolean);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
      toast.success("محصول حذف شد");
      navigate({ to: "/products" });
    } catch (e: any) {
      toast.error(e?.message ?? "خطا در حذف محصول");
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={p.name}
        description={p.sku ? `SKU: ${p.sku}` : "بدون SKU"}
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link to="/products"><ArrowRight className="ms-1 h-4 w-4" />بازگشت</Link>
            </Button>
            {canUpdate && (
              <Button size="sm" onClick={() => navigate({ to: "/products/$id/edit", params: { id } })}>
                <Pencil className="ms-1 h-4 w-4" />ویرایش
              </Button>
            )}
            {canDelete && (
              <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="ms-1 h-4 w-4" />حذف
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="grid gap-3 p-4 md:grid-cols-2">
            <Info label="برند" value={p.brand?.name ?? "—"} />
            <Info label="دسته" value={p.category?.name ?? "—"} />
            <Info label="SKU" value={p.sku ?? "—"} />
            <Info label="رنگ" value={p.color ?? "—"} />
            <Info label="ظرفیت" value={p.capacity ?? "—"} />
            <Info label="مدل" value={p.model ?? "—"} />
            <Info
              label={(p.category as any)?.primary_spec_label || "مشخصه اصلی"}
              value={p.primary_spec ?? "—"}
            />
            <Info label="نوع" value={PRODUCT_TYPE_LABELS[p.product_type as keyof typeof PRODUCT_TYPE_LABELS]} />
            <Info label="ارز مبنا" value={(BASE_CURRENCY_LABELS as Record<string, string>)[p.base_currency as string] ?? String(p.base_currency).toUpperCase()} />
            <Info label="وضعیت موجودی">
              <Badge variant={STOCK_STATUS_VARIANTS[p.stock_status as keyof typeof STOCK_STATUS_VARIANTS]}>
                {STOCK_STATUS_LABELS[p.stock_status as keyof typeof STOCK_STATUS_LABELS]}
              </Badge>
            </Info>
            <Info label="وضعیت محصول">
              <Badge variant={PRODUCT_STATUS_VARIANTS[p.status as keyof typeof PRODUCT_STATUS_VARIANTS]}>
                {PRODUCT_STATUS_LABELS[p.status as keyof typeof PRODUCT_STATUS_LABELS]}
              </Badge>
            </Info>
            <Info label="واحد" value={p.unit ?? "—"} />
            <Info label="آخرین به‌روزرسانی" value={formatDateFa(p.updated_at)} />

            {p.description && (
              <div className="md:col-span-2">
                <div className="mb-1 text-xs text-muted-foreground">توضیحات</div>
                <div className="whitespace-pre-wrap rounded-md bg-muted/30 p-3 text-sm">{p.description}</div>
              </div>
            )}
            {p.technical_notes && (
              <div className="md:col-span-2">
                <div className="mb-1 text-xs text-muted-foreground">یادداشت فنی</div>
                <div className="whitespace-pre-wrap rounded-md bg-muted/30 p-3 text-sm">{p.technical_notes}</div>
              </div>
            )}

            {labels.length > 0 && (
              <div className="md:col-span-2">
                <div className="mb-1 text-xs text-muted-foreground">برچسب‌ها</div>
                <div className="flex flex-wrap gap-2">
                  {labels.map((l: any) => (
                    <span key={l.id} className="rounded-full px-3 py-1 text-xs"
                      style={{ backgroundColor: `${l.color}22`, color: l.color }}>
                      {l.title}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">مسئولان محصول</h3>
              {canUpdate && (
                <Button size="sm" variant="outline" onClick={() => setOwnerOpen(true)}>
                  <UserPlus className="ms-1 h-4 w-4" />انتساب
                </Button>
              )}
            </div>
            {data.owners.length === 0 ? (
              <p className="text-xs text-muted-foreground">هنوز مسئولی برای این محصول تعیین نشده.</p>
            ) : (
              <ul className="space-y-2">
                {data.owners.map((o) => (
                  <li key={o.user_id} className="flex items-center justify-between rounded-md border border-border bg-background p-2 text-sm">
                    <span>{o.full_name}</span>
                    {canUpdate && <RemoveOwnerButton productId={id} userId={o.user_id} onDone={refetch} />}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <OwnerAssignDialog
        productId={id}
        open={ownerOpen}
        onOpenChange={setOwnerOpen}
        existingUserIds={data.owners.map((o) => o.user_id)}
        onAssigned={refetch}
      />

      <ProductSupplierManager productId={id} />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف محصول؟</AlertDialogTitle>
            <AlertDialogDescription>این عملیات قابل بازگشت نیست. محصول و اتصالات آن حذف خواهد شد.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="ms-1 h-4 w-4 animate-spin" />}حذف کن
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Info({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{children ?? value ?? "—"}</div>
    </div>
  );
}

function RemoveOwnerButton({ productId, userId, onDone }: { productId: string; userId: string; onDone: () => void }) {
  const [loading, setLoading] = useState(false);
  const remove = async () => {
    setLoading(true);
    const { error } = await supabase
      .from("product_owner_assignments")
      .delete()
      .eq("product_id", productId)
      .eq("user_id", userId);
    setLoading(false);
    if (error) toast.error(error.message);
    else { toast.success("مسئول حذف شد"); onDone(); }
  };
  return (
    <Button variant="ghost" size="sm" onClick={remove} disabled={loading}>
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5 text-destructive" />}
    </Button>
  );
}