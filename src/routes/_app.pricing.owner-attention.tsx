import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Download, AlertCircle, Info } from "lucide-react";
import { requirePermission } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  fetchOwnerAttentionReport,
  type OwnerAttentionIssue,
  type OwnerAttentionGroup,
} from "@/lib/pricing/owner-attention";
import { formatNumber, formatDateTimeFa } from "@/lib/i18n/formatters";

export const Route = createFileRoute("/_app/pricing/owner-attention")({
  beforeLoad: async () => {
    await requirePermission("pricing", "view");
  },
  component: OwnerAttentionPage,
});

const STOCK_LABEL: Record<string, string> = {
  available: "موجود",
  unavailable: "ناموجود",
  low_stock: "موجودی کم",
  pre_order: "پیش‌سفارش",
};

const ISSUE_LABEL: Record<OwnerAttentionIssue, string> = {
  no_purchase_price: "بدون قیمت خرید",
  unavailable: "ناموجود",
  stale: "بیش از ۲ روز آپدیت‌نشده",
};

type IssueFilter = "all" | OwnerAttentionIssue;

function OwnerAttentionPage() {
  const q = useQuery({
    queryKey: ["owner-attention-report"],
    queryFn: fetchOwnerAttentionReport,
    staleTime: 60_000,
  });

  const [issueFilter, setIssueFilter] = useState<IssueFilter>("all");
  const [ownerFilter, setOwnerFilter] = useState<string>("all");

  const report = q.data;

  const filteredGroups: OwnerAttentionGroup[] = useMemo(() => {
    if (!report) return [];
    let gs = report.groups;
    if (ownerFilter !== "all") gs = gs.filter((g) => g.owner_id === ownerFilter);
    if (issueFilter !== "all") {
      gs = gs
        .map((g) => {
          const products = g.products.filter((p) => p.issues.includes(issueFilter));
          if (products.length === 0) return null;
          return { ...g, products } as OwnerAttentionGroup;
        })
        .filter((g): g is OwnerAttentionGroup => g !== null);
    }
    return gs;
  }, [report, issueFilter, ownerFilter]);

  const downloadCsv = () => {
    if (!report) return;
    const header = ["مسئول", "محصول", "SKU", "وضعیت موجودی", "مشکلات", "روزهای بدون آپدیت"];
    const rows: string[][] = [];
    for (const g of filteredGroups) {
      for (const p of g.products) {
        rows.push([
          g.owner_name,
          p.name,
          p.sku ?? "",
          STOCK_LABEL[p.stock_status] ?? p.stock_status,
          p.issues.map((i) => ISSUE_LABEL[i]).join(" | "),
          String(p.days_since_update ?? ""),
        ]);
      }
    }
    const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const csv = "\uFEFF" + [header, ...rows].map((r) => r.map(escape).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `owner-attention-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="گزارش رسیدگی مسئولان محصول"
        description="محصولات مسئول‌دار که قیمت خرید ندارند، ناموجود شده‌اند، یا بیش از ۲ روز آپدیت نشده‌اند"
        actions={
          <Button
            size="sm"
            variant="outline"
            onClick={downloadCsv}
            disabled={!report || report.total_products === 0}
          >
            <Download className="ms-1 h-3.5 w-3.5" /> دانلود CSV
          </Button>
        }
      />

      {q.isLoading ? (
        <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
          <Loader2 className="ms-2 h-4 w-4 animate-spin" /> در حال بارگذاری گزارش...
        </div>
      ) : !report ? (
        <EmptyState
          icon={AlertCircle}
          title="خطا در بارگذاری گزارش"
          description="لطفاً صفحه را مجدداً بارگذاری کنید."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <SummaryCard
              label="کل محصولات نیازمند رسیدگی"
              value={formatNumber(report.total_products)}
            />
            <SummaryCard
              label="بدون قیمت خرید"
              value={formatNumber(report.total_no_purchase_price)}
              tone="danger"
            />
            <SummaryCard
              label="ناموجود"
              value={formatNumber(report.total_unavailable)}
              tone="danger"
            />
            <SummaryCard
              label={`بیش از ${report.stale_threshold_days} روز آپدیت‌نشده`}
              value={formatNumber(report.total_stale)}
              tone="warn"
            />
          </div>

          {report.truncated && (
            <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              <Info className="h-4 w-4" />
              لیست مالکان به ۵۰۰۰ رکورد محدود شد؛ ممکن است بخشی از داده‌ها نمایش داده نشود.
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">نوع مشکل:</span>
              <Select value={issueFilter} onValueChange={(v) => setIssueFilter(v as IssueFilter)}>
                <SelectTrigger className="h-8 w-[220px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه</SelectItem>
                  <SelectItem value="no_purchase_price">بدون قیمت خرید</SelectItem>
                  <SelectItem value="unavailable">ناموجود</SelectItem>
                  <SelectItem value="stale">بیش از ۲ روز آپدیت‌نشده</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">مسئول:</span>
              <Select value={ownerFilter} onValueChange={setOwnerFilter}>
                <SelectTrigger className="h-8 w-[220px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه مسئولان</SelectItem>
                  {report.groups.map((g) => (
                    <SelectItem key={g.owner_id} value={g.owner_id}>
                      {g.owner_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {filteredGroups.length === 0 ? (
            <EmptyState
              icon={AlertCircle}
              title="موردی برای رسیدگی نیست"
              description="با فیلترهای فعلی محصول مشکل‌داری پیدا نشد."
            />
          ) : (
            <div className="space-y-4">
              {filteredGroups.map((g) => (
                <Card key={g.owner_id}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                    <CardTitle className="text-base">{g.owner_name}</CardTitle>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">کل: {formatNumber(g.products.length)}</Badge>
                      {g.no_purchase_price > 0 && (
                        <Badge variant="destructive">
                          بدون قیمت خرید: {formatNumber(g.no_purchase_price)}
                        </Badge>
                      )}
                      {g.unavailable > 0 && (
                        <Badge variant="destructive">ناموجود: {formatNumber(g.unavailable)}</Badge>
                      )}
                      {g.stale > 0 && (
                        <Badge variant="outline" className="border-amber-500 text-amber-700">
                          کهنه: {formatNumber(g.stale)}
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-right">محصول</TableHead>
                            <TableHead className="text-right">موجودی</TableHead>
                            <TableHead className="text-right">مشکلات</TableHead>
                            <TableHead className="text-right">آخرین آپدیت</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {g.products.map((p) => (
                            <TableRow key={p.id}>
                              <TableCell className="font-medium">
                                <div className="truncate">{p.name}</div>
                                <div className="text-[10px] text-muted-foreground" dir="ltr">
                                  {p.sku ?? "—"}
                                </div>
                              </TableCell>
                              <TableCell className="text-xs">
                                {p.stock_status === "unavailable" ? (
                                  <Badge variant="destructive">
                                    {STOCK_LABEL[p.stock_status] ?? p.stock_status}
                                  </Badge>
                                ) : (
                                  <Badge variant="outline">
                                    {STOCK_LABEL[p.stock_status] ?? p.stock_status}
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-xs">
                                <div className="flex flex-wrap gap-1">
                                  {p.issues.map((i) =>
                                    i === "stale" ? (
                                      <Badge
                                        key={i}
                                        variant="outline"
                                        className="border-amber-500 text-amber-700"
                                      >
                                        {formatNumber(p.days_since_update ?? 0)} روز آپدیت‌نشده
                                      </Badge>
                                    ) : (
                                      <Badge key={i} variant="destructive">
                                        {ISSUE_LABEL[i]}
                                      </Badge>
                                    ),
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-xs">
                                <div>
                                  {p.days_since_update !== null
                                    ? `${formatNumber(p.days_since_update)} روز پیش`
                                    : "—"}
                                </div>
                                <div className="text-[10px] text-muted-foreground">
                                  {formatDateTimeFa(p.last_update_at)}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "warn" | "danger";
}) {
  const cls =
    tone === "danger"
      ? "border-destructive/40"
      : tone === "warn"
        ? "border-amber-500/40"
        : undefined;
  return (
    <Card className={cls}>
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-1 text-lg font-bold text-foreground">{value}</div>
      </CardContent>
    </Card>
  );
}
