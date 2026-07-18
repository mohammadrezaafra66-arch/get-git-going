import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { shippingRuleSchema, type ShippingRuleFormValues } from "@/lib/pricing/schemas";

type ProductLite = { id: string; name: string };

export const emptyShippingRule: ShippingRuleFormValues = {
  title: "",
  scope_mode: "product",
  cost_type: "fixed",
  cost_value: 0,
  cost_currency: null,
  product_type: null,
  product_id: null,
  brand_id: null,
  category_id: null,
  min_purchase_price: null,
  max_purchase_price: null,
  priority: 100,
  sort_order: 0,
  is_active: true,
};

/**
 * Debounced product search (350ms) — used for the optional product binding.
 */
function useProductSearch(term: string) {
  const [debounced, setDebounced] = useState(term);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 350);
    return () => clearTimeout(t);
  }, [term]);
  return useQuery({
    queryKey: ["shipping-rule-product-search", debounced],
    enabled: debounced.length >= 2,
    queryFn: async (): Promise<ProductLite[]> => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name")
        .ilike("name", `%${debounced}%`)
        .order("name", { ascending: true })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as ProductLite[];
    },
  });
}

interface Props {
  values: ShippingRuleFormValues;
  onChange: (next: ShippingRuleFormValues) => void;
  errors: Record<string, string>;
  loading?: boolean;
  onSubmit: () => void;
  onCancel: () => void;
  isEditing: boolean;
  initialProductLabel?: string | null;
}

export function ShippingCostRuleForm({
  values,
  onChange,
  errors,
  loading,
  onSubmit,
  onCancel,
  isEditing,
  initialProductLabel,
}: Props) {
  const { data: currencies } = useQuery({
    queryKey: ["currencies-active-lite"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("currencies")
        .select("code, title")
        .eq("is_active", true)
        .neq("code", "toman")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as { code: string; title: string }[];
    },
  });

  const [productTerm, setProductTerm] = useState(initialProductLabel ?? "");
  const productSearch = useProductSearch(productTerm);

  const { data: categories } = useQuery({
    queryKey: ["categories-lite-shipping"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name")
        .order("name", { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const { data: brands } = useQuery({
    queryKey: ["brands-lite-shipping"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brands")
        .select("id, name")
        .eq("is_active", true)
        .order("name", { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const NO_BRAND = "__all_brands";

  const amountLabel =
    values.cost_type === "fixed"
      ? "مبلغ (تومان)"
      : values.cost_type === "percent"
        ? "درصد (%)"
        : "مبلغ (به ارز انتخابی)";
  const amountHint = useMemo(
    () => "این مقدار به عنوان هزینه حمل به قیمت پایه محصول اضافه می‌شود.",
    [],
  );

  const set = <K extends keyof ShippingRuleFormValues>(k: K, v: ShippingRuleFormValues[K]) =>
    onChange({ ...values, [k]: v });

  const productPickerBlock = (label: string) => (
    <div className="sm:col-span-2">
      <Label>{label}</Label>
      <Input
        dir="rtl"
        placeholder="نام محصول را برای جستجو تایپ کنید..."
        value={productTerm}
        onChange={(e) => {
          setProductTerm(e.target.value);
          if (!e.target.value) set("product_id", null);
        }}
      />
      {productSearch.data && productSearch.data.length > 0 && (
        <ul className="mt-1 max-h-40 overflow-y-auto rounded-md border bg-popover text-sm">
          {productSearch.data.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className={`w-full px-3 py-1.5 text-right hover:bg-muted ${
                  values.product_id === p.id ? "bg-muted font-semibold" : ""
                }`}
                onClick={() => {
                  set("product_id", p.id);
                  setProductTerm(p.name);
                }}
              >
                {p.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {values.product_id && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          انتخاب‌شده — برای حذف، فیلد را خالی کنید.
        </p>
      )}
      {errors.product_id && <p className="mt-1 text-xs text-destructive">{errors.product_id}</p>}
    </div>
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="grid gap-3 sm:grid-cols-2"
    >
      <div className="sm:col-span-2">
        <Label>نوع تعریف هزینه *</Label>
        <Select
          value={values.scope_mode}
          onValueChange={(v) => {
            const next = v as "product" | "price_range" | "category";
            // In "category" scope the rule may be narrowed دسته → برند → محصول,
            // so brand_id/product_id are preserved there; "product" keeps only
            // product_id; "price_range" clears all scope bindings.
            onChange({
              ...values,
              scope_mode: next,
              product_id: next === "product" || next === "category" ? values.product_id : null,
              brand_id: next === "category" ? values.brand_id : null,
              category_id: next === "category" ? values.category_id : null,
              min_purchase_price: next === "price_range" ? values.min_purchase_price : null,
              max_purchase_price: next === "price_range" ? values.max_purchase_price : null,
            });
            if (next === "price_range") setProductTerm("");
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="product">بر اساس محصول</SelectItem>
            <SelectItem value="price_range">بر اساس بازه قیمتی</SelectItem>
            <SelectItem value="category">بر اساس دسته</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {values.scope_mode === "product" && productPickerBlock("محصول *")}

      {values.scope_mode === "category" && (
        <>
          <div className="sm:col-span-2">
            <Label>دسته *</Label>
            <Select value={values.category_id ?? ""} onValueChange={(v) => set("category_id", v)}>
              <SelectTrigger>
                <SelectValue placeholder="انتخاب دسته" />
              </SelectTrigger>
              <SelectContent>
                {(categories ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-[11px] text-muted-foreground">
              هزینه برای محصولات این دسته اعمال می‌شود. با انتخاب برند و سپس محصول، می‌توانید آن را
              دقیق‌تر کنید (اولویت: محصول &gt; برند &gt; دسته).
            </p>
            {errors.category_id && (
              <p className="mt-1 text-xs text-destructive">{errors.category_id}</p>
            )}
          </div>

          <div className="sm:col-span-2">
            <Label>برند (اختیاری)</Label>
            <Select
              value={values.brand_id ?? NO_BRAND}
              onValueChange={(v) => {
                const nextBrand = v === NO_BRAND ? null : v;
                // Narrowing to a different brand drops any product below it.
                onChange({
                  ...values,
                  brand_id: nextBrand,
                  product_id: nextBrand ? values.product_id : null,
                });
                if (!nextBrand) setProductTerm("");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="همه برندهای این دسته" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_BRAND}>همه برندهای این دسته</SelectItem>
                {(brands ?? []).map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {values.brand_id && productPickerBlock("محصول خاص (اختیاری)")}
        </>
      )}

      {values.scope_mode === "price_range" && (
        <>
          <div>
            <Label>کف بازه قیمت خرید (تومان)</Label>
            <Input
              type="number"
              inputMode="decimal"
              dir="ltr"
              value={values.min_purchase_price ?? ""}
              onChange={(e) =>
                set("min_purchase_price", e.target.value === "" ? null : Number(e.target.value))
              }
            />
            {errors.min_purchase_price && (
              <p className="mt-1 text-xs text-destructive">{errors.min_purchase_price}</p>
            )}
          </div>
          <div>
            <Label>سقف بازه قیمت خرید (تومان)</Label>
            <Input
              type="number"
              inputMode="decimal"
              dir="ltr"
              value={values.max_purchase_price ?? ""}
              onChange={(e) =>
                set("max_purchase_price", e.target.value === "" ? null : Number(e.target.value))
              }
            />
            {errors.max_purchase_price && (
              <p className="mt-1 text-xs text-destructive">{errors.max_purchase_price}</p>
            )}
          </div>
        </>
      )}

      <div className="sm:col-span-2">
        <Label>عنوان قانون (اختیاری)</Label>
        <Input
          value={values.title ?? ""}
          onChange={(e) => set("title", e.target.value)}
          placeholder="در صورت خالی، عنوان به‌صورت خودکار تولید می‌شود"
        />
        {errors.title && <p className="mt-1 text-xs text-destructive">{errors.title}</p>}
      </div>

      <div>
        <Label>نوع محاسبه *</Label>
        <Select
          value={values.cost_type}
          onValueChange={(v) => {
            const next = v as "fixed" | "percent" | "currency";
            onChange({
              ...values,
              cost_type: next,
              cost_currency: next === "currency" ? (values.cost_currency ?? null) : null,
            });
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="fixed">ثابت (تومان)</SelectItem>
            <SelectItem value="percent">درصدی</SelectItem>
            <SelectItem value="currency">ارزی</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label>{amountLabel} *</Label>
        <Input
          type="number"
          inputMode="decimal"
          dir="ltr"
          value={values.cost_value || ""}
          onChange={(e) => set("cost_value", Number(e.target.value))}
        />
        <p className="mt-1 text-[11px] text-muted-foreground">{amountHint}</p>
        {errors.cost_value && <p className="mt-1 text-xs text-destructive">{errors.cost_value}</p>}
      </div>

      {values.cost_type === "currency" && (
        <div className="sm:col-span-2">
          <Label>نوع ارز *</Label>
          <Select value={values.cost_currency ?? ""} onValueChange={(v) => set("cost_currency", v)}>
            <SelectTrigger>
              <SelectValue placeholder="انتخاب ارز" />
            </SelectTrigger>
            <SelectContent>
              {(currencies ?? []).map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {c.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-1 text-[11px] text-muted-foreground">
            هنگام محاسبه قیمت، آخرین نرخ فعال این ارز اعمال می‌شود.
          </p>
          {errors.cost_currency && (
            <p className="mt-1 text-xs text-destructive">{errors.cost_currency}</p>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 sm:col-span-2">
        <Switch checked={values.is_active} onCheckedChange={(v) => set("is_active", v)} />
        <Label>فعال</Label>
      </div>

      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          انصراف
        </Button>
        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="ms-1 h-4 w-4 animate-spin" />}
          {isEditing ? "ذخیره تغییرات" : "ایجاد قانون"}
        </Button>
      </div>
    </form>
  );
}

// Re-validate via schema before submit; consumers can call this if needed.
export function validateShippingRule(values: ShippingRuleFormValues) {
  return shippingRuleSchema.safeParse(values);
}
