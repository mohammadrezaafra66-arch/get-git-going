import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { requirePermission } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { ProductForm } from "@/components/products/ProductForm";
import { supabase } from "@/integrations/supabase/client";
import type { ProductFormValues } from "@/lib/products/schemas";
import {
  fetchProductDynamicValues,
  saveProductDynamicValues,
  deleteAllDynamicValuesForProduct,
} from "@/lib/products/category-attrs";

export const Route = createFileRoute("/_app/products_/$id/edit")({
  beforeLoad: async () => { await requirePermission("products", "update"); },
  component: EditProductPage,
});

function EditProductPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const { data: initial, isLoading } = useQuery({
    queryKey: ["product-edit", id],
    queryFn: async (): Promise<{
      values: Partial<ProductFormValues>;
      sku: string | null;
      dynamicValues: Record<string, string>;
      categoryId: string | null;
    } | null> => {
      const { data: p, error } = await supabase
        .from("products")
        .select("name, sku, brand_id, category_id, product_type, base_currency, stock_status, status, unit, color, capacity, model, primary_spec, description, technical_notes")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!p) return null;
      const { data: links } = await supabase
        .from("product_label_links").select("label_id").eq("product_id", id);
      const dynamicValues = await fetchProductDynamicValues(id);
      const { sku, ...rest } = p;
      return {
        sku: sku ?? null,
        dynamicValues,
        categoryId: p.category_id ?? null,
        values: {
          ...rest,
          unit: p.unit ?? "",
          color: p.color ?? "",
          capacity: p.capacity ?? "",
          model: p.model ?? "",
          primary_spec: p.primary_spec ?? "",
          description: p.description ?? "",
          technical_notes: p.technical_notes ?? "",
          label_ids: (links ?? []).map((l) => l.label_id),
        },
      };
    },
  });

  const handleSubmit = async (
    v: ProductFormValues,
    dynamic: Parameters<Parameters<typeof ProductForm>[0]["onSubmit"]>[1],
  ) => {
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
        primary_spec: v.primary_spec || null,
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

      // Sync category-specific attribute values
      if (dynamic.categoryChanged) {
        // Drop everything tied to the previous category before saving new ones.
        await deleteAllDynamicValuesForProduct(id);
      }
      if (v.category_id && dynamic.defs.length > 0) {
        await saveProductDynamicValues(id, dynamic.defs, dynamic.values);
      } else if (!v.category_id) {
        // Category cleared entirely → wipe stale values
        await deleteAllDynamicValuesForProduct(id);
      }

      toast.success("تغییرات ذخیره شد");
      navigate({ to: "/products/$id", params: { id } });
    } catch (e: any) {
      const code = e?.code ?? "";
      const msg = String(e?.message ?? "");
      if (code === "23505" || /duplicate key|sku/i.test(msg)) {
        toast.error("محصولی با این مشخصات (SKU) قبلاً ثبت شده است.");
      } else {
        toast.error(msg || "خطا در ذخیره");
      }
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
        isEdit
        initialDynamicValues={initial.dynamicValues}
        initialCategoryId={initial.categoryId}
        onSubmit={handleSubmit}
        loading={loading}
        submitLabel="ذخیره تغییرات"
        onCancel={() => navigate({ to: "/products/$id", params: { id } })}
      />
    </div>
  );
}