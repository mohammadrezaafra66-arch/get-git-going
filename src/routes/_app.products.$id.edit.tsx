import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { requirePermission } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { ProductForm } from "@/components/products/ProductForm";
import { supabase } from "@/integrations/supabase/client";
import type { ProductFormValues } from "@/lib/products/schemas";

export const Route = createFileRoute("/_app/products/$id/edit")({
  beforeLoad: async () => { await requirePermission("products", "update"); },
  component: EditProductPage,
});

function EditProductPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const { data: initial, isLoading } = useQuery({
    queryKey: ["product-edit", id],
    queryFn: async (): Promise<{ values: Partial<ProductFormValues>; sku: string | null } | null> => {
      const { data: p, error } = await supabase
        .from("products")
        .select("name, sku, brand_id, category_id, product_type, base_currency, stock_status, status, unit, color, capacity, model, description, technical_notes")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!p) return null;
      const { data: links } = await supabase
        .from("product_label_links").select("label_id").eq("product_id", id);
      const { sku, ...rest } = p;
      return {
        sku: sku ?? null,
        values: {
          ...rest,
          unit: p.unit ?? "",
          color: p.color ?? "",
          capacity: p.capacity ?? "",
          model: p.model ?? "",
          description: p.description ?? "",
          technical_notes: p.technical_notes ?? "",
          label_ids: (links ?? []).map((l) => l.label_id),
        },
      };
    },
  });

  const handleSubmit = async (v: ProductFormValues) => {
    setLoading(true);
    try {
      const { error } = await supabase.from("products").update({
        name: v.name,
        brand_id: v.brand_id || null,
        category_id: v.category_id || null,
        product_type: v.product_type,
        base_currency: v.base_currency,
        stock_status: v.stock_status,
        status: v.status,
        unit: v.unit || null,
        color: v.color || null,
        capacity: v.capacity || null,
        model: v.model || null,
        description: v.description || null,
        technical_notes: v.technical_notes || null,
      }).eq("id", id);
      if (error) throw error;

      // sync labels
      const { data: existing } = await supabase
        .from("product_label_links").select("label_id").eq("product_id", id);
      const existingIds = new Set((existing ?? []).map((x) => x.label_id));
      const nextIds = new Set(v.label_ids);
      const toAdd = [...nextIds].filter((x) => !existingIds.has(x));
      const toRemove = [...existingIds].filter((x) => !nextIds.has(x));

      if (toAdd.length > 0) {
        const rows = toAdd.map((label_id) => ({ product_id: id, label_id }));
        const { error: addErr } = await supabase.from("product_label_links").insert(rows);
        if (addErr) throw addErr;
      }
      if (toRemove.length > 0) {
        const { error: rmErr } = await supabase
          .from("product_label_links").delete().eq("product_id", id).in("label_id", toRemove);
        if (rmErr) throw rmErr;
      }

      toast.success("تغییرات ذخیره شد");
      navigate({ to: "/products/$id", params: { id } });
    } catch (e: any) {
      toast.error(e?.message ?? "خطا در ذخیره");
    } finally {
      setLoading(false);
    }
  };

  if (isLoading) return <div className="py-10 text-center text-sm text-muted-foreground">در حال بارگذاری...</div>;
  if (!initial) return <div className="py-10 text-center text-sm text-muted-foreground">محصول یافت نشد.</div>;

  return (
    <div className="space-y-5">
      <PageHeader title="ویرایش محصول" description={initial.values.name} />
      <ProductForm
        initial={initial.values}
        existingSku={initial.sku}
        onSubmit={handleSubmit}
        loading={loading}
        submitLabel="ذخیره تغییرات"
        onCancel={() => navigate({ to: "/products/$id", params: { id } })}
      />
    </div>
  );
}