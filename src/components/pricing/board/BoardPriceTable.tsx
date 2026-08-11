import { ArrowDownRight, ArrowUpRight, Eye, Minus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatNumber, formatDateTimeFa, toFaDigits } from "@/lib/i18n/formatters";
import type { BoardPriceItem } from "@/hooks/pricing/useAminHozoorBoardPrices";

interface Props {
  items: BoardPriceItem[];
  kioskMode: boolean;
  onOpenDetails: (productId: string) => void;
  startIndex: number;
}

export function BoardPriceTable({ items, kioskMode, onOpenDetails, startIndex }: Props) {
  const baseText = kioskMode ? "text-base" : "text-sm";
  const priceText = kioskMode ? "text-2xl font-extrabold" : "text-lg font-bold";
  const rowPad = kioskMode ? "py-4" : "py-2.5";

  return (
    <>
      {/* Desktop / large */}
      <div className="hidden md:block">
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className={`w-full ${baseText}`}>
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-right">ردیف</th>
                    <th className="px-3 py-2 text-right">نام محصول</th>
                    <th className="px-3 py-2 text-right">برند</th>
                    <th className="px-3 py-2 text-right">دسته</th>
                    <th className="px-3 py-2 text-right">SKU</th>
                    <th className="px-3 py-2 text-right">موجودی</th>
                    <th className="px-3 py-2 text-right">قیمت قبلی</th>
                    <th className="px-3 py-2 text-right">قیمت فعلی</th>
                    <th className="px-3 py-2 text-right">تغییر</th>
                    <th className="px-3 py-2 text-right">آخرین به‌روزرسانی</th>
                    <th className="px-3 py-2 text-right">جزئیات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {items.map((it, idx) => (
                    <BoardRow
                      key={it.product.id}
                      it={it}
                      index={startIndex + idx}
                      onOpen={() => onOpenDetails(it.product.id)}
                      priceText={priceText}
                      rowPad={rowPad}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Mobile cards */}
      <div className="grid gap-2 md:hidden">
        {items.map((it, idx) => (
          <Card key={it.product.id}>
            <CardContent className="space-y-2 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs text-muted-foreground">
                    ردیف {toFaDigits(startIndex + idx)}
                  </div>
                  <div className="truncate font-semibold">{it.product.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {it.product.brand?.name ?? "—"} • {it.product.category?.name ?? "—"}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onOpenDetails(it.product.id)}
                  aria-label="جزئیات"
                >
                  <Eye className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex items-center justify-between">
                <PriceCell it={it} priceText="text-base font-bold" />
                <ChangeCell it={it} />
              </div>
              <div className="text-[11px] text-muted-foreground">
                {formatDateTimeFa(it.last_updated_at)}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}

function BoardRow({
  it,
  index,
  onOpen,
  priceText,
  rowPad,
}: {
  it: BoardPriceItem;
  index: number;
  onOpen: () => void;
  priceText: string;
  rowPad: string;
}) {
  return (
    <tr className="hover:bg-muted/30">
      <td className={`px-3 ${rowPad} text-muted-foreground`}>{toFaDigits(index)}</td>
      <td className={`px-3 ${rowPad} font-medium`}>{it.product.name}</td>
      <td className={`px-3 ${rowPad}`}>{it.product.brand?.name ?? "—"}</td>
      <td className={`px-3 ${rowPad}`}>{it.product.category?.name ?? "—"}</td>
      <td className={`px-3 ${rowPad} font-mono text-xs`}>{it.product.sku ?? "—"}</td>
      <td className={`px-3 ${rowPad}`}>
        <StockBadge status={it.product.stock_status} />
      </td>
      <td className={`px-3 ${rowPad} text-muted-foreground`}>
        {it.previous_price !== null ? `${formatNumber(it.previous_price)}` : "—"}
      </td>
      <td className={`px-3 ${rowPad}`}>
        <PriceCell it={it} priceText={priceText} />
      </td>
      <td className={`px-3 ${rowPad}`}>
        <ChangeCell it={it} />
      </td>
      <td className={`px-3 ${rowPad} text-xs text-muted-foreground`}>
        {formatDateTimeFa(it.last_updated_at)}
      </td>
      <td className={`px-3 ${rowPad}`}>
        <Button size="sm" variant="ghost" onClick={onOpen} aria-label="جزئیات">
          <Eye className="h-4 w-4" />
        </Button>
      </td>
    </tr>
  );
}

function PriceCell({ it, priceText }: { it: BoardPriceItem; priceText: string }) {
  if (!it.has_price || it.current_price === null) {
    return <span className="text-xs text-muted-foreground">قیمت معتبر ندارد</span>;
  }
  return (
    <span className={priceText}>
      {formatNumber(it.current_price)}
      <span className="mr-1 text-xs font-normal text-muted-foreground">ت</span>
    </span>
  );
}

function ChangeCell({ it }: { it: BoardPriceItem }) {
  if (!it.has_price) return <span className="text-xs text-muted-foreground">—</span>;
  const pct = it.change_percent;
  const amt = it.change_amount;
  if ((pct === null || pct === 0) && (amt === null || amt === 0)) {
    return (
      <Badge variant="secondary" className="gap-1">
        <Minus className="h-3 w-3" /> بدون تغییر
      </Badge>
    );
  }
  const positive = (pct ?? amt ?? 0) > 0;
  const pctText =
    pct !== null
      ? Math.abs(pct) > 999
        ? `${positive ? "+" : "-"}۹۹۹٪+`
        : `${positive ? "+" : ""}${formatNumber(pct)}٪`
      : null;
  return (
    <Badge variant={positive ? "default" : "destructive"} className="gap-1">
      {positive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {pctText !== null ? pctText : `${positive ? "+" : ""}${formatNumber(amt!)}`}
    </Badge>
  );
}

function StockBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    available: { label: "موجود", cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
    limited: { label: "محدود", cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  };
  const v = map[status] ?? { label: status, cls: "bg-muted text-muted-foreground" };
  return <span className={`rounded px-1.5 py-0.5 text-[10px] ${v.cls}`}>{v.label}</span>;
}
