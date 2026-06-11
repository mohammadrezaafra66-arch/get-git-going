import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  fetchBrandsLite,
  fetchCategoriesLite,
  fetchLabelsLite,
  fetchAttributesLite,
} from "@/lib/products/queries";
import {
  PRODUCT_TYPE_LABELS,
  STOCK_STATUS_LABELS,
  PRODUCT_STATUS_LABELS,
  type ProductType,
  type BaseCurrency,
  type StockStatus,
  type ProductStatus,
} from "@/lib/products/constants";

export interface ProductFilterState {
  q: string;
  brand_id: string | null;
  category_id: string | null;
  product_type: ProductType | null;
  base_currency: string | null;
  stock_status: StockStatus | null;
  status: ProductStatus | null;
  label_ids: string[];
  color: string | null;
  capacity: string | null;
  model: string | null;
}

export const EMPTY_FILTERS: ProductFilterState = {
  q: "",
  brand_id: null,
  category_id: null,
  product_type: null,
  base_currency: null,
  stock_status: null,
  status: null,
  label_ids: [],
  color: null,
  capacity: null,
  model: null,
};

interface Props {
  value: ProductFilterState;
  onChange: (next: ProductFilterState) => void;
}

export function ProductFilters({ value, onChange }: Props) {
  const brandsQ = useQuery({ queryKey: ["brands-lite"], queryFn: fetchBrandsLite });
  const catsQ = useQuery({ queryKey: ["categories-lite"], queryFn: fetchCategoriesLite });
  const labelsQ = useQuery({ queryKey: ["labels-lite"], queryFn: fetchLabelsLite });
  const attrsQ = useQuery({ queryKey: ["product-attributes-lite"], queryFn: fetchAttributesLite });
  const currenciesQ = useQuery({
    queryKey: ["currencies-active"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("currencies")
        .select("code, title, is_active, sort_order")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const activeAttrs = (attrsQ.data ?? []).filter((a) => a.is_active);
  const colorOpts = activeAttrs
    .filter((a) => a.type === "color")
    .map((a) => ({ value: a.name, label: a.name }));
  const capacityOpts = activeAttrs
    .filter((a) => a.type === "capacity")
    .map((a) => ({ value: a.name, label: a.name }));
  const modelOpts = activeAttrs
    .filter((a) => a.type === "model")
    .map((a) => ({ value: a.name, label: a.name }));

  const set = <K extends keyof ProductFilterState>(k: K, v: ProductFilterState[K]) =>
    onChange({ ...value, [k]: v });

  const toggleLabel = (id: string) => {
    const exists = value.label_ids.includes(id);
    onChange({
      ...value,
      label_ids: exists ? value.label_ids.filter((x) => x !== id) : [...value.label_ids, id],
    });
  };

  const reset = () => onChange(EMPTY_FILTERS);

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={value.q}
            onChange={(e) => set("q", e.target.value)}
            placeholder="جستجو در نام یا SKU..."
            className="pe-9"
          />
        </div>
        <Button type="button" variant="outline" size="sm" onClick={reset}>
          <X className="ms-1 h-4 w-4" />
          پاک کردن
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
        <FilterSelect
          label="برند"
          value={value.brand_id}
          onChange={(v) => set("brand_id", v)}
          options={(brandsQ.data ?? [])
            .filter((b) => b.is_active)
            .map((b) => ({ value: b.id, label: b.name }))}
        />
        <FilterSelect
          label="دسته"
          value={value.category_id}
          onChange={(v) => set("category_id", v)}
          options={(catsQ.data ?? [])
            .filter((c) => c.is_active)
            .map((c) => ({ value: c.id, label: c.name }))}
        />
        <FilterSelect
          label="نوع"
          value={value.product_type}
          onChange={(v) => set("product_type", v as ProductType | null)}
          options={Object.entries(PRODUCT_TYPE_LABELS).map(([k, v]) => ({ value: k, label: v }))}
        />
        <FilterSelect
          label="ارز"
          value={value.base_currency}
          onChange={(v) => set("base_currency", v)}
          options={(currenciesQ.data ?? []).map((c) => ({
            value: c.code,
            label: `${c.title} (${c.code.toUpperCase()})`,
          }))}
        />
        <FilterSelect
          label="موجودی"
          value={value.stock_status}
          onChange={(v) => set("stock_status", v as StockStatus | null)}
          options={Object.entries(STOCK_STATUS_LABELS).map(([k, v]) => ({ value: k, label: v }))}
        />
        <FilterSelect
          label="وضعیت"
          value={value.status}
          onChange={(v) => set("status", v as ProductStatus | null)}
          options={Object.entries(PRODUCT_STATUS_LABELS).map(([k, v]) => ({ value: k, label: v }))}
        />
        <FilterSelect
          label="رنگ"
          value={value.color}
          onChange={(v) => set("color", v)}
          options={colorOpts}
        />
        <FilterSelect
          label="ظرفیت"
          value={value.capacity}
          onChange={(v) => set("capacity", v)}
          options={capacityOpts}
        />
        <FilterSelect
          label="مدل"
          value={value.model}
          onChange={(v) => set("model", v)}
          options={modelOpts}
        />
      </div>

      {(labelsQ.data ?? []).length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <span className="text-xs text-muted-foreground">برچسب‌ها:</span>
          {(labelsQ.data ?? []).map((l) => {
            const active = value.label_ids.includes(l.id);
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => toggleLabel(l.id)}
                className={`rounded-full border px-3 py-1 text-xs transition ${
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground hover:bg-muted"
                }`}
              >
                <span
                  className="me-1 inline-block h-2 w-2 rounded-full align-middle"
                  style={{ backgroundColor: l.color }}
                />
                {l.title}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground">{label}</label>
      <Select value={value ?? "__all"} onValueChange={(v) => onChange(v === "__all" ? null : v)}>
        <SelectTrigger className="h-9">
          <SelectValue placeholder="همه" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all">همه</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// re-export helpful type
export type { ProductType, BaseCurrency, StockStatus, ProductStatus };
