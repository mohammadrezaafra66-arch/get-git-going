import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Search, Save, Package, FileText, Sparkles } from "lucide-react";
import { ensureAuthReady } from "@/lib/auth/session";
import { hasAnyRole, type AppRole } from "@/lib/rbac/roles";
import { PageHeader } from "@/components/common/PageHeader";
import { PersianDatePicker } from "@/components/common/PersianDatePicker";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useDebounce } from "@/hooks/use-debounce";
import { useAuth } from "@/lib/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { safeRandomUUID } from "@/lib/utils/safe-uuid";
import { formatNumber } from "@/lib/i18n/formatters";
import { QuickAddCustomerDialog } from "@/shared/components/QuickAddCustomerDialog";
import { Badge } from "@/components/ui/badge";
import { STOCK_STATUS_LABELS, STOCK_STATUS_VARIANTS } from "@/lib/products/constants";
import { computeTotals, lineTotal, validateQuote, type DraftQuoteItem } from "@/lib/sales/quotes";
import { useProductThumbnails } from "@/hooks/products/useProductThumbnails";

export const ALLOWED_ROLES: AppRole[] = ["admin", "manager", "sales"];

export const Route = createFileRoute("/_app/sales/quotes/new")({
  beforeLoad: async () => {
    const auth = await ensureAuthReady();
    if (!auth.user) throw redirect({ to: "/login" });
    const roles = auth.roles as AppRole[];
    if (!hasAnyRole(roles, ALLOWED_ROLES)) throw redirect({ to: "/unauthorized" });
  },
  component: NewQuotePage,
});

function NewQuotePage() {
  const navigate = useNavigate();
  const { user, roles } = useAuth();
  const canEditPriceFreely = roles.includes("admin") || roles.includes("manager");

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [items, setItems] = useState<DraftQuoteItem[]>([]);

  const totals = useMemo(() => computeTotals(items), [items]);
  const debouncedCustomerSearch = useDebounce(customerSearch, 350);
  const customerSearchTerm = debouncedCustomerSearch.trim();

  const customersQuery = useQuery({
    enabled: customerSearchTerm.length >= 2,
    queryKey: ["sales-quote-customer-search", customerSearchTerm],
    queryFn: async () => {
      const safe = customerSearchTerm.replace(/[%_]/g, "");
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, phone")
        .or(`name.ilike.%${safe}%,phone.ilike.%${safe}%`)
        .order("name", { ascending: true })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string; phone: string | null }>;
    },
    staleTime: 30_000,
  });

  const selectCustomer = (customer: { name: string; phone: string | null }) => {
    setCustomerName(customer.name);
    setCustomerPhone(customer.phone ?? "");
    setCustomerSearch("");
  };

  // sale price types (cached)
  const { data: priceTypes = [] } = useQuery({
    queryKey: ["sale-price-types-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sale_price_types")
        .select("id, code, title")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 10 * 60_000,
  });

  // ----- product picker -----
  const [pickerOpen, setPickerOpen] = useState(false);

  const addItem = (it: DraftQuoteItem) => setItems((prev) => [...prev, it]);
  const updateItem = (key: string, patch: Partial<DraftQuoteItem>) =>
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  const removeItem = (key: string) => setItems((prev) => prev.filter((it) => it.key !== key));

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("کاربر معتبر نیست.");
      const errs = validateQuote(
        {
          customer_name: customerName,
          customer_phone: customerPhone,
          customer_note: customerNote,
          expires_at: expiresAt || null,
        },
        items,
      );
      if (errs.length > 0) {
        throw new Error(errs[0].message);
      }

      const itemsPayload = items.map((it) => ({
        product_id: it.product_id,
        free_item_name: it.free_item_name,
        sku_snapshot: it.sku_snapshot,
        title_snapshot: it.title_snapshot,
        sale_price_type_id: it.sale_price_type_id,
        quantity: it.quantity,
        unit_price: it.unit_price,
        discount_amount: it.discount_amount,
        line_total: lineTotal(it),
        source: it.source,
      }));

      // Atomic RPC: creates quote + items + audit in a single DB transaction.
      const { data, error } = await (
        supabase.rpc as unknown as (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: unknown; error: { message: string } | null }>
      )("create_sales_quote_with_items", {
        p_customer_name: customerName.trim(),
        p_customer_phone: customerPhone.trim(),
        p_customer_note: customerNote.trim() || null,
        p_expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
        p_subtotal_amount: totals.subtotal_amount,
        p_discount_amount: totals.discount_amount,
        p_final_amount: totals.final_amount,
        p_items: itemsPayload,
      });
      if (error) throw new Error(error.message);
      const result = data as { id: string; quote_number: string } | null;
      if (!result?.id) throw new Error("پاسخ نامعتبر از سرور.");
      return result;
    },
    onSuccess: (quote) => {
      toast.success(`پیش‌فاکتور ${quote.quote_number} با موفقیت ثبت شد.`, {
        description: "برای ارسال پیش‌فاکتور می‌توانید از دکمه «ارسال پیش‌فاکتور» استفاده کنید.",
      });
      navigate({ to: "/sales/quotes" });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "خطا در ثبت پیش‌فاکتور."),
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="پیش‌فاکتور جدید"
        description="ثبت پیش‌فاکتور داخلی فروش — این سند رسمی و مالیاتی نیست."
      />

      {/* header */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="flex-1 space-y-2">
              <Label htmlFor="existing_customer_search">انتخاب مشتری موجود</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="existing_customer_search"
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  placeholder="نام یا شماره تماس مشتری را جست‌وجو کنید..."
                  className="pr-9"
                />
              </div>
              {customerSearchTerm.length >= 2 &&
                (customersQuery.isLoading ? (
                  <div className="text-xs text-muted-foreground">در حال جست‌وجوی مشتری...</div>
                ) : (customersQuery.data ?? []).length === 0 ? (
                  <div className="text-xs text-muted-foreground">
                    مشتری‌ای با این جست‌وجو پیدا نشد.
                  </div>
                ) : (
                  <div className="max-h-52 overflow-y-auto rounded-md border border-border divide-y divide-border">
                    {(customersQuery.data ?? []).map((customer) => (
                      <button
                        key={customer.id}
                        type="button"
                        onClick={() => selectCustomer(customer)}
                        className="flex w-full items-center justify-between gap-3 p-2 text-right hover:bg-muted/40"
                      >
                        <span className="font-medium">{customer.name}</span>
                        {customer.phone && (
                          <span className="text-xs text-muted-foreground" dir="ltr">
                            {customer.phone}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                ))}
            </div>
            <div className="flex justify-end md:pt-7">
              <QuickAddCustomerDialog
                onCreated={(c) => {
                  setCustomerName(c.name);
                  setCustomerPhone(c.phone ?? "");
                  setCustomerSearch("");
                }}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="customer_name">نام مشتری *</Label>
              <Input
                id="customer_name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                maxLength={200}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="customer_phone">شماره تماس *</Label>
              <Input
                id="customer_phone"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                dir="ltr"
                placeholder="09xxxxxxxxx"
              />
            </div>
            <div className="space-y-1.5 md:col-span-1">
              <Label htmlFor="expires_at">تاریخ اعتبار</Label>
              <PersianDatePicker
                value={expiresAt || null}
                onChange={(v) => setExpiresAt(v ?? "")}
                placeholder="انتخاب تاریخ اعتبار"
              />
            </div>
            <div className="space-y-1.5 md:col-span-1">
              <Label htmlFor="customer_note">توضیحات مشتری</Label>
              <Textarea
                id="customer_note"
                value={customerNote}
                onChange={(e) => setCustomerNote(e.target.value)}
                maxLength={500}
                rows={2}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* items */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-medium">آیتم‌ها</div>
            <Button size="sm" onClick={() => setPickerOpen(true)}>
              <Plus className="ml-1 h-4 w-4" /> افزودن آیتم
            </Button>
          </div>

          {items.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              هنوز آیتمی اضافه نشده است.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th className="p-2 text-right font-medium">کالا</th>
                    <th className="p-2 text-right font-medium">منبع</th>
                    <th className="p-2 text-right font-medium">تعداد</th>
                    <th className="p-2 text-right font-medium">قیمت واحد</th>
                    <th className="p-2 text-right font-medium">تخفیف</th>
                    <th className="p-2 text-right font-medium">جمع</th>
                    <th className="p-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {items.map((it) => (
                    <tr key={it.key}>
                      <td className="p-2 align-top">
                        <div className="font-medium">{it.title_snapshot}</div>
                        {it.sku_snapshot && (
                          <div className="text-[11px] text-muted-foreground font-mono">
                            {it.sku_snapshot}
                          </div>
                        )}
                      </td>
                      <td className="p-2 align-top text-[11px] text-muted-foreground">
                        {it.source === "product_price"
                          ? "از قیمت محصول"
                          : it.source === "quick_price"
                            ? "محاسبه سریع"
                            : "آیتم آزاد"}
                      </td>
                      <td className="p-2 align-top">
                        <Input
                          type="number"
                          min={0}
                          className="w-24"
                          value={it.quantity}
                          onChange={(e) =>
                            updateItem(it.key, { quantity: Number(e.target.value) || 0 })
                          }
                        />
                      </td>
                      <td className="p-2 align-top">
                        <Input
                          type="number"
                          min={0}
                          className="w-32"
                          value={it.unit_price}
                          disabled={it.source === "product_price" && !canEditPriceFreely}
                          onChange={(e) =>
                            updateItem(it.key, { unit_price: Number(e.target.value) || 0 })
                          }
                        />
                      </td>
                      <td className="p-2 align-top">
                        <Input
                          type="number"
                          min={0}
                          className="w-28"
                          value={it.discount_amount}
                          onChange={(e) =>
                            updateItem(it.key, { discount_amount: Number(e.target.value) || 0 })
                          }
                        />
                      </td>
                      <td className="p-2 align-top font-medium">
                        {formatNumber(lineTotal(it))}{" "}
                        <span className="text-[11px] text-muted-foreground">تومان</span>
                      </td>
                      <td className="p-2 align-top">
                        <Button size="sm" variant="ghost" onClick={() => removeItem(it.key)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* totals + save */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-6">
                <span className="text-muted-foreground">جمع کل</span>
                <span>{formatNumber(totals.subtotal_amount)} تومان</span>
              </div>
              <div className="flex items-center justify-between gap-6">
                <span className="text-muted-foreground">مجموع تخفیف</span>
                <span>{formatNumber(totals.discount_amount)} تومان</span>
              </div>
              <div className="flex items-center justify-between gap-6 text-base font-semibold">
                <span>مبلغ نهایی</span>
                <span>{formatNumber(totals.final_amount)} تومان</span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => navigate({ to: "/sales/quotes" })}>
                انصراف
              </Button>
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || items.length === 0}
              >
                {saveMutation.isPending ? (
                  <Loader2 className="ml-1 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="ml-1 h-4 w-4" />
                )}
                ذخیره پیش‌نویس
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {pickerOpen && (
        <AddItemPanel
          priceTypes={priceTypes as Array<{ id: string; code: string; title: string }>}
          canEditPriceFreely={canEditPriceFreely}
          onClose={() => setPickerOpen(false)}
          onAdd={(it) => {
            addItem(it);
            setPickerOpen(false);
          }}
        />
      )}
    </div>
  );
}

/* ============================================================
   Add-Item panel (modal-like card)
   ============================================================ */
function AddItemPanel(props: {
  priceTypes: Array<{ id: string; code: string; title: string }>;
  canEditPriceFreely: boolean;
  onClose: () => void;
  onAdd: (it: DraftQuoteItem) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm">
      <Card className="m-4 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold">افزودن آیتم به پیش‌فاکتور</h3>
            <Button variant="ghost" size="sm" onClick={props.onClose}>
              بستن
            </Button>
          </div>
          <Tabs defaultValue="product">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="product">
                <Package className="ml-1 h-4 w-4" /> از محصول ثبت‌شده
              </TabsTrigger>
              <TabsTrigger value="manual">
                <FileText className="ml-1 h-4 w-4" /> آیتم آزاد
              </TabsTrigger>
              <TabsTrigger value="quick">
                <Sparkles className="ml-1 h-4 w-4" /> از محاسبه سریع
              </TabsTrigger>
            </TabsList>

            <TabsContent value="product" className="pt-3">
              <ProductTab priceTypes={props.priceTypes} onAdd={props.onAdd} />
            </TabsContent>
            <TabsContent value="manual" className="pt-3">
              <FreeItemTab source="manual" onAdd={props.onAdd} />
            </TabsContent>
            <TabsContent value="quick" className="pt-3">
              <FreeItemTab
                source="quick_price"
                onAdd={props.onAdd}
                hint="نتیجه ابزار «محاسبه سریع قیمت» را به‌عنوان آیتم آزاد وارد کنید."
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

/* ---- Product tab ---- */
function ProductTab(props: {
  priceTypes: Array<{ id: string; code: string; title: string }>;
  onAdd: (it: DraftQuoteItem) => void;
}) {
  const [search, setSearch] = useState("");
  const dSearch = useDebounce(search, 350);
  const [selected, setSelected] = useState<{ id: string; name: string; sku: string | null } | null>(
    null,
  );
  const [salePriceTypeId, setSalePriceTypeId] = useState<string>("");
  const [quantity, setQuantity] = useState<number>(1);
  const [unitPrice, setUnitPrice] = useState<number>(0);
  const [discount, setDiscount] = useState<number>(0);
  const [priceMissing, setPriceMissing] = useState<string | null>(null);

  const term = dSearch.trim();
  const productsQuery = useQuery({
    enabled: term.length >= 2 && !selected,
    queryKey: ["quote-product-search", term],
    queryFn: async () => {
      const safe = term.replace(/[%_]/g, "");
      const { data, error } = await supabase.rpc("search_product_ids", {
        p_term: safe,
        p_limit: 20,
      });
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        name: string;
        sku: string | null;
        barcode: string | null;
        stock_status: "available" | "unavailable" | "limited" | "unknown";
        is_active: boolean;
      }>;
    },
    staleTime: 30_000,
  });

  // Fetch all sale prices (per price type) for products currently in the search result list,
  // so the user can see every price (نقدی، اعتباری، اقساطی، …) alongside each product and
  // pick one directly from the list — not just the cash price.
  const productIds = useMemo(
    () => (productsQuery.data ?? []).map((p: { id: string }) => p.id),
    [productsQuery.data],
  );
  const { thumbnailFor } = useProductThumbnails(productIds);
  const pricesByProductQuery = useQuery({
    enabled: productIds.length > 0,
    queryKey: ["quote-product-search-prices", productIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_computed_prices_public")
        .select("product_id, sale_price_type_id, final_sale_price, rounded_sale_price, computed_at")
        .in("product_id", productIds);
      if (error) throw error;
      const map = new Map<string, Array<{ sale_price_type_id: string; price: number }>>();
      for (const row of (data ?? []) as Array<{
        product_id: string | null;
        sale_price_type_id: string | null;
        final_sale_price: number | null;
        rounded_sale_price: number | null;
      }>) {
        if (!row.product_id || !row.sale_price_type_id) continue;
        const price = Number(row.rounded_sale_price ?? row.final_sale_price ?? 0);
        if (!(price > 0)) continue;
        const list = map.get(row.product_id) ?? [];
        list.push({ sale_price_type_id: row.sale_price_type_id, price });
        map.set(row.product_id, list);
      }
      return map;
    },
    staleTime: 30_000,
  });

  // load latest sale price when product + price type are selected
  useEffect(() => {
    let cancelled = false;
    setPriceMissing(null);
    if (!selected || !salePriceTypeId) return;
    // If the price is already known from the search list, skip the extra query.
    const cached = pricesByProductQuery.data
      ?.get(selected.id)
      ?.find((p) => p.sale_price_type_id === salePriceTypeId);
    if (cached) {
      setUnitPrice(cached.price);
      setPriceMissing(null);
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from("product_sale_price_history")
        .select("new_sale_price, created_at")
        .eq("product_id", selected.id)
        .eq("sale_price_type_id", salePriceTypeId)
        .order("created_at", { ascending: false })
        .limit(1);
      if (cancelled) return;
      if (error) {
        setPriceMissing("خطا در دریافت قیمت فروش.");
        return;
      }
      if (!data || data.length === 0) {
        setUnitPrice(0);
        setPriceMissing("برای این محصول و نوع قیمت، قیمت فروش ثبت نشده است.");
      } else {
        setUnitPrice(Number(data[0].new_sale_price) || 0);
        setPriceMissing(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selected, salePriceTypeId, pricesByProductQuery.data]);

  const canSubmit = !!selected && !!salePriceTypeId && quantity > 0 && unitPrice > 0;
  const priceTypeTitle = (id: string) => props.priceTypes.find((t) => t.id === id)?.title ?? "—";

  return (
    <div className="space-y-3">
      {!selected ? (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="جستجوی نام محصول، SKU یا بارکد (حداقل ۲ حرف)"
              className="pr-9"
            />
          </div>
          {term.length >= 2 &&
            (productsQuery.isLoading ? (
              <div className="text-xs text-muted-foreground">در حال جستجو...</div>
            ) : (productsQuery.data ?? []).length === 0 ? (
              <div className="text-xs text-muted-foreground">محصولی پیدا نشد.</div>
            ) : (
              <div className="max-h-80 overflow-y-auto rounded-md border border-border divide-y divide-border">
                {(productsQuery.data ?? []).map(
                  (p: {
                    id: string;
                    name: string;
                    sku: string | null;
                    barcode?: string | null;
                    stock_status: "available" | "unavailable" | "limited" | "unknown";
                    labels?: Array<{
                      label:
                        | { id: string; title: string; color: string | null; visibility?: string | null }
                        | Array<{ id: string; title: string; color: string | null; visibility?: string | null }>
                        | null;
                    }>;
                  }) => {
                    const prices = pricesByProductQuery.data?.get(p.id) ?? [];
                    const thumb = thumbnailFor(p.id);
                    const labelList = (p.labels ?? [])
                      .map((row) => (Array.isArray(row.label) ? row.label[0] : row.label))
                      .filter(
                        (l): l is { id: string; title: string; color: string | null; visibility?: string | null } =>
                          !!l,
                      );
                    return (
                      <div key={p.id} className="p-2 space-y-2 hover:bg-muted/40">
                        <button
                          type="button"
                          onClick={() => setSelected({ id: p.id, name: p.name, sku: p.sku })}
                          className="flex w-full items-start justify-between gap-2 text-right"
                        >
                          <div className="flex min-w-0 items-start gap-2">
                            {thumb ? (
                              <img
                                src={thumb}
                                alt={p.name}
                                loading="lazy"
                                className="h-10 w-10 flex-shrink-0 rounded-md border border-border object-cover bg-muted"
                              />
                            ) : (
                              <div className="h-10 w-10 flex-shrink-0 rounded-md border border-dashed border-border bg-muted/40" />
                            )}
                            <div className="min-w-0">
                              <div className="font-bold truncate">{p.name}</div>
                              <div className="flex flex-wrap items-center gap-2 mt-0.5">
                                <span
                                  className="text-[11px] text-muted-foreground font-mono"
                                  dir="ltr"
                                >
                                  {p.sku ?? "—"}
                                </span>
                                {p.barcode && (
                                  <span
                                    className="text-[11px] text-muted-foreground font-mono"
                                    dir="ltr"
                                    title="بارکد"
                                  >
                                    {p.barcode}
                                  </span>
                                )}
                                <Badge
                                  variant={STOCK_STATUS_VARIANTS[p.stock_status]}
                                  className="text-[10px] py-0 px-1.5"
                                >
                                  {STOCK_STATUS_LABELS[p.stock_status]}
                                </Badge>
                              </div>
                              {labelList.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {labelList.slice(0, 4).map((l) => (
                                    <span
                                      key={l.id}
                                      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]"
                                      style={
                                        l.color ? { borderColor: l.color, color: l.color } : undefined
                                      }
                                    >
                                      <span
                                        className="inline-block h-2 w-2 rounded-full"
                                        style={l.color ? { backgroundColor: l.color } : undefined}
                                      />
                                      {l.title}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </button>
                        {prices.length === 0 ? (
                          <div className="text-[11px] text-muted-foreground">
                            {pricesByProductQuery.isLoading
                              ? "در حال دریافت قیمت‌ها..."
                              : "قیمت فروش ثبت‌شده‌ای ندارد."}
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {prices.map((pr) => (
                              <button
                                key={`${p.id}:${pr.sale_price_type_id}`}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelected({ id: p.id, name: p.name, sku: p.sku });
                                  setSalePriceTypeId(pr.sale_price_type_id);
                                  setUnitPrice(pr.price);
                                  setPriceMissing(null);
                                }}
                                className="rounded-md border border-border bg-card px-2 py-1 text-[11px] hover:border-primary hover:bg-primary/10"
                                title="انتخاب این نوع قیمت"
                              >
                                <span className="text-muted-foreground">
                                  {priceTypeTitle(pr.sale_price_type_id)}:{" "}
                                </span>
                                <span className="font-medium">{formatNumber(pr.price)}</span>
                                <span className="mr-1 text-[10px] text-muted-foreground">
                                  تومان
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  },
                )}
              </div>
            ))}
        </>
      ) : (
        <>
          <div className="rounded-md border border-border p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium truncate">{selected.name}</div>
                <div className="text-[11px] text-muted-foreground font-mono">
                  {selected.sku ?? "—"}
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setSelected(null);
                  setSalePriceTypeId("");
                  setUnitPrice(0);
                  setPriceMissing(null);
                }}
              >
                تغییر محصول
              </Button>
            </div>
            {(() => {
              const prices = pricesByProductQuery.data?.get(selected.id) ?? [];
              if (prices.length === 0) return null;
              return (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {prices.map((pr) => {
                    const active = pr.sale_price_type_id === salePriceTypeId;
                    return (
                      <button
                        key={pr.sale_price_type_id}
                        type="button"
                        onClick={() => {
                          setSalePriceTypeId(pr.sale_price_type_id);
                          setUnitPrice(pr.price);
                          setPriceMissing(null);
                        }}
                        className={`rounded-md border px-2 py-1 text-[11px] transition-colors ${
                          active
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-card hover:border-primary hover:bg-primary/10"
                        }`}
                      >
                        <span className="text-muted-foreground">
                          {priceTypeTitle(pr.sale_price_type_id)}:{" "}
                        </span>
                        <span className="font-medium">{formatNumber(pr.price)}</span>
                        <span className="mr-1 text-[10px] text-muted-foreground">تومان</span>
                      </button>
                    );
                  })}
                </div>
              );
            })()}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>نوع قیمت فروش</Label>
              <Select value={salePriceTypeId} onValueChange={setSalePriceTypeId}>
                <SelectTrigger>
                  <SelectValue placeholder="انتخاب نوع قیمت" />
                </SelectTrigger>
                <SelectContent>
                  {props.priceTypes.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>تعداد</Label>
              <Input
                type="number"
                min={0}
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>قیمت واحد (تومان)</Label>
              <Input
                type="number"
                min={0}
                value={unitPrice}
                onChange={(e) => setUnitPrice(Number(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>تخفیف خط (تومان)</Label>
              <Input
                type="number"
                min={0}
                value={discount}
                onChange={(e) => setDiscount(Number(e.target.value) || 0)}
              />
            </div>
          </div>
          {priceMissing && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
              {priceMissing}
            </div>
          )}
          <div className="flex justify-end">
            <Button
              disabled={!canSubmit}
              onClick={() => {
                if (!selected || !salePriceTypeId) return;
                props.onAdd({
                  key: safeRandomUUID(),
                  source: "product_price",
                  product_id: selected.id,
                  free_item_name: null,
                  sku_snapshot: selected.sku,
                  title_snapshot: selected.name,
                  sale_price_type_id: salePriceTypeId,
                  quantity,
                  unit_price: unitPrice,
                  discount_amount: discount,
                });
              }}
            >
              افزودن به پیش‌فاکتور
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/* ---- Free / Quick item tab ---- */
function FreeItemTab(props: {
  source: "manual" | "quick_price";
  onAdd: (it: DraftQuoteItem) => void;
  hint?: string;
}) {
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState<number>(1);
  const [unitPrice, setUnitPrice] = useState<number>(0);
  const [discount, setDiscount] = useState<number>(0);
  const canSubmit = name.trim().length > 0 && quantity > 0 && unitPrice > 0;

  return (
    <div className="space-y-3">
      {props.hint && (
        <div className="rounded-md border border-border bg-muted/30 p-2 text-xs text-muted-foreground">
          {props.hint}
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label>نام کالا *</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
        </div>
        <div className="space-y-1.5">
          <Label>تعداد</Label>
          <Input
            type="number"
            min={0}
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value) || 0)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>قیمت واحد (تومان)</Label>
          <Input
            type="number"
            min={0}
            value={unitPrice}
            onChange={(e) => setUnitPrice(Number(e.target.value) || 0)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>تخفیف خط (تومان)</Label>
          <Input
            type="number"
            min={0}
            value={discount}
            onChange={(e) => setDiscount(Number(e.target.value) || 0)}
          />
        </div>
      </div>
      <div className="flex justify-end">
        <Button
          disabled={!canSubmit}
          onClick={() => {
            props.onAdd({
              key: safeRandomUUID(),
              source: props.source,
              product_id: null,
              free_item_name: name.trim(),
              sku_snapshot: null,
              title_snapshot: name.trim(),
              sale_price_type_id: null,
              quantity,
              unit_price: unitPrice,
              discount_amount: discount,
            });
          }}
        >
          افزودن به پیش‌فاکتور
        </Button>
      </div>
    </div>
  );
}
