import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, ArrowRight, Pencil, Trash2, Power } from "lucide-react";
import { requirePermission } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { hasAnyRole } from "@/lib/rbac/roles";
import { type ShippingRuleFormValues } from "@/lib/pricing/schemas";
import {
  SHIPPING_COST_TYPE_LABELS,
  CURRENCY_LABELS,
  type CurrencyCode,
} from "@/lib/pricing/constants";
import { formatNumber } from "@/lib/i18n/formatters";
import {
  ShippingCostRuleForm,
  emptyShippingRule,
  validateShippingRule,
} from "@/shared/components/ShippingCostRuleForm";

export const Route = createFileRoute("/_app/pricing/shipping-rules")({
  beforeLoad: async () => {
    await requirePermission("pricing", "view");
  },
  component: ShippingRulesPage,
});

interface SRule {
  id: string;
  title: string;
  cost_type: "fixed" | "percent" | "currency";
  cost_value: number;
  cost_currency: string | null;
  product_type: "iranian" | "foreign" | null;
  product_id: string | null;
  brand_id: string | null;
  category_id: string | null;
  product_name?: string | null;
  brand_name?: string | null;
  category_name?: string | null;
  min_purchase_price: number | null;
  max_purchase_price: number | null;
  is_active: boolean;
  priority: number;
  sort_order: number;
}

type NameRow = { id: string; name: string | null };

function ShippingRulesPage() {
  const { roles } = useAuth();
  const canWrite = hasAnyRole(roles, ["admin", "accountant"]);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SRule | null>(null);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  const { data, isLoading, error } = useQuery({
    queryKey: ["shipping-rules", page],
    queryFn: async (): Promise<SRule[]> => {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, error } = await supabase
        .from("shipping_cost_rules")
        .select(
          `
          id, title, cost_type, cost_value, cost_currency, product_type,
          product_id, brand_id, category_id,
          min_purchase_price, max_purchase_price,
          is_active, priority, sort_order
        `,
        )
        .order("sort_order", { ascending: true })
        .order("priority", { ascending: true })
        .range(from, to);
      if (error) throw error;
      const rows = (data ?? []) as SRule[];
      const productIds = [...new Set(rows.map((r) => r.product_id).filter(Boolean))] as string[];
      const brandIds = [...new Set(rows.map((r) => r.brand_id).filter(Boolean))] as string[];
      const categoryIds = [...new Set(rows.map((r) => r.category_id).filter(Boolean))] as string[];
      const emptyNameRows = Promise.resolve({ data: [] as NameRow[], error: null });
      const [productsRes, brandsRes, categoriesRes] = await Promise.all([
        productIds.length
          ? supabase.from("products").select("id,name").in("id", productIds)
          : emptyNameRows,
        brandIds.length
          ? supabase.from("brands").select("id,name").in("id", brandIds)
          : emptyNameRows,
        categoryIds.length
          ? supabase.from("categories").select("id,name").in("id", categoryIds)
          : emptyNameRows,
      ]);
      if (productsRes.error) throw productsRes.error;
      if (brandsRes.error) throw brandsRes.error;
      if (categoriesRes.error) throw categoriesRes.error;
      const productNames = new Map((productsRes.data ?? []).map((p) => [p.id, p.name]));
      const brandNames = new Map((brandsRes.data ?? []).map((b) => [b.id, b.name]));
      const categoryNames = new Map((categoriesRes.data ?? []).map((c) => [c.id, c.name]));
      return rows.map((r) => ({
        ...r,
        product_name: r.product_id ? (productNames.get(r.product_id) ?? null) : null,
        brand_name: r.brand_id ? (brandNames.get(r.brand_id) ?? null) : null,
        category_name: r.category_id ? (categoryNames.get(r.category_id) ?? null) : null,
      }));
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["shipping-rules"] });

  const toggle = async (r: SRule) => {
    if (r.is_active && !confirm(`قانون "${r.title}" غیرفعال شود؟`)) return;
    const { error } = await supabase
      .from("shipping_cost_rules")
      .update({ is_active: !r.is_active })
      .eq("id", r.id);
    if (error) toast.error(error.message);
    else {
      toast.success(r.is_active ? "غیرفعال شد" : "فعال شد");
      refresh();
    }
  };

  const remove = async (r: SRule) => {
    if (!confirm(`حذف قانون "${r.title}"؟`)) return;
    const { error } = await supabase.from("shipping_cost_rules").delete().eq("id", r.id);
    if (error) toast.error(error.message);
    else {
      toast.success("حذف شد");
      refresh();
    }
  };

  const scopeLabel = (r: SRule) => {
    // Combined دسته → برند → محصول chain is shown as a single narrowed label.
    const parts: string[] = [];
    if (r.category_name) parts.push(`دسته: ${r.category_name}`);
    if (r.brand_name) parts.push(`برند: ${r.brand_name}`);
    if (r.product_name) parts.push(r.product_name);
    if (parts.length > 0) return parts.join(" · ");
    if (r.min_purchase_price != null || r.max_purchase_price != null) return "بازه قیمت خرید";
    return "—";
  };

  const renderCostValue = (r: SRule) => {
    if (r.cost_type === "percent") return `%${formatNumber(Number(r.cost_value))}`;
    if (r.cost_type === "currency") {
      const label = r.cost_currency
        ? (CURRENCY_LABELS[r.cost_currency as CurrencyCode] ?? r.cost_currency)
        : "—";
      return `${formatNumber(Number(r.cost_value))} ${label}`;
    }
    return `${formatNumber(Number(r.cost_value))} ت`;
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="قوانین هزینه حمل"
        description="تعریف هزینه حمل بر اساس محصول، دسته‌بندی، برند یا نوع کالا"
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link to="/pricing">
                <ArrowRight className="ms-1 h-4 w-4" />
                بازگشت
              </Link>
            </Button>
            {canWrite && (
              <Button
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setOpen(true);
                }}
              >
                <Plus className="ms-1 h-4 w-4" />
                قانون جدید
              </Button>
            )}
          </>
        }
      />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">در حال بارگذاری...</div>
          ) : error ? (
            <div className="p-6 text-center text-sm text-destructive">
              خطا در دریافت قوانین حمل.
            </div>
          ) : (data ?? []).length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              قانون حملی ثبت نشده.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50 text-right text-xs text-muted-foreground">
                  <tr>
                    <th className="p-3">محصول</th>
                    <th className="p-3">نوع</th>
                    <th className="p-3">مقدار</th>
                    <th className="p-3">عنوان</th>
                    <th className="p-3">وضعیت</th>
                    <th className="p-3">عملیات</th>
                  </tr>
                </thead>
                <tbody>
                  {(data ?? []).map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="p-3 font-medium">{scopeLabel(r)}</td>
                      <td className="p-3 text-xs">{SHIPPING_COST_TYPE_LABELS[r.cost_type]}</td>
                      <td className="p-3">{renderCostValue(r)}</td>
                      <td className="p-3 text-xs text-muted-foreground">{r.title || "—"}</td>
                      <td className="p-3">
                        {r.is_active ? (
                          <Badge>فعال</Badge>
                        ) : (
                          <Badge variant="outline">غیرفعال</Badge>
                        )}
                      </td>
                      <td className="p-3">
                        {canWrite && (
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setEditing(r);
                                setOpen(true);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => toggle(r)}
                              title={r.is_active ? "غیرفعال‌سازی" : "فعال‌سازی"}
                            >
                              <Power
                                className={`h-4 w-4 ${r.is_active ? "text-destructive" : ""}`}
                              />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => remove(r)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {(data ?? []).length > 0 && (
            <div className="flex items-center justify-between gap-2 border-t p-3 text-xs text-muted-foreground">
              <span>صفحه {formatNumber(page + 1)}</span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  قبلی
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={(data ?? []).length < PAGE_SIZE}
                  onClick={() => setPage((p) => p + 1)}
                >
                  بعدی
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <SRuleDialog open={open} onOpenChange={setOpen} editing={editing} onSaved={refresh} />
    </div>
  );
}

function SRuleDialog({
  open,
  onOpenChange,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: SRule | null;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<ShippingRuleFormValues>(emptyShippingRule);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const initialProductLabel = useMemo(() => editing?.product_name ?? null, [editing]);

  const handleOpenChange = (v: boolean) => {
    if (v) {
      if (editing) {
        // Category-scoped rules (incl. the دسته → برند → محصول chain) open in
        // "category" so the brand/product narrowing is editable; a rule bound
        // only to a product (no category) opens in "product".
        const scope_mode: "product" | "category" | "price_range" = editing.category_id
          ? "category"
          : editing.product_id
            ? "product"
            : editing.min_purchase_price != null || editing.max_purchase_price != null
              ? "price_range"
              : "product";
        setValues({
          title: editing.title ?? "",
          scope_mode,
          cost_type: editing.cost_type,
          cost_value: Number(editing.cost_value),
          cost_currency: editing.cost_currency ?? null,
          product_type: editing.product_type,
          product_id: editing.product_id,
          brand_id: editing.brand_id,
          category_id: editing.category_id,
          min_purchase_price: editing.min_purchase_price,
          max_purchase_price: editing.max_purchase_price,
          priority: editing.priority,
          sort_order: editing.sort_order ?? 0,
          is_active: editing.is_active,
        });
      } else {
        setValues(emptyShippingRule);
      }
      setErrors({});
    }
    onOpenChange(v);
  };

  const submit = async () => {
    const parsed = validateShippingRule(values);
    if (!parsed.success) {
      const f: Record<string, string> = {};
      for (const i of parsed.error.issues) f[i.path.join(".")] = i.message;
      setErrors(f);
      const firstMsg = parsed.error.issues[0]?.message ?? "اطلاعات فرم نامعتبر است";
      toast.error(firstMsg);
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      const data = parsed.data;
      // اگر عنوان خالی است، عنوان مناسب تولید کن
      let title = (data.title ?? "").trim();
      if (!title) {
        if (data.scope_mode === "product" && data.product_id) {
          const { data: p } = await supabase
            .from("products")
            .select("name")
            .eq("id", data.product_id)
            .maybeSingle();
          title = p?.name ?? "قانون حمل";
        } else if (data.scope_mode === "category" && data.category_id) {
          const { data: c } = await supabase
            .from("categories")
            .select("name")
            .eq("id", data.category_id)
            .maybeSingle();
          title = c?.name ? `دسته: ${c.name}` : "قانون حمل دسته";
        } else if (data.scope_mode === "price_range") {
          const lo =
            data.min_purchase_price != null
              ? Number(data.min_purchase_price).toLocaleString("fa-IR")
              : "—";
          const hi =
            data.max_purchase_price != null
              ? Number(data.max_purchase_price).toLocaleString("fa-IR")
              : "—";
          title = `بازه ${lo} تا ${hi} ت`;
        }
      }
      // scope_mode فقط برای UI است؛ به DB ارسال نمی‌شود
      const { scope_mode, ...rest } = data;
      void scope_mode;
      const payload = {
        ...rest,
        title: title || "قانون حمل",
        cost_currency: data.cost_type === "currency" ? (data.cost_currency ?? null) : null,
      };
      if (editing) {
        const { error } = await supabase
          .from("shipping_cost_rules")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
        toast.success("به‌روزرسانی شد");
      } else {
        const { error } = await supabase.from("shipping_cost_rules").insert([payload]);
        if (error) throw error;
        toast.success("ثبت شد");
      }
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا در ذخیره");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? "ویرایش قانون حمل" : "قانون حمل جدید"}</DialogTitle>
        </DialogHeader>
        <ShippingCostRuleForm
          values={values}
          onChange={setValues}
          errors={errors}
          loading={loading}
          onSubmit={submit}
          onCancel={() => onOpenChange(false)}
          isEditing={!!editing}
          initialProductLabel={initialProductLabel}
        />
        <DialogFooter className="hidden" />
      </DialogContent>
    </Dialog>
  );
}
