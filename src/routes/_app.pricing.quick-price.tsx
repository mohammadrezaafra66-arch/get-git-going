import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Calculator, Loader2, AlertCircle, Copy, CheckCircle2 } from "lucide-react";
import { requireAnyRole } from "@/lib/rbac/route-guards";
import type { AppRole } from "@/lib/rbac/roles";
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
import { useAuth } from "@/lib/auth/AuthProvider";
import { fetchSalePriceTypes, fetchSettlementTypes } from "@/lib/pricing/queries";
import { CURRENCY_LABELS, MARGIN_TYPE_LABELS, type CurrencyCode } from "@/lib/pricing/constants";
import { calculateQuickSalePrice, type QuickPriceBreakdown } from "@/lib/pricing/quick-price";
import { PricingError } from "@/lib/pricing/engine";
import { formatNumber } from "@/lib/i18n/formatters";

export const ALLOWED_ROLES: AppRole[] = ["admin", "manager", "accountant", "sales"];

export const Route = createFileRoute("/_app/pricing/quick-price")({
  beforeLoad: async () => {
    // Phase 6.7 — same SSR redirect bug as /sales/quotes/new.
    await requireAnyRole(ALLOWED_ROLES);
  },
  component: QuickPricePage,
});

function QuickPricePage() {
  const { roles } = useAuth();
  const isPrivileged =
    roles.includes("admin") || roles.includes("manager") || roles.includes("accountant");

  const [productName, setProductName] = useState("");
  const [purchasePrice, setPurchasePrice] = useState<string>("");
  const [currency, setCurrency] = useState<CurrencyCode>("toman");
  const [productType, setProductType] = useState<"iranian" | "foreign">("iranian");
  const [categoryId, setCategoryId] = useState<string>("__none__");
  const [salePriceTypeId, setSalePriceTypeId] = useState<string>("");
  const [settlementTypeId, setSettlementTypeId] = useState<string>("__none__");
  const [manualShipping, setManualShipping] = useState<string>("");

  const [calculating, setCalculating] = useState(false);
  const [breakdown, setBreakdown] = useState<QuickPriceBreakdown | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { data: salePriceTypes = [] } = useQuery({
    queryKey: ["sale-price-types-active"],
    queryFn: () => fetchSalePriceTypes(true),
    staleTime: 5 * 60_000,
  });
  const { data: settlementTypes = [] } = useQuery({
    queryKey: ["settlement-types"],
    queryFn: () => fetchSettlementTypes(true),
    staleTime: 5 * 60_000,
  });
  const { data: categories = [] } = useQuery({
    queryKey: ["categories-lite-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name, is_active")
        .eq("is_active", true)
        .order("name", { ascending: true })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (!salePriceTypeId && salePriceTypes.length > 0) {
      setSalePriceTypeId((salePriceTypes[0] as { id: string }).id);
    }
  }, [salePriceTypes, salePriceTypeId]);

  const salePriceTypeLabel = useMemo(
    () =>
      salePriceTypes.find((t: { id: string; title: string }) => t.id === salePriceTypeId)?.title ??
      "—",
    [salePriceTypeId, salePriceTypes],
  );
  const settlementLabel = useMemo(() => {
    if (settlementTypeId === "__none__") return null;
    return (
      settlementTypes.find((s: { id: string; title: string }) => s.id === settlementTypeId)
        ?.title ?? null
    );
  }, [settlementTypeId, settlementTypes]);
  const categoryLabel = useMemo(() => {
    if (categoryId === "__none__") return null;
    return (
      (categories as Array<{ id: string; name: string }>).find((c) => c.id === categoryId)?.name ??
      null
    );
  }, [categoryId, categories]);

  async function handleCalculate() {
    setErrorMsg(null);
    setBreakdown(null);

    const priceNum = Number(purchasePrice);
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      setErrorMsg("قیمت خرید باید عددی بزرگ‌تر از صفر باشد.");
      return;
    }
    if (!salePriceTypeId) {
      setErrorMsg("لطفاً نوع قیمت فروش را انتخاب کنید.");
      return;
    }
    if (productName.trim().length > 200) {
      setErrorMsg("نام کالا حداکثر ۲۰۰ کاراکتر می‌تواند باشد.");
      return;
    }
    let manualShipNum: number | null = null;
    if (manualShipping.trim() !== "") {
      const n = Number(manualShipping);
      if (!Number.isFinite(n) || n < 0) {
        setErrorMsg("هزینه حمل دستی باید عدد مثبت یا صفر باشد.");
        return;
      }
      manualShipNum = n;
    }

    setCalculating(true);
    try {
      const result = await calculateQuickSalePrice({
        product_name: productName.trim() || null,
        purchase_price: priceNum,
        currency,
        product_type: productType,
        category_id: categoryId === "__none__" ? null : categoryId,
        sale_price_type_id: salePriceTypeId,
        settlement_type_id: settlementTypeId === "__none__" ? null : settlementTypeId,
        manual_shipping_cost: manualShipNum,
      });
      setBreakdown(result);
      toast.success("محاسبه با موفقیت انجام شد.");
    } catch (e: any) {
      const msg = e instanceof PricingError ? e.message : (e?.message ?? "خطا در محاسبه قیمت.");
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setCalculating(false);
    }
  }

  async function handleCopy() {
    if (!breakdown) return;
    const lines = [
      "محاسبه قیمت سریع:",
      `کالا: ${breakdown.product_name ?? "—"}`,
      `قیمت خرید: ${formatNumber(breakdown.input_purchase_price)} ${CURRENCY_LABELS[breakdown.input_currency]}`,
      `نرخ ارز: ${formatNumber(breakdown.currency_rate)}`,
      `هزینه حمل: ${formatNumber(breakdown.shipping_cost)} تومان`,
      `سود: ${formatNumber(breakdown.margin_amount)} تومان`,
      `قیمت نهایی پیشنهادی: ${formatNumber(breakdown.rounded_sale_price)} تومان`,
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      toast.success("نتیجه در کلیپ‌بورد کپی شد.");
    } catch {
      toast.error("کپی در این مرورگر پشتیبانی نمی‌شود.");
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="محاسبه سریع قیمت"
        description="محاسبه قیمت فروش پیشنهادی برای کالای خارج از لیست محصولات. این ابزار فقط برای پاسخ سریع به مشتری است و قیمت رسمی ثبت نمی‌کند."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* فرم */}
        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="space-y-2">
              <Label>نام کالا (اختیاری)</Label>
              <Input
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="مثلاً پنکه ایستاده ..."
                maxLength={200}
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>قیمت خرید *</Label>
                <Input
                  inputMode="decimal"
                  value={purchasePrice}
                  onChange={(e) => setPurchasePrice(e.target.value.replace(/[^\d.]/g, ""))}
                  placeholder="مثلاً 1500000"
                />
              </div>
              <div className="space-y-2">
                <Label>ارز قیمت خرید *</Label>
                <Select value={currency} onValueChange={(v) => setCurrency(v as CurrencyCode)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="toman">تومان</SelectItem>
                    <SelectItem value="usd">دلار</SelectItem>
                    <SelectItem value="aed">درهم</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>نوع کالا *</Label>
                <Select
                  value={productType}
                  onValueChange={(v) => setProductType(v as "iranian" | "foreign")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="iranian">ایرانی</SelectItem>
                    <SelectItem value="foreign">خارجی</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>دسته‌بندی (اختیاری)</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger>
                    <SelectValue placeholder="بدون دسته" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">بدون دسته‌بندی</SelectItem>
                    {(categories as Array<{ id: string; name: string }>).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>نوع قیمت فروش *</Label>
                <Select value={salePriceTypeId} onValueChange={setSalePriceTypeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="انتخاب کنید" />
                  </SelectTrigger>
                  <SelectContent>
                    {(salePriceTypes as Array<{ id: string; title: string }>).map((t) => (
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
                    <SelectItem value="__none__">بدون تسویه</SelectItem>
                    {(settlementTypes as Array<{ id: string; title: string }>).map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>هزینه حمل دستی (اختیاری، تومان)</Label>
              <Input
                inputMode="numeric"
                value={manualShipping}
                onChange={(e) => setManualShipping(e.target.value.replace(/[^\d]/g, ""))}
                placeholder="در صورت خالی بودن، از قوانین حمل استفاده می‌شود"
              />
            </div>

            <Button onClick={handleCalculate} disabled={calculating} className="w-full">
              {calculating ? (
                <Loader2 className="ms-2 h-4 w-4 animate-spin" />
              ) : (
                <Calculator className="ms-2 h-4 w-4" />
              )}
              محاسبه قیمت
            </Button>

            {errorMsg && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* نتیجه */}
        <Card>
          <CardContent className="p-4">
            {calculating ? (
              <div className="flex h-full min-h-[280px] items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="ms-2 h-4 w-4 animate-spin" /> در حال محاسبه قیمت...
              </div>
            ) : !breakdown ? (
              <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                <Calculator className="h-10 w-10 opacity-50" />
                <p className="text-sm">اطلاعات را وارد کنید و روی محاسبه بزنید.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <div className="text-xs text-muted-foreground">کالا</div>
                  <div className="font-semibold text-foreground">
                    {breakdown.product_name ?? "—"}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">{salePriceTypeLabel}</Badge>
                  {settlementLabel && <Badge variant="outline">{settlementLabel}</Badge>}
                  <Badge variant="outline">
                    {breakdown.product_type === "iranian" ? "ایرانی" : "خارجی"}
                  </Badge>
                  {categoryLabel && <Badge variant="outline">دسته: {categoryLabel}</Badge>}
                  {isPrivileged && (
                    <>
                      <Badge variant="outline">قانون: {breakdown.pricing_rule_name}</Badge>
                      <Badge variant="outline">{MARGIN_TYPE_LABELS[breakdown.margin_type]}</Badge>
                    </>
                  )}
                </div>

                {isPrivileged && (
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
                        breakdown.shipping_is_manual
                          ? `${formatNumber(breakdown.shipping_cost)} ت (دستی)`
                          : breakdown.shipping_rule
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
                )}

                <div className="rounded-md border-2 border-primary bg-primary/5 p-4 text-center">
                  <div className="text-xs text-muted-foreground">
                    قیمت نهایی فروش پیشنهادی (گرد شده)
                  </div>
                  <div className="mt-1 text-3xl font-bold text-primary">
                    {formatNumber(breakdown.rounded_sale_price)}{" "}
                    <span className="text-base font-medium">تومان</span>
                  </div>
                </div>

                <div className="space-y-1 rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
                  {breakdown.steps.map((s, i) => (
                    <div key={i}>• {s}</div>
                  ))}
                </div>

                <Button onClick={handleCopy} variant="secondary" className="w-full">
                  <Copy className="ms-2 h-4 w-4" /> کپی نتیجه
                </Button>

                <div className="flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2 text-xs text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                  <span>
                    این نتیجه فقط محاسبه موقت است و در سیستم به‌عنوان قیمت رسمی ثبت نشده است.
                  </span>
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
