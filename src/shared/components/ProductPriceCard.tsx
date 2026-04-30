import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowDownRight, ArrowUpRight, Calculator, Copy, Loader2, Minus, PackageX, Tag, Truck, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { fetchSalePriceTypes } from "@/lib/pricing/queries";
import { formatNumber, formatDateTimeFa, formatDateFa } from "@/lib/i18n/formatters";
import { useAuth } from "@/lib/auth/AuthProvider";
import { hasPermissionEx } from "@/lib/rbac/roles";

interface ProductLite {
  id: string;
  name: string;
  sku: string | null;
  product_type?: string;
  stock_status?: string;
  brand?: { id: string; name: string } | null;
  category?: { id: string; name: string } | null;
}

interface Props {
  product: ProductLite | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const STOCK_LABEL: Record<string, string> = {
  available: "موجود", unavailable: "ناموجود", limited: "محدود", unknown: "نامشخص",
};
const STOCK_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  available: "default", limited: "secondary", unavailable: "destructive", unknown: "outline",
};

interface HistoryRow {
  id: string;
  sale_price_type_id: string | null;
  new_sale_price: number;
  old_sale_price: number | null;
  change_percent: number | null;
  created_at: string;
}

export function ProductPriceCard({ product, open, onOpenChange }: Props) {
  const { roles } = useAuth();
  const isPrivileged = hasPermissionEx(roles, "pricing", "view_sensitive");
  const canSeeContact = hasPermissionEx(roles, "suppliers", "view_sensitive");
  const productId = product?.id ?? null;

  const { data: priceTypes = [] } = useQuery({
    queryKey: ["sale-price-types-active"],
    queryFn: () => fetchSalePriceTypes(true),
    staleTime: 5 * 60_000,
  });

  const historyQuery = useQuery({
    enabled: !!productId && open,
    queryKey: ["product-prices-all", productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_sale_price_history")
        .select("id, sale_price_type_id, new_sale_price, old_sale_price, change_percent, created_at")
        .eq("product_id", productId!)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      const latest = new Map<string, HistoryRow>();
      for (const r of (data ?? []) as HistoryRow[]) {
        const k = r.sale_price_type_id ?? "__none";
        if (!latest.has(k)) latest.set(k, r);
      }
      return latest;
    },
    staleTime: 60_000,
  });

  const suppliersQuery = useQuery({
    enabled: !!productId && open,
    queryKey: ["product-suppliers-lite", productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_suppliers")
        .select("id, is_primary, supplier:suppliers(id, name, contact_name, phone, city)")
        .eq("product_id", productId!)
        .order("is_primary", { ascending: false })
        .limit(10);
      if (error) return [] as any[];
      return data ?? [];
    },
    staleTime: 60_000,
  });

  const labelsQuery = useQuery({
    enabled: !!productId && open,
    queryKey: ["product-labels-lite", productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_label_links")
        .select("label:product_labels(id, title, visibility)")
        .eq("product_id", productId!);
      if (error) return [] as any[];
      return (data ?? []).map((r: any) => r.label).filter(Boolean);
    },
    staleTime: 5 * 60_000,
  });

  const priceMap = historyQuery.data ?? new Map<string, HistoryRow>();
  const stockKey = product?.stock_status ?? "unknown";
  const canSeeInternalLabels = roles.includes("admin") || roles.includes("manager");
  const visibleLabels = (labelsQuery.data ?? []).filter(
    (l: any) => canSeeInternalLabels || l?.visibility !== "internal",
  );

  const handleCopy = async () => {
    if (!product) return;
    const lines: string[] = [];
    lines.push(`📦 ${product.name}`);
    if (product.brand?.name) lines.push(`🏷 برند: ${product.brand.name}`);
    if (product.category?.name) lines.push(`📂 دسته: ${product.category.name}`);
    lines.push(`📊 موجودی: ${STOCK_LABEL[stockKey] ?? stockKey}`);
    lines.push("");

    const priceLines: string[] = [];
    let latestAt: string | null = null;
    for (const t of priceTypes as { id: string; title: string }[]) {
      const h = priceMap.get(t.id);
      if (!h) continue;
      const price = `${formatNumber(Number(h.new_sale_price))} تومان`;
      const change = Number(h.change_percent ?? 0);
      const hasOld = h.old_sale_price != null && Number(h.old_sale_price) > 0;
      let suffix = "";
      if (hasOld && Math.abs(change) >= 0.01) {
        const arrow = change > 0 ? "↑" : "↓";
        suffix = ` (${arrow} ${formatNumber(Math.abs(Math.round(change)))}٪)`;
      }
      priceLines.push(`• ${t.title}: ${price}${suffix}`);
      if (!latestAt || new Date(h.created_at) > new Date(latestAt)) latestAt = h.created_at;
    }

    if (priceLines.length > 0) {
      lines.push("💰 قیمت‌های فروش:");
      lines.push(...priceLines);
      lines.push("");
      if (latestAt) lines.push(`📅 آخرین به‌روزرسانی: ${formatDateFa(latestAt)}`);
    } else {
      lines.push("💰 قیمت فروش معتبری ثبت نشده است.");
    }
    lines.push("");
    lines.push("🔗 برای اطلاعات بیشتر با ما تماس بگیرید.");

    const text = lines.join("\n");
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        if (!ok) throw new Error("copy failed");
      }
      toast.success("اطلاعات محصول در کلیپ‌بورد کپی شد.");
    } catch {
      toast.error("کپی در کلیپ‌بورد ممکن نشد. لطفاً به‌صورت دستی انتخاب و کپی کنید.");
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto sm:max-w-2xl sm:mx-auto rounded-t-2xl">
        {!product ? null : (
          <>
            <SheetHeader className="text-right">
              <SheetTitle className="text-lg font-bold">{product.name}</SheetTitle>
              <SheetDescription className="flex flex-wrap items-center gap-1.5 text-xs">
                {product.sku && (
                  <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono">
                    <Tag className="h-3 w-3" /> {product.sku}
                  </span>
                )}
                {product.brand?.name && <span>برند: {product.brand.name}</span>}
                {product.category?.name && <span>· {product.category.name}</span>}
                <Badge variant={STOCK_VARIANT[stockKey] ?? "outline"} className="ms-1">
                  {STOCK_LABEL[stockKey] ?? stockKey}
                </Badge>
              </SheetDescription>
            </SheetHeader>

            {/* Labels */}
            {visibleLabels.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {visibleLabels.map((l: any) => (
                  <Badge key={l.id} variant="outline" className="text-[11px]">{l.title}</Badge>
                ))}
              </div>
            )}

            {/* Prices */}
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">قیمت‌های فروش معتبر</h3>
                {historyQuery.isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              </div>

              {historyQuery.isLoading ? (
                <div className="space-y-2">
                  {[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full rounded-md" />)}
                </div>
              ) : !isPrivileged ? (
                <div className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                  مشاهده تاریخچه قیمت برای نقش شما فعال نیست. لطفاً از کارت محصول قیمت معتبر را ببینید.
                </div>
              ) : priceMap.size === 0 ? (
                <div className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                  <PackageX className="mx-auto mb-1 h-5 w-5" />
                  هنوز قیمت فروشی برای این محصول ثبت نشده است.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {priceTypes.map((t: { id: string; title: string }) => {
                    const h = priceMap.get(t.id);
                    return <PriceRow key={t.id} title={t.title} history={h} />;
                  })}
                </div>
              )}
            </div>

            {/* Suppliers */}
            {(suppliersQuery.data?.length ?? 0) > 0 && (
              <div className="mt-4 space-y-2">
                <h3 className="text-sm font-semibold text-foreground">تأمین‌کنندگان</h3>
                <div className="space-y-1.5">
                  {suppliersQuery.data!.map((row: any) => (
                    <div key={row.id} className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <UserRound className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="font-medium truncate">{row.supplier?.name ?? "—"}</span>
                        {row.is_primary && <Badge variant="secondary" className="text-[10px]">اصلی</Badge>}
                      </div>
                      {canSeeContact && row.supplier?.phone && (
                        <span className="font-mono text-xs text-muted-foreground" dir="ltr">{row.supplier.phone}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
              <Button type="button" variant="secondary" size="sm" onClick={handleCopy}>
                <Copy className="ms-1 h-4 w-4" />
                کپی اطلاعات
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link to="/pricing/calculator">
                  <Calculator className="ms-1 h-4 w-4" />
                  محاسبه دقیق‌تر (تست موتور قیمت)
                </Link>
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function PriceRow({ title, history }: { title: string; history: HistoryRow | undefined }) {
  if (!history) {
    return (
      <div className="rounded-md border border-dashed border-border bg-muted/20 p-3">
        <div className="text-xs text-muted-foreground">{title}</div>
        <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
          <Truck className="h-3 w-3" /> قیمتی ثبت نشده
        </div>
      </div>
    );
  }
  const change = Number(history.change_percent ?? 0);
  const dir: "up" | "down" | "flat" =
    change > 0.01 ? "up" : change < -0.01 ? "down" : "flat";
  const colorCls =
    dir === "up" ? "text-destructive" : dir === "down" ? "text-emerald-600 dark:text-emerald-500" : "text-muted-foreground";
  const Icon = dir === "up" ? ArrowUpRight : dir === "down" ? ArrowDownRight : Minus;

  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{title}</span>
        {history.old_sale_price != null && Number(history.old_sale_price) > 0 && (
          <span className={`inline-flex items-center gap-0.5 text-[11px] ${colorCls}`}>
            <Icon className="h-3 w-3" />
            {Math.abs(change).toFixed(1)}٪
          </span>
        )}
      </div>
      <div className="mt-1 text-xl font-bold text-primary">
        {formatNumber(Number(history.new_sale_price))}
        <span className="mr-1 text-[11px] font-normal text-muted-foreground">تومان</span>
      </div>
      {history.old_sale_price != null && Number(history.old_sale_price) > 0 && (
        <div className="text-[11px] text-muted-foreground line-through">
          {formatNumber(Number(history.old_sale_price))}
        </div>
      )}
      <div className="mt-1 text-[10px] text-muted-foreground">
        {formatDateTimeFa(history.created_at)}
      </div>
    </div>
  );
}