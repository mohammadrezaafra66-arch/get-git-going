import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, RotateCcw } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { WorkbenchFilters, CurrencyCodeV } from "@/lib/pricing/workbench-filters";
import { DEFAULT_WORKBENCH_FILTERS, STOCK_LABEL } from "@/lib/pricing/workbench-filters";
import { CURRENCY_LABELS } from "@/lib/pricing/constants";

// منبع رسمی ارز: Database["public"]["Enums"]["currency_code"] = "toman" | "usd" | "aed"
// فیلتر «ارز خرید» فقط برای محصولات foreign معنی دارد، پس toman از لیست خارج می‌شود.
const FOREIGN_CURRENCIES: CurrencyCodeV[] = (
  Object.keys(CURRENCY_LABELS) as CurrencyCodeV[]
).filter((c) => c !== "toman");

type BrandOpt = { id: string; name: string };
type CatOpt = { id: string; name: string; parent_id: string | null };
type LabelOpt = { id: string; title: string };
type OwnerOpt = { user_id: string; full_name: string | null };

export function WorkbenchFiltersBar({
  filters, onChange, brands, categories, labels, owners,
  search, onSearchChange,
}: {
  filters: WorkbenchFilters;
  onChange: (f: WorkbenchFilters) => void;
  brands: BrandOpt[];
  categories: CatOpt[];
  labels: LabelOpt[];
  owners: OwnerOpt[];
  search: string;
  onSearchChange: (v: string) => void;
}) {
  const parents = useMemo(() => categories.filter((c) => !c.parent_id), [categories]);
  const subs = useMemo(
    () => filters.categoryId !== "all"
      ? categories.filter((c) => c.parent_id === filters.categoryId)
      : [],
    [categories, filters.categoryId],
  );
  const set = (patch: Partial<WorkbenchFilters>) =>
    onChange({ ...filters, ...patch });

  const activeCount =
    (filters.brandId !== "all" ? 1 : 0) +
    (filters.categoryId !== "all" ? 1 : 0) +
    (filters.subcategoryId !== "all" ? 1 : 0) +
    (filters.currencyType !== "all" ? 1 : 0) +
    (filters.currency !== "all" ? 1 : 0) +
    (filters.inventory !== "all" ? 1 : 0) +
    (filters.productStatus !== "all" ? 1 : 0) +
    (filters.salePrice !== "all" ? 1 : 0) +
    (filters.ownerId !== "all" ? 1 : 0) +
    (filters.labelId !== "all" ? 1 : 0);

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          {/* Search */}
          <div className="md:col-span-2">
            <Label className="mb-1 block text-xs">جستجو</Label>
            <div className="relative">
              <Search className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="نام، کد یا مدل محصول..."
                className="pr-8"
              />
            </div>
          </div>

          {/* Brand */}
          <FilterSelect
            label="برند"
            value={filters.brandId}
            onValue={(v) => set({ brandId: v })}
            options={[{ value: "all", label: "همه برندها" }, ...brands.map((b) => ({ value: b.id, label: b.name }))]}
          />

          {/* Category */}
          <FilterSelect
            label="دسته محصول"
            value={filters.categoryId}
            onValue={(v) => set({ categoryId: v, subcategoryId: "all" })}
            options={[{ value: "all", label: "همه دسته‌ها" }, ...parents.map((c) => ({ value: c.id, label: c.name }))]}
          />

          {/* Subcategory */}
          <div>
            <Label className="mb-1 block text-xs">زیر دسته</Label>
            <Select
              value={filters.subcategoryId}
              onValueChange={(v) => set({ subcategoryId: v })}
              disabled={filters.categoryId === "all" || subs.length === 0}
            >
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه زیر دسته‌ها</SelectItem>
                {subs.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Currency Type */}
          <FilterSelect
            label="نوع خرید / مبنای قیمت"
            value={filters.currencyType}
            onValue={(v) =>
              set({ currencyType: v as WorkbenchFilters["currencyType"], currency: "all" })
            }
            options={[
              { value: "all", label: "همه محصولات" },
              { value: "toman", label: "محصولات تومانی" },
              { value: "foreign", label: "محصولات ارزی" },
            ]}
          />

          {/* Currency (only when foreign) */}
          <div>
            <Label className="mb-1 block text-xs">ارز خرید</Label>
            <Select
              value={filters.currency}
              onValueChange={(v) =>
                set({ currency: v === "all" ? "all" : (v as CurrencyCodeV) })
              }
              disabled={filters.currencyType !== "foreign"}
            >
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه ارزها</SelectItem>
                {FOREIGN_CURRENCIES.map((c) => (
                  <SelectItem key={c} value={c}>{CURRENCY_LABELS[c]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Stock */}
          <FilterSelect
            label="وضعیت موجودی"
            value={filters.inventory}
            onValue={(v) => set({ inventory: v as WorkbenchFilters["inventory"] })}
            options={[
              { value: "all", label: "همه" },
              { value: "available", label: STOCK_LABEL.available },
              { value: "limited", label: STOCK_LABEL.limited },
              { value: "unavailable", label: STOCK_LABEL.unavailable },
              { value: "unknown", label: "نامشخص / نیازمند بررسی" },
            ]}
          />

          {/* Active */}
          <FilterSelect
            label="وضعیت محصول"
            value={filters.productStatus}
            onValue={(v) => set({ productStatus: v as WorkbenchFilters["productStatus"] })}
            options={[
              { value: "all", label: "همه" },
              { value: "active", label: "فعال" },
              { value: "inactive", label: "غیرفعال / متوقف‌شده" },
            ]}
          />

          {/* Sale price status */}
          <FilterSelect
            label="وضعیت قیمت فروش"
            value={filters.salePrice}
            onValue={(v) => set({ salePrice: v as WorkbenchFilters["salePrice"] })}
            options={[
              { value: "all", label: "همه" },
              { value: "has", label: "دارای قیمت فروش" },
              { value: "missing", label: "بدون قیمت فروش" },
            ]}
          />

          {/* Owner */}
          <FilterSelect
            label="مسئول محصول"
            value={filters.ownerId}
            onValue={(v) => set({ ownerId: v })}
            options={[
              { value: "all", label: "همه مسئولین" },
              { value: "none", label: "بدون مسئول" },
              ...owners.map((o) => ({
                value: o.user_id,
                label: o.full_name?.trim() || o.user_id.slice(0, 8),
              })),
            ]}
          />

          {/* Label */}
          <FilterSelect
            label="برچسب محصول"
            value={filters.labelId}
            onValue={(v) => set({ labelId: v })}
            options={[
              { value: "all", label: "همه" },
              { value: "any", label: "دارای حداقل یک برچسب" },
              { value: "none", label: "بدون برچسب" },
              ...labels.map((l) => ({ value: l.id, label: l.title })),
            ]}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          {activeCount > 0 ? (
            <Badge variant="secondary">{activeCount} فیلتر فعال</Badge>
          ) : (
            <span className="text-xs text-muted-foreground">فیلتری اعمال نشده است</span>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => { onChange(DEFAULT_WORKBENCH_FILTERS); onSearchChange(""); }}
            disabled={activeCount === 0 && !search}
          >
            <RotateCcw className="ms-1 h-3.5 w-3.5" /> پاک‌کردن فیلترها
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function FilterSelect({
  label, value, onValue, options,
}: {
  label: string;
  value: string;
  onValue: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <Label className="mb-1 block text-xs">{label}</Label>
      <Select value={value} onValueChange={onValue}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}