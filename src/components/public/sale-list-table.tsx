import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatNumber, formatCurrency } from "@/lib/i18n/formatters";
import { STOCK_STATUS_LABELS, STOCK_STATUS_VARIANTS, type StockStatus } from "@/lib/products/constants";
import type { PublicSaleListItem } from "@/lib/public/get-public-sale-list";

interface Props {
  items: PublicSaleListItem[];
}

function ChangeCell({ amount, percent }: { amount: number | null; percent: number | null }) {
  if (amount === null || amount === undefined) return <span className="text-muted-foreground">—</span>;
  if (amount === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <Minus className="h-3 w-3" /> بدون تغییر
      </span>
    );
  }
  const positive = amount > 0;
  const Icon = positive ? TrendingUp : TrendingDown;
  const color = positive ? "text-destructive" : "text-emerald-600 dark:text-emerald-400";
  return (
    <span className={`inline-flex items-center gap-1 ${color}`}>
      <Icon className="h-3 w-3" />
      {positive ? "+" : ""}
      {formatNumber(amount)} ت
      {percent !== null && percent !== undefined ? <span className="text-[10px] opacity-80">({formatNumber(percent)}٪)</span> : null}
    </span>
  );
}

export function SaleListTable({ items }: Props) {
  if (items.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
        این لیست در حال حاضر محصولی ندارد.
      </div>
    );
  }

  return (
    <>
      {/* Mobile: card view */}
      <div className="space-y-3 md:hidden">
        {items.map((it) => (
          <div key={it.id} className="rounded-md border border-border bg-card p-3 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-foreground">{it.product_name}</div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                  {it.brand_name ? <span>برند: {it.brand_name}</span> : null}
                  {it.category_name ? <span>دسته: {it.category_name}</span> : null}
                </div>
              </div>
              {it.stock_status ? (
                <Badge variant={STOCK_STATUS_VARIANTS[it.stock_status as StockStatus] ?? "secondary"} className="shrink-0 text-[10px]">
                  {STOCK_STATUS_LABELS[it.stock_status as StockStatus] ?? it.stock_status}
                </Badge>
              ) : null}
            </div>
            <div className="mt-3 flex items-end justify-between border-t border-border pt-2">
              <div>
                <div className="text-[10px] text-muted-foreground">قیمت فروش</div>
                <div className="text-base font-bold text-foreground">{formatCurrency(it.current_price, "تومان")}</div>
              </div>
              <div className="text-left">
                {it.previous_price !== null ? (
                  <div className="text-[10px] text-muted-foreground line-through">{formatCurrency(it.previous_price, "تومان")}</div>
                ) : null}
                <div className="text-[11px]">
                  <ChangeCell amount={it.change_amount} percent={it.change_percent} />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop/tablet: table view */}
      <div className="hidden overflow-x-auto rounded-md border border-border bg-card md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">نام محصول</TableHead>
              <TableHead className="text-right">برند</TableHead>
              <TableHead className="text-right">دسته</TableHead>
              <TableHead className="text-right">قیمت فروش</TableHead>
              <TableHead className="text-right">قیمت قبلی</TableHead>
              <TableHead className="text-right">تغییر</TableHead>
              <TableHead className="text-right">موجودی</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((it) => (
              <TableRow key={it.id}>
                <TableCell className="font-medium">{it.product_name}</TableCell>
                <TableCell className="text-muted-foreground">{it.brand_name ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{it.category_name ?? "—"}</TableCell>
                <TableCell className="font-semibold">{formatCurrency(it.current_price, "تومان")}</TableCell>
                <TableCell className="text-muted-foreground">
                  {it.previous_price !== null ? formatCurrency(it.previous_price, "تومان") : "—"}
                </TableCell>
                <TableCell><ChangeCell amount={it.change_amount} percent={it.change_percent} /></TableCell>
                <TableCell>
                  {it.stock_status ? (
                    <Badge variant={STOCK_STATUS_VARIANTS[it.stock_status as StockStatus] ?? "secondary"} className="text-[10px]">
                      {STOCK_STATUS_LABELS[it.stock_status as StockStatus] ?? it.stock_status}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}