import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { fetchBrandsLite, fetchCategoriesLite, fetchLabelsLite } from "@/lib/products/queries";
import {
  PRODUCT_TYPE_LABELS, BASE_CURRENCY_LABELS, STOCK_STATUS_LABELS, PRODUCT_STATUS_LABELS,
  type ProductType, type BaseCurrency, type StockStatus, type ProductStatus,
} from "@/lib/products/constants";

export interface ProductFilterState {
  q: string;
  brand_id: string | null;
  category_id: string | null;
  product_type: ProductType | null;
  base_currency: BaseCurrency | null;
  stock_status: StockStatus | null;
  status: ProductStatus | null;
  label_ids: string[];
}

export const EMPTY_FILTERS: ProductFilterState = {
  q: "", brand_id: null, category_id: null, product_type: null,
  base_currency: null, stock_status: null, status: null, label_ids: [],
};

interface Props {
  value: ProductFilterState;
  onChange: (next: ProductFilterState) => void;
}

export function ProductFilters({ value, onChange }: Props) {
  const brandsQ = useQuery({ queryKey: ["brands-lite"], queryFn: fetchBrandsLite });
  const catsQ = useQuery({ queryKey: ["categories-lite"], queryFn: fetchCategoriesLite });
  const labelsQ = useQuery({ queryKey: ["labels-lite"], queryFn: fetchLabelsLite });

  const set = <K extends keyof ProductFilterState>(k: K, v: ProductFilterState[K]) => onChange({ ...value, [k]: v });

  const toggleLabel = (id: string) => {
    const exists = value.label_ids.includes(id);
    onChange({ ...value, label_ids: exists ? value.label_ids.filter((x) => x !== id) : [...value.label_ids, id] });
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
          <X className="ms-1 h-4 w-4" />پاک کردن
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
        <FilterSelect
          label="برند"
          value={value.brand_id}
          onChange={(v) => set("brand_id", v)}
          options={(brandsQ.data ?? []).map((b) => ({ value: b.id, label: b.name }))}
        />
        <FilterSelect
          label="دسته"
          value={value.category_id}
          onChange={(v) => set("category_id", v)}
          options={(catsQ.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
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
          onChange={(v) => set("base_currency", v as BaseCurrency | null)}
          options={Object.entries(BASE_CURRENCY_LABELS).map(([k, v]) => ({ value: k, label: v }))}
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
                  active ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground hover:bg-muted"
                }`}
              >
                <span className="me-1 inline-block h-2 w-2 rounded-full align-middle" style={{ backgroundColor: l.color }} />
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
  label, value, onChange, options,
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
        <SelectTrigger className="h-9"><SelectValue placeholder="همه" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__all">همه</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// re-export helpful type
export type { ProductType, BaseCurrency, StockStatus, ProductStatus };