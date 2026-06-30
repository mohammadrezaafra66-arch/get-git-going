import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Calculator,
  Save,
  Search,
  Loader2,
  AlertCircle,
  CheckCircle2,
  PackageX,
} from "lucide-react";
import { requirePermission } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useDebounce } from "@/hooks/use-debounce";
import { calculateSalePrice, PricingError, type PricingBreakdown } from "@/lib/pricing/engine";
import { fetchSalePriceTypes, fetchSettlementTypes, searchProducts } from "@/lib/pricing/queries";
import { CURRENCY_LABELS, MARGIN_TYPE_LABELS } from "@/lib/pricing/constants";
import { formatNumber, formatDateTimeFa } from "@/lib/i18n/formatters";

export const Route = createFileRoute("/_app/pricing/calculator")({
  beforeLoad: async () => {
    await requirePermission("pricing", "view");
  },
  component: CalculatorPage,
});

interface ProductLite {
  id: string;
  name: string;
  sku: string | null;
  product_type: string;
  stock_status: "available" | "limited" | "unavailable" | "unknown" | null;
}

function CalculatorPage() {
  const [productQuery, setProductQuery] = useState("");
  const debouncedQuery = useDebounce(productQuery, 350);
  const [showResults, setShowResults] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductLite | null>(null);
  const [salePriceTypeId, setSalePriceTypeId] = useState<string>("");
  const [settlementTypeId, setSettlementTypeId] = useState<string>("__none__");
  const [purchasePriceId, setPurchasePriceId] = useState<string>("__latest__");
  const [calculating, setCalculating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [breakdown, setBreakdown] = useState<PricingBreakdown | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const { data: salePriceTypes = [] } = useQuery({
    queryKey: ["sale-price-types-active"],
    queryFn: () => fetchSalePriceTypes(true),
    staleTime: 60_000,
  });
  const { data: settlementTypes = [] } = useQuery({
    queryKey: ["settlement-types"],
    queryFn: () => fetchSettlementTypes(true),
    staleTime: 60_000,
  });

  const { data: searchResults = [], isFetching: searching } = useQuery({
    queryKey: ["calc-product-search", debouncedQuery],
    queryFn: async () => {
      const list = await searchProducts(debouncedQuery, 10);
      if (!list.length) return list;
      const ids = list.map((p: any) => p.id);
      const { data } = await supabase.from("products").select("id, stock_status").in("id", ids);
      const map = new Map((data ?? []).map((r: any) => [r.id, r.stock_status]));
      return list.map((p: any) => ({ ...p, stock_status: map.get(p.id) ?? null }));
    },
    enabled: debouncedQuery.trim().length >= 2 && showResults,
    staleTime: 10_000,
  });

  const { data: productPurchases = [] } = useQuery({
    queryKey: ["calc-purchases", selectedProduct?.id],
    enabled: !!selectedProduct?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_prices")
        .select("id, purchase_price, currency, effective_at, supplier_id, is_active")
        .eq("product_id", selectedProduct!.id)
        .eq("is_active", true)
        .order("effective_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 10_000,
  });

  // اولین sale_price_type را پیش‌فرض انتخاب کن
  useEffect(() => {
    if (!salePriceTypeId && salePriceTypes.length > 0) {
      setSalePriceTypeId(salePriceTypes[0].id);
    }
  }, [salePriceTypes, salePriceTypeId]);

  function pickProduct(p: any) {
    setSelectedProduct({
      id: p.id,
      name: p.name,
      sku: p.sku,
      product_type: p.product_type,
      stock_status: p.stock_status ?? null,
    });
    setProductQuery(p.name);
    setShowResults(false);
    setBreakdown(null);
    setErrorMsg(null);
    setPurchasePriceId("__latest__");
    setSavedAt(null);
  }

  async function handleCalculate(forceSnapshot = false) {
    setErrorMsg(null);
    if (!selectedProduct) {
      setErrorMsg("لطفاً ابتدا یک محصول انتخاب کنید.");
      return;
    }
    if (!salePriceTypeId) {
      setErrorMsg("لطفاً نوع قیمت فروش را انتخاب کنید.");
      return;
    }
    if (forceSnapshot && selectedProduct.stock_status === "unavailable") {
      const msg = "برای محصول ناموجود امکان ثبت رسمی قیمت فروش وجود ندارد.";
      setErrorMsg(msg);
      toast.error(msg);
      return;
    }
    forceSnapshot ? setSaving(true) : setCalculating(true);
    try {
      const result = await calculateSalePrice({
        product_id: selectedProduct.id,
        sale_price_type_id: salePriceTypeId,
        settlement_type_id: settlementTypeId === "__none__" ? null : settlementTypeId,
        purchase_price_id: purchasePriceId === "__latest__" ? null : purchasePriceId,
        force_snapshot: forceSnapshot,
      });
      setBreakdown(result.breakdown);
      if (forceSnapshot) {
        setSavedAt(new Date().toISOString());
        toast.success(
          result.history_id
            ? "نتیجه محاسبه و تغییر قیمت ثبت شد."
            : "نتیجه محاسبه ثبت شد (قیمت تغییری نداشت).",
        );
      } else {
        toast.success("محاسبه با موفقیت انجام شد.");
      }
    } catch (e: any) {
      const msg = e instanceof PricingError ? e.message : (e?.message ?? "خطا در محاسبه قیمت.");
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setCalculating(false);
      setSaving(false);
    }
  }

  const settlementLabel = useMemo(() => {
    if (settlementTypeId === "__none__") return null;
    return settlementTypes.find((s) => s.id === settlementTypeId)?.title ?? null;
  }, [settlementTypeId, settlementTypes]);

  const salePriceTypeLabel = useMemo(() => {
    return salePriceTypes.find((t) => t.id === salePriceTypeId)?.title ?? "—";
  }, [salePriceTypeId, salePriceTypes]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="تست محاسبه قیمت"
        description="اجرای موتور قیمت‌گذاری و مشاهدهٔ تفکیک محاسبه. ثبت نتیجه باعث ایجاد snapshot و تاریخچه می‌شود."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* فرم */}
        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="space-y-2">
              <Label>انتخاب محصول</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={productQuery}
                  onChange={(e) => {
                    setProductQuery(e.target.value);
                    setShowResults(true);
                    setSelectedProduct(null);
                    setBreakdown(null);
                  }}
                  onFocus={() => setShowResults(true)}
                  placeholder="جستجو با نام یا SKU…"
                  className="pe-9"
                />
                {showResults && debouncedQuery.trim().length >= 2 && !selectedProduct && (
                  <div className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-md border border-border bg-popover shadow-md">
                    {searching ? (
                      <div className="flex items-center justify-center gap-2 p-3 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" /> در حال جستجو…
                      </div>
                    ) : searchResults.length === 0 ? (
                      <div className="p-3 text-sm text-muted-foreground">محصولی یافت نشد.</div>
                    ) : (
                      searchResults.map((p: any) => (
                        <button
                          type="button"
                          key={p.id}
                          onClick={() => pickProduct(p)}
                          className="flex w-full items-start justify-between gap-2 border-b border-border p-2 text-start text-sm last:border-0 hover:bg-muted"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-medium">{p.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {p.sku ?? "—"} · {p.product_type === "iranian" ? "ایرانی" : "خارجی"}
                            </div>
                          </div>
                          <StockBadge status={p.stock_status ?? null} />
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              {selectedProduct && (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 p-2 text-xs">
                    <span className="font-medium text-foreground">{selectedProduct.name}</span>
                    <span className="text-muted-foreground"> · {selectedProduct.sku ?? "—"}</span>
                    <StockBadge status={selectedProduct.stock_status} />
                  </div>
                  {selectedProduct.stock_status === "unavailable" && (
                    <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-400">
                      <PackageX className="mt-0.5 h-4 w-4 flex-shrink-0" />
                      <span>
                        این محصول ناموجود است و قیمت محاسبه‌شده قابل فروش نیست (فقط برای بررسی
                        داخلی).
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>نوع قیمت فروش</Label>
                <Select value={salePriceTypeId} onValueChange={setSalePriceTypeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="انتخاب کنید" />
                  </SelectTrigger>
                  <SelectContent>
                    {salePriceTypes.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>نوع تسویه (اختیاری)</Label>
                <Select value={settlementTypeId} onValueChange={setSettlementTypeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="بدون تسویه" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">بدون تسویه (فقط قوانین عمومی)</SelectItem>
                    {settlementTypes.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>قیمت خرید</Label>
              <Select
                value={purchasePriceId}
                onValueChange={setPurchasePriceId}
                disabled={!selectedProduct}
              >
                <SelectTrigger>
                  <SelectValue placeholder="آخرین قیمت خرید فعال" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__latest__">آخرین قیمت خرید فعال (پیش‌فرض)</SelectItem>
                  {productPurchases.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>
                      {formatNumber(Number(p.purchase_price))}{" "}
                      {CURRENCY_LABELS[p.currency as keyof typeof CURRENCY_LABELS]} —{" "}
                      {formatDateTimeFa(p.effective_at)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2 pt-2 sm:flex-row">
              <Button
                onClick={() => handleCalculate(false)}
                disabled={calculating || saving || !selectedProduct}
                className="flex-1"
              >
                {calculating ? (
                  <Loader2 className="ms-2 h-4 w-4 animate-spin" />
                ) : (
                  <Calculator className="ms-2 h-4 w-4" />
                )}
                محاسبه قیمت
              </Button>
              <Button
                onClick={() => handleCalculate(true)}
                disabled={calculating || saving || !selectedProduct}
                variant="secondary"
                className="flex-1"
              >
                {saving ? (
                  <Loader2 className="ms-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="ms-2 h-4 w-4" />
                )}
                ثبت نتیجه محاسبه
              </Button>
            </div>

            {errorMsg && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}
            {savedAt && !errorMsg && (
              <div className="flex items-start gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-2 text-sm text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>نتیجه در ساعت {formatDateTimeFa(savedAt)} ثبت شد.</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* خروجی */}
        <Card>
          <CardContent className="p-4">
            {!breakdown ? (
              <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                <Calculator className="h-10 w-10 opacity-50" />
                <p className="text-sm">
                  پس از انتخاب محصول و کلیک روی «محاسبه قیمت»، تفکیک محاسبه اینجا نمایش داده می‌شود.
                </p>
              </div>
            ) : (
              <div
                className={`space-y-4 ${selectedProduct?.stock_status === "unavailable" ? "opacity-90" : ""}`}
              >
                {selectedProduct?.stock_status === "unavailable" && (
                  <div className="flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-2 text-sm text-amber-700 dark:text-amber-400">
                    <PackageX className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    <span>
                      این محصول ناموجود است و قیمت نمایش‌داده‌شده قابل فروش نیست — صرفاً برای تحلیل
                      داخلی.
                    </span>
                  </div>
                )}
                <div>
                  <div className="text-xs text-muted-foreground">محصول</div>
                  <div className="font-semibold text-foreground">{breakdown.product_name}</div>
                  <div className="text-xs text-muted-foreground">
                    SKU: {breakdown.product_sku ?? "—"}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">{salePriceTypeLabel}</Badge>
                  {settlementLabel && <Badge variant="outline">{settlementLabel}</Badge>}
                  <Badge variant="outline">قانون: {breakdown.pricing_rule_name}</Badge>
                  <Badge variant="outline">{MARGIN_TYPE_LABELS[breakdown.margin_type]}</Badge>
                  <StockBadge status={selectedProduct?.stock_status ?? null} />
                </div>

                <div className="grid grid-cols-2 gap-2 rounded-md border border-border p-3 text-sm">
                  <Row
                    label="قیمت خرید"
                    value={`${formatNumber(breakdown.input_purchase_price)} ${CURRENCY_LABELS[breakdown.input_currency]}`}
                  />
                  <Row
                    label="نرخ ارز"
                    value={
                      <>
                        {formatNumber(breakdown.currency_rate)}
                        {breakdown.currency_rate_source && (
                          <span className="ms-1 text-xs text-muted-foreground">
                            — {breakdown.currency_rate_source}
                          </span>
                        )}
                      </>
                    }
                  />
                  <Row
                    label="قیمت خرید (تومان)"
                    value={`${formatNumber(breakdown.purchase_price_toman)} ت`}
                  />
                  <Row
                    label="هزینه حمل"
                    value={
                      breakdown.shipping_rule
                        ? `${formatNumber(breakdown.shipping_cost)} ت (${breakdown.shipping_rule.title})`
                        : `${formatNumber(breakdown.shipping_cost)} ت`
                    }
                  />
                  <Row
                    label="سود محاسبه‌شده"
                    value={`${formatNumber(breakdown.margin_amount)} ت`}
                  />
                  <Row
                    label="قیمت قبل از گرد کردن"
                    value={`${formatNumber(breakdown.final_sale_price)} ت`}
                  />
                </div>

                {selectedProduct?.stock_status === "unavailable" ? (
                  <div className="rounded-md border-2 border-dashed border-amber-500/60 bg-amber-500/5 p-3 text-center">
                    <div className="text-xs text-amber-700 dark:text-amber-400">
                      قیمت محاسبه‌شده (داخلی — غیرقابل فروش)
                    </div>
                    <div className="mt-1 text-2xl font-bold text-amber-700 line-through decoration-amber-500/70 dark:text-amber-400">
                      {formatNumber(breakdown.rounded_sale_price)}{" "}
                      <span className="text-base font-medium">تومان</span>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-md border-2 border-primary bg-primary/5 p-3 text-center">
                    <div className="text-xs text-muted-foreground">قیمت نهایی فروش (گرد شده)</div>
                    <div className="mt-1 text-2xl font-bold text-primary">
                      {formatNumber(breakdown.rounded_sale_price)}{" "}
                      <span className="text-base font-medium">تومان</span>
                    </div>
                  </div>
                )}

                <div className="space-y-1 rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
                  {breakdown.steps.map((s, i) => (
                    <div key={i}>• {s}</div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

function StockBadge({ status }: { status: ProductLite["stock_status"] }) {
  if (!status) return null;
  if (status === "available")
    return (
      <Badge
        variant="outline"
        className="border-emerald-500/50 text-emerald-700 dark:text-emerald-400"
      >
        موجود
      </Badge>
    );
  if (status === "limited")
    return (
      <Badge variant="outline" className="border-amber-500/50 text-amber-700 dark:text-amber-400">
        موجودی محدود
      </Badge>
    );
  if (status === "unavailable")
    return (
      <Badge variant="outline" className="border-destructive/60 text-destructive">
        ناموجود
      </Badge>
    );
  return <Badge variant="outline">نامشخص</Badge>;
}
