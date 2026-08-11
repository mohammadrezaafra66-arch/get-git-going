import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus,
  ArrowRight,
  Loader2,
  Check,
  Power,
  ChevronRight,
  ChevronLeft,
  Search,
  X,
  Pencil,
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
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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
import { useDebounce } from "@/hooks/use-debounce";
import { CURRENCY_LABELS, type CurrencyCode } from "@/lib/pricing/constants";
import { purchasePriceSchema, type PurchasePriceFormValues } from "@/lib/pricing/schemas";
import {
  fetchChangeReasons,
  fetchSuppliersLite,
  searchProducts,
  fetchProductLite,
} from "@/lib/pricing/queries";
import { fetchBrandsLite, fetchCategoriesLite } from "@/lib/products/queries";
import { formatNumber, formatDateTimeFa } from "@/lib/i18n/formatters";
import { JalaliDateInput } from "@/shared/components/JalaliDateInput";

export const Route = createFileRoute("/_app/pricing/purchase-prices")({
  beforeLoad: async () => {
    await requirePermission("pricing", "create");
  },
  component: PurchasePricesPage,
});

const PAGE_SIZE = 20;

function toIsoDate(date: Date): string {
  const yyyy = date.getFullYear().toString().padStart(4, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function todayIsoDate(): string {
  return toIsoDate(new Date());
}

function addMonthsIsoDate(iso: string, months: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  d.setMonth(d.getMonth() + months);
  return toIsoDate(d);
}

function toDateOnly(value: string | null | undefined): string {
  return value ? String(value).slice(0, 10) : "";
}

function dateStartIso(iso: string): string {
  return `${iso}T00:00:00`;
}

function dateEndIso(iso: string): string {
  return `${iso}T23:59:59`;
}

type Filters = {
  productId: string | null;
  productLabel: string | null;
  currency: "all" | CurrencyCode;
  brandId: string;
  categoryId: string;
  registeredBy: string;
  status: "all" | "active" | "inactive";
};

const DEFAULT_FILTERS: Filters = {
  productId: null,
  productLabel: null,
  currency: "all",
  brandId: "all",
  categoryId: "all",
  registeredBy: "all",
  status: "all",
};

function PurchasePricesPage() {
  const { roles } = useAuth();
  const canWrite = hasAnyRole(roles, ["admin", "manager", "accountant"]);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<any | null>(null);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [page, setPage] = useState(0);

  const brandsQ = useQuery({
    queryKey: ["brands-lite"],
    queryFn: fetchBrandsLite,
    staleTime: 60_000,
  });
  const categoriesQ = useQuery({
    queryKey: ["categories-lite"],
    queryFn: fetchCategoriesLite,
    staleTime: 60_000,
  });

  // محصولات مرتبط با brand/category انتخاب‌شده برای فیلتر تاریخچه
  const filteredProductIdsQ = useQuery({
    queryKey: ["products-by-brand-cat", filters.brandId, filters.categoryId],
    enabled: filters.brandId !== "all" || filters.categoryId !== "all",
    queryFn: async () => {
      let q = supabase.from("products").select("id").limit(1000);
      if (filters.brandId !== "all") q = q.eq("brand_id", filters.brandId);
      if (filters.categoryId !== "all") q = q.eq("category_id", filters.categoryId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((r) => r.id);
    },
  });

  const listQ = useQuery({
    queryKey: ["purchase-prices", "list", filters, page, filteredProductIdsQ.data ?? null],
    queryFn: async () => {
      let q = supabase
        .from("purchase_prices")
        .select(
          "id, product_id, supplier_id, purchase_price, currency, effective_at, expires_at, is_active, registered_by, reason_id, private_note, created_at",
          { count: "exact" },
        )
        .order("effective_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      if (filters.productId) q = q.eq("product_id", filters.productId);
      if (filters.currency !== "all") q = q.eq("currency", filters.currency);
      if (filters.status === "active") q = q.eq("is_active", true);
      if (filters.status === "inactive") q = q.eq("is_active", false);
      if (filters.registeredBy !== "all") q = q.eq("registered_by", filters.registeredBy);

      if ((filters.brandId !== "all" || filters.categoryId !== "all") && !filters.productId) {
        const ids = filteredProductIdsQ.data ?? [];
        if (ids.length === 0)
          return {
            rows: [],
            total: 0,
            productMap: {},
            supplierMap: {},
            reasonMap: {},
            registrarMap: {},
          };
        q = q.in("product_id", ids);
      }

      const { data, error, count } = await q;
      if (error) throw error;
      const rows = data ?? [];

      const productIds = Array.from(new Set(rows.map((r) => r.product_id)));
      const supplierIds = Array.from(
        new Set(rows.map((r) => r.supplier_id).filter(Boolean) as string[]),
      );
      const reasonIds = Array.from(
        new Set(rows.map((r) => r.reason_id).filter(Boolean) as string[]),
      );
      const registrarIds = Array.from(
        new Set(rows.map((r) => r.registered_by).filter(Boolean) as string[]),
      );

      const [products, suppliers, reasons, registrars] = await Promise.all([
        productIds.length
          ? supabase.from("products").select("id, name, sku").in("id", productIds)
          : Promise.resolve({ data: [] as any[] }),
        supplierIds.length
          ? supabase.from("suppliers").select("id, name").in("id", supplierIds)
          : Promise.resolve({ data: [] as any[] }),
        reasonIds.length
          ? supabase.from("price_change_reasons").select("id, title").in("id", reasonIds)
          : Promise.resolve({ data: [] as any[] }),
        registrarIds.length
          ? supabase.from("profiles").select("id, full_name").in("id", registrarIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const productMap: Record<string, { name: string; sku: string | null }> = {};
      for (const p of products.data ?? []) productMap[p.id] = { name: p.name, sku: p.sku };
      const supplierMap: Record<string, string> = {};
      for (const s of suppliers.data ?? []) supplierMap[s.id] = s.name;
      const reasonMap: Record<string, string> = {};
      for (const r of reasons.data ?? []) reasonMap[r.id] = r.title;
      const registrarMap: Record<string, string> = {};
      for (const u of registrars.data ?? []) registrarMap[u.id] = u.full_name ?? "—";

      return { rows, total: count ?? 0, productMap, supplierMap, reasonMap, registrarMap };
    },
  });

  const rows = listQ.data?.rows ?? [];
  const total = listQ.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["purchase-prices"] });
    qc.invalidateQueries({ queryKey: ["pricing-overview"] });
  };

  const deactivate = async (id: string) => {
    if (!canWrite) return;
    if (!confirm("این قیمت خرید غیرفعال شود؟")) return;
    const { error } = await supabase
      .from("purchase_prices")
      .update({ is_active: false })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("قیمت خرید غیرفعال شد");
    refresh();
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="قیمت خرید محصولات"
        description="ثبت و مدیریت قیمت‌های خرید — مبنای محاسبه قیمت فروش"
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link to="/pricing">
                <ArrowRight className="ms-1 h-4 w-4" />
                بازگشت
              </Link>
            </Button>
            {canWrite && (
              <Button size="sm" onClick={() => setOpen(true)}>
                <Plus className="ms-1 h-4 w-4" />
                ثبت قیمت خرید
              </Button>
            )}
          </>
        }
      />

      {/* فیلترها */}
      <Card>
        <CardContent className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 lg:grid-cols-4">
          <ProductPicker
            value={filters.productId}
            label={filters.productLabel}
            onChange={(id, label) => {
              setFilters((f) => ({ ...f, productId: id, productLabel: label }));
              setPage(0);
            }}
          />
          <div>
            <Label className="text-xs text-muted-foreground">ارز</Label>
            <Select
              value={filters.currency}
              onValueChange={(v) => {
                setFilters((f) => ({ ...f, currency: v as Filters["currency"] }));
                setPage(0);
              }}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه</SelectItem>
                {(Object.keys(CURRENCY_LABELS) as CurrencyCode[]).map((c) => (
                  <SelectItem key={c} value={c}>
                    {CURRENCY_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">برند</Label>
            <Select
              value={filters.brandId}
              onValueChange={(v) => {
                setFilters((f) => ({ ...f, brandId: v }));
                setPage(0);
              }}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="همه" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه</SelectItem>
                {(brandsQ.data ?? [])
                  .filter((b) => b.is_active)
                  .map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">دسته‌بندی</Label>
            <Select
              value={filters.categoryId}
              onValueChange={(v) => {
                setFilters((f) => ({ ...f, categoryId: v }));
                setPage(0);
              }}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="همه" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه</SelectItem>
                {(categoriesQ.data ?? [])
                  .filter((c) => c.is_active)
                  .map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">وضعیت</Label>
            <Select
              value={filters.status}
              onValueChange={(v) => {
                setFilters((f) => ({ ...f, status: v as Filters["status"] }));
                setPage(0);
              }}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه</SelectItem>
                <SelectItem value="active">فعال</SelectItem>
                <SelectItem value="inactive">غیرفعال</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end justify-end sm:col-span-2 lg:col-span-3">
            <div className="flex w-full items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                مجموع: {formatNumber(total)} ردیف
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFilters(DEFAULT_FILTERS);
                  setPage(0);
                }}
              >
                <X className="ms-1 h-3 w-3" />
                پاک‌سازی فیلترها
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* لیست */}
      <Card>
        <CardContent className="p-0">
          {listQ.isLoading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">در حال بارگذاری...</div>
          ) : rows.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">قیمتی ثبت نشده است.</div>
          ) : (
            <>
              {/* موبایل */}
              <ul className="divide-y md:hidden">
                {rows.map((r) => {
                  const product = listQ.data?.productMap[r.product_id];
                  const supplier = r.supplier_id ? listQ.data?.supplierMap[r.supplier_id] : null;
                  const reason = r.reason_id ? listQ.data?.reasonMap[r.reason_id] : null;
                  const registrar = r.registered_by
                    ? listQ.data?.registrarMap[r.registered_by]
                    : null;
                  return (
                    <li key={r.id} className="space-y-1 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate font-semibold">{product?.name ?? "—"}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {product?.sku ?? "—"}
                          </div>
                        </div>
                        {r.is_active ? (
                          <Badge variant="default">
                            <Check className="ms-1 h-3 w-3" />
                            فعال
                          </Badge>
                        ) : (
                          <Badge variant="outline">غیرفعال</Badge>
                        )}
                      </div>
                      <div className="text-sm">
                        <span className="font-semibold">
                          {formatNumber(Number(r.purchase_price))}
                        </span>{" "}
                        <span className="text-xs text-muted-foreground">
                          {CURRENCY_LABELS[r.currency as CurrencyCode]}
                        </span>
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {supplier ? `تأمین‌کننده: ${supplier} · ` : ""}
                        {reason ? `علت: ${reason} · ` : ""}
                        {formatDateTimeFa(r.effective_at)}
                      </div>
                      {registrar && (
                        <div className="text-[11px] text-muted-foreground">
                          ثبت‌کننده: {registrar}
                        </div>
                      )}
                      {r.private_note && (
                        <div className="rounded bg-muted/50 p-1.5 text-[11px] text-muted-foreground">
                          🔒 {r.private_note}
                        </div>
                      )}
                      {canWrite && r.is_active && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => deactivate(r.id)}
                        >
                          <Power className="ms-1 h-3 w-3" />
                          غیرفعال‌سازی
                        </Button>
                      )}
                      {canWrite && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => {
                            setEditingRow(r);
                            setOpen(true);
                          }}
                        >
                          <Pencil className="ms-1 h-3 w-3" />
                          ویرایش
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>

              {/* دسکتاپ */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/50 text-right text-xs text-muted-foreground">
                    <tr>
                      <th className="p-3 font-medium">محصول</th>
                      <th className="p-3 font-medium">قیمت خرید</th>
                      <th className="p-3 font-medium">ارز</th>
                      <th className="p-3 font-medium">تأمین‌کننده</th>
                      <th className="p-3 font-medium">علت</th>
                      <th className="p-3 font-medium">تاریخ مؤثر</th>
                      <th className="p-3 font-medium">ثبت‌کننده</th>
                      <th className="p-3 font-medium">وضعیت</th>
                      <th className="p-3 font-medium">عملیات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const product = listQ.data?.productMap[r.product_id];
                      const supplier = r.supplier_id
                        ? listQ.data?.supplierMap[r.supplier_id]
                        : null;
                      const reason = r.reason_id ? listQ.data?.reasonMap[r.reason_id] : null;
                      const registrar = r.registered_by
                        ? listQ.data?.registrarMap[r.registered_by]
                        : null;
                      return (
                        <tr key={r.id} className="border-b last:border-0">
                          <td className="p-3">
                            <div className="font-medium">{product?.name ?? "—"}</div>
                            <div className="text-[11px] text-muted-foreground">
                              {product?.sku ?? "—"}
                            </div>
                          </td>
                          <td className="p-3 font-semibold">
                            {formatNumber(Number(r.purchase_price))}
                          </td>
                          <td className="p-3 text-xs">
                            {CURRENCY_LABELS[r.currency as CurrencyCode]}
                          </td>
                          <td className="p-3 text-xs text-muted-foreground">{supplier ?? "—"}</td>
                          <td className="p-3 text-xs text-muted-foreground">{reason ?? "—"}</td>
                          <td className="p-3 text-xs text-muted-foreground">
                            {formatDateTimeFa(r.effective_at)}
                          </td>
                          <td className="p-3 text-xs text-muted-foreground">{registrar ?? "—"}</td>
                          <td className="p-3">
                            {r.is_active ? (
                              <Badge variant="default">
                                <Check className="ms-1 h-3 w-3" />
                                فعال
                              </Badge>
                            ) : (
                              <Badge variant="outline">غیرفعال</Badge>
                            )}
                          </td>
                          <td className="p-3">
                            {canWrite && r.is_active && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs"
                                onClick={() => deactivate(r.id)}
                              >
                                <Power className="ms-1 h-3 w-3" />
                                غیرفعال
                              </Button>
                            )}
                            {canWrite && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => {
                                  setEditingRow(r);
                                  setOpen(true);
                                }}
                                aria-label="ویرایش"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* pagination */}
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">
          صفحه {formatNumber(page + 1)} از {formatNumber(totalPages)}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            <ChevronRight className="h-4 w-4" />
            قبلی
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page + 1 >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            بعدی
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <PurchasePriceDialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setEditingRow(null);
        }}
        onSaved={refresh}
        editing={editingRow}
        productMap={listQ.data?.productMap}
      />
    </div>
  );
}

/* ─────────── انتخاب محصول با autocomplete ─────────── */

function ProductPicker({
  value,
  label,
  onChange,
  required,
  errorText,
}: {
  value: string | null;
  label: string | null;
  onChange: (id: string | null, label: string | null) => void;
  required?: boolean;
  errorText?: string;
}) {
  const [term, setTerm] = useState("");
  const debounced = useDebounce(term, 350);
  const [openList, setOpenList] = useState(false);

  const search = useQuery({
    queryKey: ["product-search", debounced],
    queryFn: () => searchProducts(debounced, 12),
    enabled: debounced.trim().length >= 2,
    staleTime: 15_000,
  });

  return (
    <div className="relative">
      <Label className="text-xs text-muted-foreground">
        محصول {required && <span className="text-destructive">*</span>}
      </Label>
      {value && label ? (
        <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 p-2">
          <span className="truncate text-sm font-medium">{label}</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2"
            onClick={() => {
              onChange(null, null);
              setTerm("");
            }}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      ) : (
        <div className="relative">
          <Search className="pointer-events-none absolute end-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={(e) => {
              setTerm(e.target.value);
              setOpenList(true);
            }}
            onFocus={() => setOpenList(true)}
            onBlur={() => setTimeout(() => setOpenList(false), 200)}
            placeholder="جستجو بر اساس نام یا SKU..."
            className="h-9 pe-7"
          />
          {openList && debounced.trim().length >= 2 && (
            <div className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-popover p-1 shadow-md">
              {search.isLoading && (
                <div className="p-2 text-xs text-muted-foreground">در حال جستجو...</div>
              )}
              {!search.isLoading && (search.data ?? []).length === 0 && (
                <div className="p-2 text-xs text-muted-foreground">محصولی یافت نشد.</div>
              )}
              {(search.data ?? []).map((p: any) => (
                <button
                  key={p.id}
                  type="button"
                  className="flex w-full flex-col items-start rounded p-2 text-right hover:bg-muted"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange(p.id, `${p.name} — ${p.sku ?? ""}`);
                    setTerm("");
                    setOpenList(false);
                  }}
                >
                  <span className="text-sm font-medium">{p.name}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {p.sku ?? "بدون SKU"} {p.brand?.name ? `· ${p.brand.name}` : ""}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {errorText && <p className="mt-1 text-xs text-destructive">{errorText}</p>}
    </div>
  );
}

/* ─────────── دیالوگ ثبت قیمت خرید ─────────── */

const EMPTY_FORM: PurchasePriceFormValues & {
  selectedProductLabel: string | null;
  is_active: boolean;
} = {
  product_id: "",
  supplier_id: null,
  purchase_price: 0,
  currency: "toman",
  reason_id: null,
  private_note: "",
  effective_at: todayIsoDate(),
  selectedProductLabel: null,
  is_active: true,
};

function PurchasePriceDialog({
  open,
  onOpenChange,
  onSaved,
  editing,
  productMap,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
  editing?: any | null;
  productMap?: Record<string, { name: string; sku: string | null }>;
}) {
  const [values, setValues] = useState<typeof EMPTY_FORM>(EMPTY_FORM);
  const [expiresAt, setExpiresAt] = useState<string>(addMonthsIsoDate(todayIsoDate(), 6));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      const today = todayIsoDate();
      setValues({ ...EMPTY_FORM, effective_at: today });
      setExpiresAt(addMonthsIsoDate(today, 6));
      setErrors({});
      return;
    }
    if (editing) {
      const prodLabel = productMap?.[editing.product_id]
        ? `${productMap[editing.product_id].name} — ${productMap[editing.product_id].sku ?? ""}`
        : null;
      setValues({
        product_id: editing.product_id,
        supplier_id: editing.supplier_id ?? null,
        purchase_price: Number(editing.purchase_price) || 0,
        currency: editing.currency,
        reason_id: editing.reason_id ?? null,
        private_note: editing.private_note ?? "",
        effective_at: toDateOnly(editing.effective_at) || todayIsoDate(),
        selectedProductLabel: prodLabel,
        is_active: !!editing.is_active,
      });
      setExpiresAt(
        toDateOnly(editing.expires_at) ||
          addMonthsIsoDate(toDateOnly(editing.effective_at) || todayIsoDate(), 6),
      );
      setErrors({});
    } else {
      const today = todayIsoDate();
      setValues({ ...EMPTY_FORM, effective_at: today });
      setExpiresAt(addMonthsIsoDate(today, 6));
      setErrors({});
    }
  }, [open, editing, productMap]);

  const reasonsQ = useQuery({
    queryKey: ["change-reasons-active"],
    queryFn: () => fetchChangeReasons(true),
    staleTime: 60_000,
    enabled: open,
  });
  const suppliersQ = useQuery({
    queryKey: ["suppliers-lite"],
    queryFn: fetchSuppliersLite,
    staleTime: 60_000,
    enabled: open,
  });

  const productInfoQ = useQuery({
    queryKey: ["product-lite", values.product_id],
    queryFn: () => fetchProductLite(values.product_id),
    enabled: !!values.product_id,
  });

  const submit = async () => {
    const parsed = purchasePriceSchema.safeParse({
      product_id: values.product_id,
      supplier_id: values.supplier_id || null,
      purchase_price: values.purchase_price,
      currency: values.currency,
      reason_id: values.reason_id || null,
      private_note: values.private_note,
      effective_at: values.effective_at,
    });
    if (!parsed.success) {
      const f: Record<string, string> = {};
      for (const i of parsed.error.issues) f[i.path.join(".")] = i.message;
      setErrors(f);
      return;
    }
    if (Number(parsed.data.purchase_price) <= 0) {
      setErrors({ purchase_price: "قیمت خرید باید بزرگ‌تر از صفر باشد" });
      return;
    }
    if (!parsed.data.reason_id) {
      setErrors({ reason_id: "دلیل تغییر قیمت الزامی است" });
      return;
    }
    if (
      expiresAt &&
      parsed.data.effective_at &&
      new Date(expiresAt) <= new Date(parsed.data.effective_at)
    ) {
      setErrors({ expires_at: "تاریخ انقضا باید بعد از تاریخ مؤثر باشد" });
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      const payload: any = {
        product_id: parsed.data.product_id,
        supplier_id: parsed.data.supplier_id || null,
        purchase_price: parsed.data.purchase_price,
        currency: parsed.data.currency,
        reason_id: parsed.data.reason_id,
        private_note: parsed.data.private_note || null,
        is_active: values.is_active,
      };
      if (parsed.data.effective_at) payload.effective_at = dateStartIso(parsed.data.effective_at);
      if (expiresAt) payload.expires_at = dateEndIso(expiresAt);

      if (editing?.id) {
        const { error } = await supabase
          .from("purchase_prices")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
        toast.success("قیمت خرید ویرایش شد");
      } else {
        const { error } = await supabase.from("purchase_prices").insert(payload);
        if (error) throw error;
        toast.success("قیمت خرید ثبت شد");
      }
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "خطا در ثبت قیمت خرید");
    } finally {
      setLoading(false);
    }
  };

  const productLabel = useMemo(() => {
    if (productInfoQ.data) return `${productInfoQ.data.name} — ${productInfoQ.data.sku ?? ""}`;
    return values.selectedProductLabel;
  }, [productInfoQ.data, values.selectedProductLabel]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "ویرایش قیمت خرید" : "ثبت قیمت خرید جدید"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <ProductPicker
            value={values.product_id || null}
            label={productLabel}
            onChange={(id, label) =>
              setValues((s) => ({ ...s, product_id: id ?? "", selectedProductLabel: label }))
            }
            required
            errorText={errors.product_id}
          />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>قیمت خرید *</Label>
              <Input
                type="number"
                inputMode="numeric"
                dir="ltr"
                value={values.purchase_price || ""}
                onChange={(e) =>
                  setValues((s) => ({ ...s, purchase_price: Number(e.target.value) }))
                }
              />
              {errors.purchase_price && (
                <p className="mt-1 text-xs text-destructive">{errors.purchase_price}</p>
              )}
            </div>
            <div>
              <Label>ارز *</Label>
              <Select
                value={values.currency}
                onValueChange={(v) => setValues((s) => ({ ...s, currency: v as CurrencyCode }))}
              >
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

          <div>
            <Label>تأمین‌کننده (اختیاری)</Label>
            <Select
              value={values.supplier_id ?? "none"}
              onValueChange={(v) =>
                setValues((s) => ({ ...s, supplier_id: v === "none" ? null : v }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="انتخاب کنید" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— بدون تأمین‌کننده —</SelectItem>
                {(suppliersQ.data ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>دلیل تغییر قیمت *</Label>
            <Select
              value={values.reason_id ?? ""}
              onValueChange={(v) => setValues((s) => ({ ...s, reason_id: v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="یک دلیل انتخاب کنید" />
              </SelectTrigger>
              <SelectContent>
                {(reasonsQ.data ?? []).map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.reason_id && (
              <p className="mt-1 text-xs text-destructive">{errors.reason_id}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>تاریخ مؤثر</Label>
              <JalaliDateInput
                value={values.effective_at ?? ""}
                onChange={(iso) => {
                  setValues((s) => ({ ...s, effective_at: iso }));
                  if (iso && !editing) setExpiresAt(addMonthsIsoDate(iso, 6));
                }}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">خالی = الان</p>
            </div>
            <div>
              <Label>تاریخ انقضا</Label>
              <JalaliDateInput
                value={expiresAt}
                onChange={setExpiresAt}
                min={values.effective_at || undefined}
                invalid={!!errors.expires_at}
              />
              {errors.expires_at && (
                <p className="mt-1 text-xs text-destructive">{errors.expires_at}</p>
              )}
            </div>
          </div>

          <div>
            <Label className="flex items-center gap-1">
              یادداشت خصوصی
              <span className="text-[10px] font-normal text-muted-foreground">
                (فقط مدیر و حسابدار)
              </span>
            </Label>
            <Textarea
              rows={2}
              value={values.private_note ?? ""}
              onChange={(e) => setValues((s) => ({ ...s, private_note: e.target.value }))}
              placeholder="اطلاعات داخلی، شرایط تخفیف و …"
            />
          </div>

          <div className="flex items-center gap-2">
            <Switch
              checked={values.is_active}
              onCheckedChange={(v) => setValues((s) => ({ ...s, is_active: v }))}
            />
            <Label>ثبت به‌عنوان قیمت فعال</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            انصراف
          </Button>
          <Button onClick={submit} disabled={loading}>
            {loading && <Loader2 className="ms-1 h-4 w-4 animate-spin" />}ذخیره
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
