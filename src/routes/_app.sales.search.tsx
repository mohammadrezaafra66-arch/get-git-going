import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Loader2, PackageX, Tag, Calculator, Sparkles } from "lucide-react";
import { requirePermission } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useDebounce } from "@/hooks/use-debounce";
import { useAuth } from "@/lib/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { fetchSalePriceTypes } from "@/lib/pricing/queries";
import { formatNumber, formatDateTimeFa } from "@/lib/i18n/formatters";
import { StockAlertButton } from "@/components/sales/StockAlertButton";

export const Route = createFileRoute("/_app/sales/search")({
  beforeLoad: async () => { await requirePermission("sales", "view"); },
  component: SalesSearchPage,
});

const RESULT_LIMIT = 20;

interface ProductRow {
  id: string;
  name: string;
  sku: string | null;
  product_type: "iranian" | "foreign" | string;
  stock_status: string;
  brand?: { id: string; name: string } | null;
  category?: { id: string; name: string } | null;
}

interface HistoryRow {
  id: string;
  product_id: string;
  sale_price_type_id: string | null;
  new_sale_price: number;
  created_at: string;
}

const STOCK_LABEL: Record<string, string> = {
  available: "موجود",
  unavailable: "ناموجود",
  limited: "محدود",
  unknown: "نامشخص",
};

const STOCK_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  available: "default",
  limited: "secondary",
  unavailable: "destructive",
  unknown: "outline",
};

function SalesSearchPage() {
  const { roles } = useAuth();
  const isPrivileged = roles.includes("admin") || roles.includes("manager") || roles.includes("accountant");

  const [search, setSearch] = useState("");
  const dSearch = useDebounce(search, 350);
  const [brandId, setBrandId] = useState<string>("__all");
  const [stockStatus, setStockStatus] = useState<string>("__all");
  const [productType, setProductType] = useState<string>("__all");
  const [salePriceTypeId, setSalePriceTypeId] = useState<string>("");

  const term = dSearch.trim();
  const canSearch = term.length >= 2;

  // ---------- reference data ----------
  const { data: brands = [] } = useQuery({
    queryKey: ["brands-lite-sales"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brands").select("id, name").eq("is_active", true).order("name").limit(500);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });

  const { data: salePriceTypes = [] } = useQuery({
    queryKey: ["sale-price-types-active"],
    queryFn: () => fetchSalePriceTypes(true),
    staleTime: 5 * 60_000,
  });

  // pick first active sale price type by default
  useEffect(() => {
    if (!salePriceTypeId && salePriceTypes.length > 0) {
      setSalePriceTypeId((salePriceTypes[0] as { id: string }).id);
    }
  }, [salePriceTypes, salePriceTypeId]);

  // ---------- products query ----------
  const productsQuery = useQuery({
    enabled: canSearch,
    queryKey: ["sales-search-products", { term, brandId, stockStatus, productType }],
    queryFn: async () => {
      const safe = term.replace(/[%_]/g, "");
      // search by name, SKU, brand name, category name
      let q = supabase
        .from("products")
        .select("id, name, sku, product_type, stock_status, brand:brands(id, name), category:categories(id, name)")
        .eq("is_active", true)
        .or(`name.ilike.%${safe}%,sku.ilike.%${safe}%,brands.name.ilike.%${safe}%,categories.name.ilike.%${safe}%`)
        .order("name", { ascending: true })
        .limit(RESULT_LIMIT);
      if (brandId !== "__all") q = q.eq("brand_id", brandId);
      if (stockStatus !== "__all") q = q.eq("stock_status", stockStatus as "available" | "limited" | "unavailable" | "unknown");
      if (productType !== "__all") q = q.eq("product_type", productType as "iranian" | "foreign");
      const { data, error } = await q;
      if (error) {
        // fallback: some PostgREST setups don't allow OR across embedded relations.
        // Retry with name+sku only.
        let q2 = supabase
          .from("products")
          .select("id, name, sku, product_type, stock_status, brand:brands(id, name), category:categories(id, name)")
          .eq("is_active", true)
          .or(`name.ilike.%${safe}%,sku.ilike.%${safe}%`)
          .order("name", { ascending: true })
          .limit(RESULT_LIMIT);
        if (brandId !== "__all") q2 = q2.eq("brand_id", brandId);
        if (stockStatus !== "__all") q2 = q2.eq("stock_status", stockStatus as "available" | "limited" | "unavailable" | "unknown");
        if (productType !== "__all") q2 = q2.eq("product_type", productType as "iranian" | "foreign");
        const r2 = await q2;
        if (r2.error) throw r2.error;
        return (r2.data ?? []) as ProductRow[];
      }
      return (data ?? []) as ProductRow[];
    },
    staleTime: 30_000,
  });

  const products = productsQuery.data ?? [];
  const productIds = useMemo(() => products.map((p) => p.id), [products]);

  // ---------- history (latest per product for selected sale_price_type) ----------
  const historyQuery = useQuery({
    enabled: productIds.length > 0 && !!salePriceTypeId,
    queryKey: ["sales-search-history", productIds, salePriceTypeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_sale_price_history")
        .select("id, product_id, sale_price_type_id, new_sale_price, created_at")
        .in("product_id", productIds)
        .eq("sale_price_type_id", salePriceTypeId)
        .order("created_at", { ascending: false })
        .limit(productIds.length * 5);
      if (error) throw error;
      const seen = new Set<string>();
      const latest = new Map<string, HistoryRow>();
      for (const r of (data ?? []) as HistoryRow[]) {
        if (seen.has(r.product_id)) continue;
        seen.add(r.product_id);
        latest.set(r.product_id, r);
      }
      return latest;
    },
    staleTime: 30_000,
  });

  const priceMap = historyQuery.data ?? new Map<string, HistoryRow>();
  const isLoading = (canSearch && productsQuery.isLoading) || (productIds.length > 0 && historyQuery.isLoading);

  return (
    <div className="space-y-5">
      <PageHeader
        title="جستجوی سریع فروش"
        description="پیدا کردن سریع محصول و مشاهده قیمت فروش معتبر برای پاسخ به مشتری"
      />

      {/* search & price type */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="relative sm:col-span-2">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="نام محصول، SKU، برند یا دسته (حداقل ۲ کاراکتر)"
                className="pr-10 h-12 text-base"
                autoFocus
              />
            </div>
            <Select value={salePriceTypeId} onValueChange={setSalePriceTypeId}>
              <SelectTrigger className="h-12">
                <SelectValue placeholder="نوع قیمت فروش" />
              </SelectTrigger>
              <SelectContent>
                {salePriceTypes.map((t: { id: string; title: string }) => (
                  <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* light filters */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Select value={brandId} onValueChange={setBrandId}>
              <SelectTrigger><SelectValue placeholder="برند" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">همه برندها</SelectItem>
                {brands.map((b: { id: string; name: string }) => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={stockStatus} onValueChange={setStockStatus}>
              <SelectTrigger><SelectValue placeholder="موجودی" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">همه</SelectItem>
                <SelectItem value="available">موجود</SelectItem>
                <SelectItem value="limited">محدود</SelectItem>
                <SelectItem value="unavailable">ناموجود</SelectItem>
                <SelectItem value="unknown">نامشخص</SelectItem>
              </SelectContent>
            </Select>
            <Select value={productType} onValueChange={setProductType}>
              <SelectTrigger><SelectValue placeholder="نوع کالا" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">همه</SelectItem>
                <SelectItem value="iranian">ایرانی</SelectItem>
                <SelectItem value="foreign">خارجی</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* results */}
      {!canSearch ? (
        <EmptyState
          icon={Search}
          title="برای جستجو حداقل ۲ کاراکتر وارد کنید"
          description="می‌توانید با نام محصول، کد SKU، نام برند یا دسته‌بندی جستجو کنید."
        />
      ) : isLoading ? (
        <div className="flex min-h-[30vh] items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="ml-2 h-4 w-4 animate-spin" /> در حال جستجو...
        </div>
      ) : products.length === 0 ? (
        <EmptyState
          icon={PackageX}
          title="محصولی پیدا نشد"
          description="محصولی با این عبارت پیدا نشد."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {products.map((p) => {
            const h = priceMap.get(p.id);
            return (
              <ProductCard
                key={p.id}
                product={p}
                history={h}
                isPrivileged={isPrivileged}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

interface ProductCardProps {
  product: ProductRow;
  history: HistoryRow | undefined;
  isPrivileged: boolean;
}

function ProductCard({ product, history, isPrivileged }: ProductCardProps) {
  const stockKey = product.stock_status ?? "unknown";
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <h3 className="font-semibold text-foreground truncate">{product.name}</h3>
            <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
              {product.sku && (
                <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono">
                  <Tag className="h-3 w-3" /> {product.sku}
                </span>
              )}
              {product.brand?.name && <span>برند: {product.brand.name}</span>}
              {product.category?.name && <span>· {product.category.name}</span>}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge variant={STOCK_VARIANT[stockKey] ?? "outline"}>
              {STOCK_LABEL[stockKey] ?? stockKey}
            </Badge>
            <span className="text-[11px] text-muted-foreground">
              {product.product_type === "foreign" ? "خارجی" : product.product_type === "iranian" ? "ایرانی" : ""}
            </span>
          </div>
        </div>

        <div className="rounded-md border border-border bg-muted/30 p-3">
          {history ? (
            <div className="flex items-end justify-between gap-2">
              <div>
                <div className="text-xs text-muted-foreground">قیمت فروش</div>
                <div className="text-2xl font-bold text-primary">
                  {formatNumber(Number(history.new_sale_price))}
                  <span className="mr-1 text-xs font-normal text-muted-foreground">تومان</span>
                </div>
              </div>
              <div className="text-[11px] text-muted-foreground text-left">
                آخرین بروزرسانی
                <div>{formatDateTimeFa(history.created_at)}</div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Sparkles className="h-4 w-4" />
                برای این نوع قیمت، قیمت فروش ثبت نشده است.
              </div>
              {isPrivileged && (
                <Link
                  to="/pricing/calculator"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <Calculator className="h-3.5 w-3.5" /> رفتن به محاسبه قیمت
                </Link>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <StockAlertButton
            productId={product.id}
            productName={product.name}
            productSku={product.sku}
            stockStatus={stockKey}
          />
        </div>
      </CardContent>
    </Card>
  );
}