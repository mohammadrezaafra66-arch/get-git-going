import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pin, PinOff, Search, Trash2, Plus, EyeOff, Eye, Sparkles, Package } from "lucide-react";
import { toast } from "sonner";
import { requireAnyRole } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useDebounce } from "@/hooks/use-debounce";
import {
  fetchProductRecommendations,
  fetchOverridesForProduct,
  createOverride,
  updateOverride,
  deleteOverride,
  searchProductsLite,
  REASON_LABEL_FA,
  STOCK_LABEL_FA,
  type ProductSearchResult,
  type RecommendationOverride,
} from "@/lib/products/recommendations";

export const Route = createFileRoute("/_app/pricing/product-recommendations")({
  beforeLoad: async () => {
    await requireAnyRole(["admin", "manager"]);
  },
  component: ProductRecommendationsAdminPage,
});

function ProductRecommendationsAdminPage() {
  const [sourceProduct, setSourceProduct] = useState<ProductSearchResult | null>(null);

  return (
    <div className="space-y-5">
      <PageHeader
        title="مدیریت پیشنهاد محصولات"
        description="پین کردن، حذف یا تغییر اولویت پیشنهادهای خودکار سیستم برای هر محصول."
      />

      <ProductPicker
        label="محصول مبدأ"
        onSelect={setSourceProduct}
        selected={sourceProduct}
      />

      {sourceProduct ? (
        <ManagePanel sourceProduct={sourceProduct} />
      ) : (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            یک محصول را برای مدیریت پیشنهادهایش جستجو و انتخاب کنید.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// =============================================================
// Product picker (debounced search)
// =============================================================

interface PickerProps {
  label: string;
  onSelect: (p: ProductSearchResult | null) => void;
  selected: ProductSearchResult | null;
  excludeId?: string;
  autoClose?: boolean;
}

function ProductPicker({ label, onSelect, selected, excludeId, autoClose }: PickerProps) {
  const [term, setTerm] = useState("");
  const debounced = useDebounce(term, 400);
  const [open, setOpen] = useState(false);

  const query = useQuery({
    enabled: debounced.trim().length >= 2,
    queryKey: ["product-search-lite", debounced],
    queryFn: () => searchProductsLite(debounced, 20),
    staleTime: 60_000,
  });

  const results = useMemo(
    () => (query.data ?? []).filter((p) => p.id !== excludeId),
    [query.data, excludeId],
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{label}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {selected && (
          <div className="flex items-center justify-between rounded-md border border-primary/30 bg-primary/5 p-2 text-sm">
            <div className="min-w-0">
              <div className="truncate font-medium">{selected.name}</div>
              <div className="text-[11px] text-muted-foreground">
                {selected.brand_name && <span>{selected.brand_name}</span>}
                {selected.category_name && <span> · {selected.category_name}</span>}
                {selected.sku && <span> · {selected.sku}</span>}
              </div>
            </div>
            <Button type="button" size="sm" variant="ghost" onClick={() => { onSelect(null); setOpen(true); }}>
              تغییر
            </Button>
          </div>
        )}

        {(!selected || open) && (
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="نام یا SKU محصول (حداقل ۲ کاراکتر)"
                className="pr-9"
                maxLength={120}
              />
            </div>
            <div className="max-h-72 overflow-y-auto rounded-md border border-border">
              {debounced.trim().length < 2 && (
                <p className="p-3 text-center text-xs text-muted-foreground">
                  حداقل ۲ کاراکتر وارد کنید.
                </p>
              )}
              {query.isLoading && (
                <div className="flex items-center justify-center p-3 text-xs text-muted-foreground">
                  <Loader2 className="ml-2 h-3 w-3 animate-spin" /> در حال جستجو…
                </div>
              )}
              {!query.isLoading && debounced.trim().length >= 2 && results.length === 0 && (
                <p className="p-3 text-center text-xs text-muted-foreground">محصولی یافت نشد.</p>
              )}
              <ul className="divide-y divide-border">
                {results.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-right text-sm hover:bg-muted/50"
                      onClick={() => {
                        onSelect(p);
                        setTerm("");
                        if (autoClose) setOpen(false);
                      }}
                    >
                      <div className="truncate font-medium">{p.name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {p.brand_name && <span>{p.brand_name}</span>}
                        {p.category_name && <span> · {p.category_name}</span>}
                        {p.sku && <span> · {p.sku}</span>}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// =============================================================
// Manage panel: auto-recs + overrides + add new
// =============================================================

function ManagePanel({ sourceProduct }: { sourceProduct: ProductSearchResult }) {
  const qc = useQueryClient();
  const productId = sourceProduct.id;

  const overridesQuery = useQuery({
    queryKey: ["recommendation-overrides", productId],
    queryFn: () => fetchOverridesForProduct(productId),
    staleTime: 30_000,
  });

  const recsQuery = useQuery({
    queryKey: ["product-recommendations", productId],
    queryFn: () => fetchProductRecommendations(productId),
    staleTime: 60_000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["recommendation-overrides", productId] });
    qc.invalidateQueries({ queryKey: ["product-recommendations", productId] });
  };

  const updateMut = useMutation({
    mutationFn: (vars: { id: string; patch: Parameters<typeof updateOverride>[1] }) =>
      updateOverride(vars.id, vars.patch),
    onSuccess: () => { invalidate(); toast.success("به‌روزرسانی شد."); },
    onError: (e: Error) => toast.error(e.message ?? "خطا در به‌روزرسانی"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteOverride(id),
    onSuccess: () => { invalidate(); toast.success("حذف شد."); },
    onError: (e: Error) => toast.error(e.message ?? "خطا در حذف"),
  });

  const createMut = useMutation({
    mutationFn: createOverride,
    onSuccess: () => { invalidate(); toast.success("override اضافه شد."); },
    onError: (e: Error) => toast.error(e.message ?? "خطا در ایجاد"),
  });

  return (
    <div className="space-y-5">
      {/* Current auto recommendations */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" />
            پیشنهادهای فعلی سیستم
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            خروجی فعلی موتور پیشنهاد برای این محصول. می‌توانید هر کدام را پین، غیرفعال یا حذف کنید.
          </p>
        </CardHeader>
        <CardContent>
          {recsQuery.isLoading ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="mr-2 text-sm">در حال بارگذاری…</span>
            </div>
          ) : (recsQuery.data ?? []).length === 0 ? (
            <p className="rounded-md bg-muted/40 p-3 text-center text-xs text-muted-foreground">
              فعلاً پیشنهاد خودکاری برای این محصول وجود ندارد.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {recsQuery.data!.map((rec) => {
                const ov = overridesQuery.data?.find((o) => o.recommended_product_id === rec.product_id);
                return (
                  <li key={rec.product_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Package className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="truncate text-sm font-medium">{rec.name}</span>
                        <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                          {REASON_LABEL_FA[rec.reason] ?? rec.reason}
                        </Badge>
                        <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
                          {STOCK_LABEL_FA[rec.stock_status] ?? rec.stock_status}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">
                          امتیاز {rec.recommendation_score.toFixed(2)}
                        </span>
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {rec.brand_name && <span>{rec.brand_name}</span>}
                        {rec.category_name && <span> · {rec.category_name}</span>}
                        {rec.sku && <span> · {rec.sku}</span>}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {ov ? (
                        <OverrideQuickActions
                          override={ov}
                          onUpdate={(patch) => updateMut.mutate({ id: ov.id, patch })}
                          onDelete={() => deleteMut.mutate(ov.id)}
                          busy={updateMut.isPending || deleteMut.isPending}
                        />
                      ) : (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={createMut.isPending}
                            onClick={() => createMut.mutate({
                              product_id: productId,
                              recommended_product_id: rec.product_id,
                              is_pinned: true,
                            })}
                          >
                            <Pin className="ms-1 h-3 w-3" /> پین
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={createMut.isPending}
                            onClick={() => createMut.mutate({
                              product_id: productId,
                              recommended_product_id: rec.product_id,
                              is_disabled: true,
                            })}
                          >
                            <EyeOff className="ms-1 h-3 w-3" /> حذف
                          </Button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Existing overrides */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">override های فعلی</CardTitle>
          <p className="text-xs text-muted-foreground">
            تنظیمات دستی شما برای این محصول. حذف override، رفتار را به حالت خودکار برمی‌گرداند.
          </p>
        </CardHeader>
        <CardContent>
          {overridesQuery.isLoading ? (
            <div className="flex items-center justify-center py-4 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : (overridesQuery.data ?? []).length === 0 ? (
            <p className="rounded-md bg-muted/40 p-3 text-center text-xs text-muted-foreground">
              تاکنون override دستی برای این محصول ثبت نشده است.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {overridesQuery.data!.map((ov) => (
                <OverrideRow
                  key={ov.id}
                  override={ov}
                  onUpdate={(patch) => updateMut.mutate({ id: ov.id, patch })}
                  onDelete={() => deleteMut.mutate(ov.id)}
                  busy={updateMut.isPending || deleteMut.isPending}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Add new override manually */}
      <ManualAddOverride
        sourceProductId={productId}
        existingRecIds={new Set((overridesQuery.data ?? []).map((o) => o.recommended_product_id))}
        onAdd={(recommendedId) => createMut.mutate({
          product_id: productId,
          recommended_product_id: recommendedId,
          is_pinned: true,
        })}
        busy={createMut.isPending}
      />
    </div>
  );
}

// =============================================================
// Override row
// =============================================================

function OverrideRow({
  override,
  onUpdate,
  onDelete,
  busy,
}: {
  override: RecommendationOverride;
  onUpdate: (patch: Parameters<typeof updateOverride>[1]) => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const [priorityInput, setPriorityInput] = useState(String(override.priority));
  const product = override.recommended_product;

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Package className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="truncate text-sm font-medium">{product?.name ?? override.recommended_product_id}</span>
          {override.is_pinned && <Badge className="h-4 px-1.5 text-[10px]">پین</Badge>}
          {override.is_disabled && (
            <Badge variant="destructive" className="h-4 px-1.5 text-[10px]">غیرفعال</Badge>
          )}
        </div>
        <div className="text-[11px] text-muted-foreground">
          {product?.brand?.name && <span>{product.brand.name}</span>}
          {product?.category?.name && <span> · {product.category.name}</span>}
          {product?.sku && <span> · {product.sku}</span>}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-muted-foreground">اولویت</span>
          <Input
            type="number"
            inputMode="numeric"
            className="h-8 w-20"
            value={priorityInput}
            onChange={(e) => setPriorityInput(e.target.value)}
            onBlur={() => {
              const n = Number(priorityInput);
              if (!Number.isFinite(n)) {
                setPriorityInput(String(override.priority));
                return;
              }
              if (n !== override.priority) onUpdate({ priority: n });
            }}
            min={-1000}
            max={1000}
            disabled={busy}
          />
        </div>
        <Button
          type="button"
          size="sm"
          variant={override.is_pinned ? "default" : "outline"}
          onClick={() => onUpdate({ is_pinned: !override.is_pinned })}
          disabled={busy}
        >
          {override.is_pinned ? <PinOff className="ms-1 h-3 w-3" /> : <Pin className="ms-1 h-3 w-3" />}
          {override.is_pinned ? "برداشتن پین" : "پین"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={override.is_disabled ? "default" : "outline"}
          onClick={() => onUpdate({ is_disabled: !override.is_disabled })}
          disabled={busy}
        >
          {override.is_disabled ? <Eye className="ms-1 h-3 w-3" /> : <EyeOff className="ms-1 h-3 w-3" />}
          {override.is_disabled ? "فعال‌سازی" : "غیرفعال"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-destructive hover:text-destructive"
          onClick={onDelete}
          disabled={busy}
        >
          <Trash2 className="ms-1 h-3 w-3" /> حذف
        </Button>
      </div>
    </li>
  );
}

// Compact actions for the auto-recommendations list
function OverrideQuickActions({
  override,
  onUpdate,
  onDelete,
  busy,
}: {
  override: RecommendationOverride;
  onUpdate: (patch: Parameters<typeof updateOverride>[1]) => void;
  onDelete: () => void;
  busy: boolean;
}) {
  return (
    <div className="flex items-center gap-1">
      {override.is_pinned && <Badge className="h-4 px-1.5 text-[10px]">پین</Badge>}
      {override.is_disabled && <Badge variant="destructive" className="h-4 px-1.5 text-[10px]">غیرفعال</Badge>}
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => onUpdate({ is_pinned: !override.is_pinned })}
        disabled={busy}
      >
        {override.is_pinned ? <PinOff className="ms-1 h-3 w-3" /> : <Pin className="ms-1 h-3 w-3" />}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="text-destructive hover:text-destructive"
        onClick={onDelete}
        disabled={busy}
      >
        <Trash2 className="h-3 w-3" />
      </Button>
    </div>
  );
}

// =============================================================
// Manual add
// =============================================================

function ManualAddOverride({
  sourceProductId,
  existingRecIds,
  onAdd,
  busy,
}: {
  sourceProductId: string;
  existingRecIds: Set<string>;
  onAdd: (recommendedId: string) => void;
  busy: boolean;
}) {
  const [picked, setPicked] = useState<ProductSearchResult | null>(null);

  const isDup = picked && existingRecIds.has(picked.id);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Plus className="h-4 w-4 text-primary" />
          افزودن پیشنهاد دستی
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          محصولی را انتخاب کنید تا به‌صورت دستی به پیشنهادها اضافه شود (پیش‌فرض: پین).
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <ProductPicker
          label="محصول پیشنهادی"
          onSelect={setPicked}
          selected={picked}
          excludeId={sourceProductId}
          autoClose
        />
        {isDup && (
          <p className="text-xs text-destructive">برای این محصول قبلاً override تعریف شده است.</p>
        )}
        <Separator />
        <div className="flex justify-end">
          <Button
            type="button"
            disabled={!picked || busy || !!isDup}
            onClick={() => {
              if (picked && !isDup) {
                onAdd(picked.id);
                setPicked(null);
              }
            }}
          >
            {busy && <Loader2 className="ms-1 h-3 w-3 animate-spin" />}
            افزودن به پیشنهادها
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}