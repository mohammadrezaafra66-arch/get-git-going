import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Download, AlertTriangle, AlertCircle, AlertOctagon, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fetchWorkbenchHealthReport, type WorkbenchRowV2 } from "@/lib/pricing/workbench-queries";
import {
  isIncompleteProduct,
  isTaggedRiskProduct,
  getProductPricingIssues,
  getTaggedProductRiskPriority,
  hasValidSalePrice,
  STOCK_LABEL,
  PRODUCT_STATUS_LABEL,
  ISSUE_LABEL,
  PRIORITY_LABEL,
  PRIORITY_WEIGHT,
  type RiskPriority,
} from "@/lib/pricing/workbench-filters";
import { exportIncompleteCsv, exportTaggedRiskCsv } from "@/lib/pricing/workbench-csv";
import { formatNumber } from "@/lib/i18n/formatters";

export function HealthReportTab({ ownedOnly }: { ownedOnly: { userId: string } | null }) {
  const q = useQuery({
    queryKey: ["workbench-health-report", ownedOnly?.userId ?? "all"],
    queryFn: () => fetchWorkbenchHealthReport({ ownedOnly }),
    staleTime: 30_000,
  });

  const rows = q.data ?? [];

  const incomplete = useMemo(
    () => rows.filter((r) => isIncompleteProduct(toIssueInput(r))),
    [rows],
  );
  const taggedRisk = useMemo(() => {
    const list = rows.filter((r) => isTaggedRiskProduct(toIssueInput(r)));
    return list.sort((a, b) => {
      const pa = getTaggedProductRiskPriority(toIssueInput(a));
      const pb = getTaggedProductRiskPriority(toIssueInput(b));
      const w = PRIORITY_WEIGHT[pa] - PRIORITY_WEIGHT[pb];
      if (w !== 0) return w;
      return (b.sale_price_updated_at ?? "").localeCompare(a.sale_price_updated_at ?? "");
    });
  }, [rows]);

  const stats = useMemo(() => {
    let noPrice = 0, inactive = 0, noOwner = 0, urgent = 0;
    for (const r of rows) {
      const inp = toIssueInput(r);
      if (!hasValidSalePrice(r.sale_price)) noPrice++;
      if (r.status !== "active") inactive++;
      if (r.owners.length === 0) noOwner++;
      if (
        r.tags.length > 0 &&
        getTaggedProductRiskPriority(inp) === "urgent"
      ) urgent++;
    }
    return {
      totalIncomplete: incomplete.length,
      noPrice, inactive, noOwner,
      totalTaggedRisk: taggedRisk.length,
      urgent,
    };
  }, [rows, incomplete.length, taggedRisk.length]);

  const ownerBreakdown = useMemo(() => {
    const map = new Map<string, {
      ownerId: string; ownerName: string;
      total: number; noPrice: number; inactive: number;
      unavailable: number; noOwner: number; tagged: number; urgent: number;
    }>();
    for (const r of rows) {
      const inp = toIssueInput(r);
      if (!isIncompleteProduct(inp) && !isTaggedRiskProduct(inp)) continue;
      const owner = r.owners[0];
      const key = owner?.user_id ?? "__none__";
      const name = owner?.full_name ?? (owner ? owner.user_id.slice(0, 8) : "بدون مسئول");
      const cur = map.get(key) ?? {
        ownerId: key, ownerName: name,
        total: 0, noPrice: 0, inactive: 0,
        unavailable: 0, noOwner: 0, tagged: 0, urgent: 0,
      };
      cur.total += 1;
      if (!hasValidSalePrice(r.sale_price)) cur.noPrice++;
      if (r.status !== "active") cur.inactive++;
      if (r.stock_status === "unavailable") cur.unavailable++;
      if (r.owners.length === 0) cur.noOwner++;
      if (r.tags.length > 0 && isTaggedRiskProduct(inp)) cur.tagged++;
      if (r.tags.length > 0 && getTaggedProductRiskPriority(inp) === "urgent") cur.urgent++;
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [rows]);

  if (q.isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
        <Loader2 className="ms-2 h-4 w-4 animate-spin" /> در حال بارگذاری گزارش...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <StatCard label="کل ناقص" value={stats.totalIncomplete} tone="warn" />
        <StatCard label="بدون قیمت فروش" value={stats.noPrice} tone="warn" />
        <StatCard label="غیرفعال" value={stats.inactive} tone="muted" />
        <StatCard label="بدون مسئول" value={stats.noOwner} tone="warn" />
        <StatCard label="برچسب‌دار مشکل‌دار" value={stats.totalTaggedRisk} tone="danger" />
        <StatCard label="موارد فوری" value={stats.urgent} tone="danger" />
      </div>

      {rows.length >= 2000 && (
        <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <Info className="h-4 w-4" />
          گزارش به ۲۰۰۰ محصول محدود شده است. برای dataset بزرگ‌تر، فیلتر یا view اختصاصی پیشنهاد می‌شود.
        </div>
      )}

      {/* Incomplete table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">محصولات ناقص / غیرقابل فروش</CardTitle>
          <Button size="sm" variant="outline" onClick={() => exportIncompleteCsv(incomplete)} disabled={incomplete.length === 0}>
            <Download className="ms-1 h-3.5 w-3.5" /> خروجی CSV
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {incomplete.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">مورد مشکل‌داری پیدا نشد.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">محصول</TableHead>
                  <TableHead className="text-right">برند</TableHead>
                  <TableHead className="text-right">دسته</TableHead>
                  <TableHead className="text-right">نوع</TableHead>
                  <TableHead className="text-right">موجودی</TableHead>
                  <TableHead className="text-right">وضعیت</TableHead>
                  <TableHead className="text-right">قیمت فروش</TableHead>
                  <TableHead className="text-right">مسئول</TableHead>
                  <TableHead className="text-right">علت مشکل</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {incomplete.slice(0, 500).map((r) => {
                  const issues = getProductPricingIssues(toIssueInput(r));
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">
                        <div className="truncate">{r.name}</div>
                        <div className="text-[10px] text-muted-foreground" dir="ltr">{r.sku ?? "—"}</div>
                      </TableCell>
                      <TableCell className="text-xs">{r.brand_name ?? "—"}</TableCell>
                      <TableCell className="text-xs">
                        {r.parent_category_name ? `${r.parent_category_name} / ${r.category_name}` : (r.category_name ?? "—")}
                      </TableCell>
                      <TableCell className="text-xs">{r.product_type === "foreign" ? `ارزی (${r.base_currency})` : "تومانی"}</TableCell>
                      <TableCell className="text-xs">{STOCK_LABEL[r.stock_status]}</TableCell>
                      <TableCell className="text-xs">
                        {r.status === "active" ? (
                          <Badge variant="outline" className="border-emerald-500 text-emerald-700">{PRODUCT_STATUS_LABEL.active}</Badge>
                        ) : (
                          <Badge variant="outline" className="border-amber-500 text-amber-700">{PRODUCT_STATUS_LABEL[r.status]}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {hasValidSalePrice(r.sale_price) ? formatNumber(r.sale_price!) : (
                          <Badge variant="destructive">بدون قیمت</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {r.owners.length === 0 ? (
                          <Badge variant="destructive">بدون مسئول</Badge>
                        ) : r.owners.map((o) => o.full_name ?? o.user_id.slice(0, 6)).join("، ")}
                      </TableCell>
                      <TableCell className="text-xs">
                        {issues.map((c) => (
                          <Badge key={c} variant="secondary" className="me-1">{ISSUE_LABEL[c]}</Badge>
                        ))}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Tagged risk table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">محصولات برچسب‌دار مشکل‌دار</CardTitle>
          <Button size="sm" variant="outline" onClick={() => exportTaggedRiskCsv(taggedRisk)} disabled={taggedRisk.length === 0}>
            <Download className="ms-1 h-3.5 w-3.5" /> خروجی CSV
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {taggedRisk.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">مورد مشکل‌داری پیدا نشد.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">اولویت</TableHead>
                  <TableHead className="text-right">محصول</TableHead>
                  <TableHead className="text-right">برند</TableHead>
                  <TableHead className="text-right">دسته</TableHead>
                  <TableHead className="text-right">برچسب‌ها</TableHead>
                  <TableHead className="text-right">موجودی</TableHead>
                  <TableHead className="text-right">قیمت فروش</TableHead>
                  <TableHead className="text-right">مسئول</TableHead>
                  <TableHead className="text-right">علت</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {taggedRisk.slice(0, 500).map((r) => {
                  const inp = toIssueInput(r);
                  const issues = getProductPricingIssues(inp);
                  const priority = getTaggedProductRiskPriority(inp);
                  return (
                    <TableRow key={r.id}>
                      <TableCell><PriorityBadge p={priority} /></TableCell>
                      <TableCell className="font-medium">
                        <div className="truncate">{r.name}</div>
                        <div className="text-[10px] text-muted-foreground" dir="ltr">{r.sku ?? "—"}</div>
                      </TableCell>
                      <TableCell className="text-xs">{r.brand_name ?? "—"}</TableCell>
                      <TableCell className="text-xs">
                        {r.parent_category_name ? `${r.parent_category_name} / ${r.category_name}` : (r.category_name ?? "—")}
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="flex flex-wrap gap-1">
                          {r.tags.map((t) => (
                            <Badge key={t.id} style={{ backgroundColor: t.color, color: "white" }}>{t.title}</Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">{STOCK_LABEL[r.stock_status]}</TableCell>
                      <TableCell className="text-xs">
                        {hasValidSalePrice(r.sale_price) ? formatNumber(r.sale_price!) : (
                          <Badge variant="destructive">بدون قیمت</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {r.owners.length === 0 ? (
                          <Badge variant="destructive">بدون مسئول</Badge>
                        ) : r.owners.map((o) => o.full_name ?? o.user_id.slice(0, 6)).join("، ")}
                      </TableCell>
                      <TableCell className="text-xs">
                        {issues.map((c) => (
                          <Badge key={c} variant="secondary" className="me-1">{ISSUE_LABEL[c]}</Badge>
                        ))}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Owner breakdown */}
      {ownerBreakdown.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">وضعیت اصلاح بر اساس مسئول محصول</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">مسئول</TableHead>
                  <TableHead className="text-right">کل مشکل‌دار</TableHead>
                  <TableHead className="text-right">بدون قیمت</TableHead>
                  <TableHead className="text-right">غیرفعال</TableHead>
                  <TableHead className="text-right">ناموجود</TableHead>
                  <TableHead className="text-right">برچسب‌دار</TableHead>
                  <TableHead className="text-right">فوری</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ownerBreakdown.map((b) => (
                  <TableRow key={b.ownerId}>
                    <TableCell className="font-medium">{b.ownerName}</TableCell>
                    <TableCell>{formatNumber(b.total)}</TableCell>
                    <TableCell>{formatNumber(b.noPrice)}</TableCell>
                    <TableCell>{formatNumber(b.inactive)}</TableCell>
                    <TableCell>{formatNumber(b.unavailable)}</TableCell>
                    <TableCell>{formatNumber(b.tagged)}</TableCell>
                    <TableCell>{formatNumber(b.urgent)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function toIssueInput(r: WorkbenchRowV2) {
  return {
    status: r.status,
    stock_status: r.stock_status,
    sale_price: r.sale_price,
    owners_count: r.owners.length,
    tags_count: r.tags.length,
  };
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: "warn" | "danger" | "muted" }) {
  const cls =
    tone === "danger" ? "border-destructive/40 bg-destructive/5" :
    tone === "warn" ? "border-amber-400/50 bg-amber-50/50 dark:bg-amber-950/20" :
    "border-border";
  return (
    <Card className={cls}>
      <CardContent className="p-3">
        <div className="text-[11px] text-muted-foreground">{label}</div>
        <div className="text-xl font-semibold">{formatNumber(value)}</div>
      </CardContent>
    </Card>
  );
}

function PriorityBadge({ p }: { p: RiskPriority }) {
  if (p === "urgent") return <Badge className="gap-1 bg-destructive text-destructive-foreground"><AlertOctagon className="h-3 w-3" />{PRIORITY_LABEL.urgent}</Badge>;
  if (p === "high") return <Badge className="gap-1 bg-amber-600 text-white"><AlertTriangle className="h-3 w-3" />{PRIORITY_LABEL.high}</Badge>;
  if (p === "medium") return <Badge variant="secondary" className="gap-1"><AlertCircle className="h-3 w-3" />{PRIORITY_LABEL.medium}</Badge>;
  return <Badge variant="outline" className="gap-1"><Info className="h-3 w-3" />{PRIORITY_LABEL.low}</Badge>;
}