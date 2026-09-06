import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2, PackageX, AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";

import { PageHeader } from "@/components/common/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  fetchStaleUnavailableProducts,
  fetchStalePurchasePrices,
  type AttentionProduct,
  type StalePurchasePriceItem,
} from "@/lib/pricing/attention-queries";
import {
  STOCK_STALE_DAYS,
  PURCHASE_PRICE_STALE_DAYS,
  USD_DRIFT_THRESHOLD_PCT,
} from "@/lib/popups/config";
import { formatNumber, formatDateFa } from "@/lib/i18n/formatters";
import { requirePermission } from "@/lib/rbac/route-guards";

export const Route = createFileRoute("/_app/pricing/attention")({
  // Wave 2 / B-1 — the client half of the guard below. `beforeLoad` runs only on the server
  // for a direct navigation and cannot see a localStorage session, so RouteRoleGate reads this.
  // Mirrors requirePermission("pricing", "view"). `allowed` is the LIVE
  // role_permissions.pricing.can_view set read from the database on 2026-09-06 —
  // NOT src/lib/rbac/roles.ts, whose static table disagrees for several modules.
  // This route had NO guard of any kind before wave 2 (investigation class (i) row 18): it reads
  // supplier cost prices via v_latest_active_purchase_prices and renders product-owner names,
  // so the beforeLoad below was added in the same change as the gate.
  staticData: {
    gate: {
      kind: "anyRole",
      allowed: ["admin", "manager", "accountant", "sales", "purchase_specialist"],
    },
  },
  beforeLoad: async () => {
    await requirePermission("pricing", "view");
  },
  component: AttentionPage,
});

function daysAgoFa(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));
  if (d <= 0) return "امروز";
  if (d === 1) return "۱ روز پیش";
  return `${d} روز پیش`;
}

function OwnersCell({ owners }: { owners: AttentionProduct["owners"] }) {
  if (!owners || owners.length === 0)
    return <span className="text-xs text-muted-foreground">بدون مسئول</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {owners.map((o) => (
        <Badge key={o.user_id} variant="secondary" className="text-[11px]">
          {o.full_name ?? "—"}
        </Badge>
      ))}
    </div>
  );
}

function AttentionPage() {
  const staleStockQ = useQuery({
    queryKey: ["attention", "stale-stock"],
    queryFn: () => fetchStaleUnavailableProducts(),
    staleTime: 60_000,
  });
  const stalePriceQ = useQuery({
    queryKey: ["attention", "stale-purchase-prices"],
    queryFn: () => fetchStalePurchasePrices(),
    staleTime: 60_000,
  });

  return (
    <div className="space-y-6" dir="rtl">
      <PageHeader
        title="فرصت جبران"
        description="رسیدگی به محصولات ناموجود طولانی‌مدت و قیمت‌های خرید نیازمند به‌روزرسانی"
      />

      <Tabs defaultValue="stock" dir="rtl">
        <TabsList>
          <TabsTrigger value="stock">
            ناموجود بیش از {STOCK_STALE_DAYS} روز
            {staleStockQ.data && (
              <Badge variant="destructive" className="ms-2">
                {staleStockQ.data.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="prices">
            قیمت خرید کهنه / drift دلاری
            {stalePriceQ.data && (
              <Badge variant="destructive" className="ms-2">
                {stalePriceQ.data.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="stock" className="mt-4">
          <StaleStockTable q={staleStockQ} />
        </TabsContent>
        <TabsContent value="prices" className="mt-4">
          <StalePriceTable q={stalePriceQ} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StaleStockTable({
  q,
}: {
  q: { data: AttentionProduct[] | undefined; isLoading: boolean; error: unknown };
}) {
  if (q.isLoading)
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground">
        <Loader2 className="ms-2 h-5 w-5 animate-spin" />
        در حال بارگذاری…
      </div>
    );
  if (q.error)
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
        خطا در دریافت داده‌ها
      </div>
    );
  const rows = q.data ?? [];
  if (rows.length === 0)
    return (
      <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
        <PackageX className="mx-auto mb-2 h-6 w-6" />
        موردی برای رسیدگی نیست. آفرین! 👏
      </div>
    );
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-right">محصول</TableHead>
            <TableHead className="text-right">SKU</TableHead>
            <TableHead className="text-right">آخرین تغییر</TableHead>
            <TableHead className="text-right">مسئول</TableHead>
            <TableHead className="text-right">عملیات</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="font-medium">{r.name}</TableCell>
              <TableCell className="font-mono text-xs">{r.sku ?? "—"}</TableCell>
              <TableCell className="text-xs">
                <div>{daysAgoFa(r.updated_at)}</div>
                <div className="text-muted-foreground">{formatDateFa(r.updated_at)}</div>
              </TableCell>
              <TableCell>
                <OwnersCell owners={r.owners} />
              </TableCell>
              <TableCell>
                <Button asChild size="sm" variant="outline">
                  <Link to="/products/$id" params={{ id: r.id }}>
                    باز کردن
                  </Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function StalePriceTable({
  q,
}: {
  q: { data: StalePurchasePriceItem[] | undefined; isLoading: boolean; error: unknown };
}) {
  if (q.isLoading)
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground">
        <Loader2 className="ms-2 h-5 w-5 animate-spin" />
        در حال بارگذاری…
      </div>
    );
  if (q.error)
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
        خطا در دریافت داده‌ها
      </div>
    );
  const rows = q.data ?? [];
  if (rows.length === 0)
    return (
      <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
        <AlertTriangle className="mx-auto mb-2 h-6 w-6" />
        قیمتی نیاز به رسیدگی ندارد.
      </div>
    );
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        موارد زیر یا بیش از {PURCHASE_PRICE_STALE_DAYS} روز به‌روزرسانی نشده‌اند، یا معادل دلاری‌شان
        بیش از {USD_DRIFT_THRESHOLD_PCT}٪ تغییر کرده است.
      </p>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">محصول</TableHead>
              <TableHead className="text-right">قیمت خرید (تومان)</TableHead>
              <TableHead className="text-right">آخرین ثبت</TableHead>
              <TableHead className="text-right">drift دلاری</TableHead>
              <TableHead className="text-right">مسئول</TableHead>
              <TableHead className="text-right">عملیات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const drift = r.usd_drift_pct;
              return (
                <TableRow key={r.product_id}>
                  <TableCell className="font-medium">
                    <div>{r.name}</div>
                    {r.sku && (
                      <div className="font-mono text-xs text-muted-foreground">{r.sku}</div>
                    )}
                  </TableCell>
                  <TableCell className="font-mono">{formatNumber(r.purchase_price)}</TableCell>
                  <TableCell className="text-xs">
                    <div>{daysAgoFa(r.price_updated_at)}</div>
                    <div className="text-muted-foreground">{formatDateFa(r.price_updated_at)}</div>
                    {r.is_toman_stale && (
                      <Badge variant="outline" className="mt-1 text-[10px]">
                        کهنه
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {drift == null ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      <span
                        className={`inline-flex items-center gap-1 text-xs ${
                          r.is_usd_drifted ? "text-destructive" : "text-muted-foreground"
                        }`}
                      >
                        {drift > 0 ? (
                          <TrendingUp className="h-3 w-3" />
                        ) : (
                          <TrendingDown className="h-3 w-3" />
                        )}
                        {drift.toFixed(1)}٪
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <OwnersCell owners={r.owners} />
                  </TableCell>
                  <TableCell>
                    <Button asChild size="sm" variant="outline">
                      <Link to="/products/$id" params={{ id: r.product_id }}>
                        باز کردن
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
