/**
 * نمایش وضعیت موجودی یک پیش‌فاکتور — یک منبع مشترک برای همهٔ مصرف‌کننده‌ها.
 *
 * چرا مشترک: بررسی موجودی از قبل وجود داشت ولی فقط داخل دیالوگ «پذیرش
 * پیش‌فاکتور» رندر می‌شد، و آن دیالوگ را فقط admin/manager باز می‌کند
 * (`update_sales_quote_status` به حسابدار فقط اجازهٔ `rejected` می‌دهد). نتیجه:
 * حسابدار هنگام تصمیم‌گیری هیچ عددی از موجودی نمی‌دید. به‌جای نوشتن یک بررسی
 * موازی، همان RPC و همان رندر اینجا مشترک شد.
 *
 * منبع داده: `check_quote_stock_availability` — موجودی **لحظه‌ای** انبار را
 * می‌خواند، نه عکس لحظهٔ ثبت فروشنده. این عمدی است: بین ثبت فروشنده و تصمیم
 * حسابدار ممکن است موجودی عوض شده باشد و آنچه برای تصمیم اهمیت دارد وضعیت الان است.
 */
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Loader2 } from "lucide-react";

import { checkQuoteStockAvailability, type QuoteStockCheckRow } from "@/lib/warehouses/queries";
import { formatNumber } from "@/lib/i18n/formatters";

export interface QuoteStockAvailability {
  rows: QuoteStockCheckRow[];
  shortages: QuoteStockCheckRow[];
  isLoading: boolean;
}

/** بررسی موجودی یک پیش‌فاکتور. `warehouseId=null` یعنی انبار خودِ سند. */
export function useQuoteStockAvailability(
  quoteId: string,
  warehouseId: string | null,
  enabled: boolean,
): QuoteStockAvailability {
  const query = useQuery({
    queryKey: ["quote-stock-check", quoteId, warehouseId],
    enabled,
    queryFn: () => checkQuoteStockAvailability(quoteId, warehouseId),
    staleTime: 0,
  });
  const rows = query.data ?? [];
  return { rows, shortages: rows.filter((r) => !r.is_sufficient), isLoading: query.isLoading };
}

/** یک خط کمبود، با شکل درخواستی مالک: «۲۰۰ کولر از موجودی انبار مرکزی (۵۰) بیشتر است». */
function shortageLine(s: QuoteStockCheckRow): string {
  return `${formatNumber(s.required)} ${s.product_name} از موجودی انبار «${
    s.warehouse_name ?? "نامشخص"
  }» (${formatNumber(s.available)}) بیشتر است`;
}

export function QuoteStockShortageList({ shortages }: { shortages: QuoteStockCheckRow[] }) {
  return (
    <div className="space-y-1">
      {shortages.map((s) => (
        <div key={`${s.product_id}:${s.warehouse_id ?? "none"}`}>{shortageLine(s)}</div>
      ))}
    </div>
  );
}

/** تفکیک موجودی برای همهٔ ردیف‌ها (نه فقط کمبودها). */
export function QuoteStockBreakdown({ rows }: { rows: QuoteStockCheckRow[] }) {
  return (
    <div className="space-y-1 rounded-md border p-2 text-xs leading-6">
      <div className="font-medium">تفکیک موجودی به‌ازای انبار</div>
      {rows.map((s) => (
        <div
          key={`avail:${s.product_id}:${s.warehouse_id ?? "none"}`}
          className="flex items-center justify-between gap-2"
        >
          <span className="flex-1">
            {s.product_name} — «{s.warehouse_name ?? "نامشخص"}»
          </span>
          <span className={s.is_sufficient ? "text-emerald-600" : "text-destructive"}>
            {formatNumber(s.required)} / {formatNumber(s.available)}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * پنل اطلاع‌رسانی موجودی — **هرگز چیزی را مسدود نمی‌کند**.
 * برای حسابدار/فروشنده روی خودِ صفحهٔ پیش‌فاکتور، پیش از تصمیم تأیید یا رد.
 */
export function QuoteStockAdvisoryPanel({ rows, shortages, isLoading }: QuoteStockAvailability) {
  if (isLoading) {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> بررسی موجودی…
      </p>
    );
  }
  if (rows.length === 0) return null;
  if (shortages.length === 0) return null;

  return (
    <div
      data-testid="quote-stock-advisory"
      className="space-y-2 rounded-md border border-amber-500/50 bg-amber-500/5 p-3 text-xs leading-6"
    >
      <div className="flex items-center gap-2 font-medium text-amber-700 dark:text-amber-500">
        <AlertTriangle className="h-4 w-4" />
        هشدار موجودی — تعداد درخواستی از موجودی انبار بیشتر است
      </div>
      <QuoteStockShortageList shortages={shortages} />
      <div className="text-[11px] text-muted-foreground">
        این فقط یک هشدار است و جلوی تأیید یا رد پیش‌فاکتور را نمی‌گیرد. کسر موجودی در مرحلهٔ
        قطعی‌کردن انجام می‌شود.
      </div>
    </div>
  );
}
