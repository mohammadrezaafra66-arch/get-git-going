import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { requirePermission } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { ProductForm } from "@/components/products/ProductForm";
import { supabase } from "@/integrations/supabase/client";
import type { ProductFormValues } from "@/lib/products/schemas";
import { saveProductDynamicValues } from "@/lib/products/category-attrs";

export const Route = createFileRoute("/_app/products/new")({
  beforeLoad: async () => {
    await requirePermission("products", "create");
  },
  component: NewProductPage,
});

function NewProductPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (
    v: ProductFormValues,
    dynamic: Parameters<Parameters<typeof ProductForm>[0]["onSubmit"]>[1],
  ) => {
    setLoading(true);
    try {
      const { data: inserted, error } = await supabase
        .from("products")
        .insert({
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
          barcode: v.barcode?.trim() ? v.barcode.trim() : null,
          // کد کالای آسان — اختیاری. مقدار خالی به NULL تبدیل می‌شود (تریگر ۲۸۹ هم همین
          // کار را سمت دیتابیس می‌کند تا فراخوان مستقیم API هم از قاعده جا نماند).
          accounting_code: v.accounting_code?.trim() ? v.accounting_code.trim() : null,
          torob_url: v.torob_url?.trim() ? v.torob_url.trim() : null,
          // Item 166 — standalone promotion weight (1 = neutral).
          promotion_weight: v.promotion_weight ?? 1,
        })
        .select("id")
        .single();
      if (error) throw error;

      if (v.label_ids.length > 0) {
        const links = v.label_ids.map((label_id) => ({ product_id: inserted.id, label_id }));
        const { error: linkErr } = await supabase.from("product_label_links").insert(links);
        if (linkErr) throw linkErr;
      }

      // Save category-specific attribute values (only when category is set)
      if (v.category_id && dynamic.defs.length > 0) {
        await saveProductDynamicValues(inserted.id, dynamic.defs, dynamic.values);
      }

      toast.success("محصول با موفقیت ایجاد شد");
      navigate({ to: "/products/$id", params: { id: inserted.id } });
    } catch (e: any) {
      const code = e?.code ?? "";
      const msg = String(e?.message ?? "");
      if (code === "23505" && /products_dedup_key_unique/i.test(msg)) {
        toast.error("محصول تکراری است: ترکیب «برند + دسته + مدل + رنگ + ظرفیت» قبلاً ثبت شده است.");
      } else if (code === "23505" && /products_accounting_code_unique/i.test(msg)) {
        toast.error("این «کد کالا در آسان» قبلاً برای محصول دیگری ثبت شده است.");
      } else if (code === "23514" && /products_torob_url_http_chk/i.test(msg)) {
        toast.error("لینک ترب نامعتبر است؛ باید با http:// یا https:// شروع شود.");
      } else if (code === "23505" || /duplicate key|sku/i.test(msg)) {
        toast.error("محصولی با این مشخصات (SKU) قبلاً ثبت شده است.");
      } else {
        toast.error(msg || "خطا در ایجاد محصول");
      }
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
