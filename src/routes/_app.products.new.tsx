import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { requirePermission } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { ProductForm } from "@/components/products/ProductForm";
import { supabase } from "@/integrations/supabase/client";
import type { ProductFormValues } from "@/lib/products/schemas";

export const Route = createFileRoute("/_app/products/new")({
  beforeLoad: async () => { await requirePermission("products", "create"); },
  component: NewProductPage,
});

function NewProductPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (v: ProductFormValues) => {
    setLoading(true);
    try {
      const { data: inserted, error } = await supabase
        .from("products")
        .insert({
          name: v.name,
          sku: v.sku || null,
          brand_id: v.brand_id || null,
          category_id: v.category_id || null,
          product_type: v.product_type,
          base_currency: v.base_currency,
          stock_status: v.stock_status,
          status: v.status,
          unit: v.unit || null,
          description: v.description || null,
          technical_notes: v.technical_notes || null,
        })
        .select("id")
        .single();
      if (error) throw error;

      if (v.label_ids.length > 0) {
        const links = v.label_ids.map((label_id) => ({ product_id: inserted.id, label_id }));
        const { error: linkErr } = await supabase.from("product_label_links").insert(links);
        if (linkErr) throw linkErr;
      }

      toast.success("محصول با موفقیت ایجاد شد");
      navigate({ to: "/products/$id", params: { id: inserted.id } });
    } catch (e: any) {
      toast.error(e?.message ?? "خطا در ایجاد محصول");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader title="محصول جدید" description="افزودن محصول جدید به سامانه" />
      <ProductForm
        onSubmit={handleSubmit}
        loading={loading}
        submitLabel="ایجاد محصول"
        onCancel={() => navigate({ to: "/products" })}
      />
    </div>
  );
}