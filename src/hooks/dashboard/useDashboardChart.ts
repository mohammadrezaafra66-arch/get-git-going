import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import moment from "moment-jalaali";
import {
  fetchAcceptedBuckets,
  lastTehranDayStarts,
  type QuoteQueryResult,
  type QuoteQueryRunner,
} from "./salesSource";

const COMMON = { staleTime: 60_000, refetchInterval: 120_000, retry: false } as const;

export interface SalesChartPoint {
  /** ISO date (YYYY-MM-DD) — روز تقویمی تهران */
  date: string;
  /** Jalali label e.g. ۱۴۰۴/۰۳/۲۸ */
  label: string;
  amount: number;
  count: number;
}

/** تعداد روزهای نمودار. */
const WINDOW_DAYS = 7;

/**
 * فروش ۷ روز گذشته به تفکیک روز تقویمی تهران.
 *
 * منبع `sales_quotes` است و نه `invoices`؛ آن جدول در migration 332 حذف شده و
 * پرس‌وجو روی آن خطای 42P01 می‌دهد. نسخهٔ پیشین آن خطا را می‌گرفت و به‌جایش
 * یک سری هفت‌روزهٔ کاملاً صفر می‌ساخت — داده‌ای که وجود نداشت و از دادهٔ واقعیِ
 * صفر قابل تشخیص نبود. حالا خطا پرتاب می‌شود و به `isError` می‌رسد.
 */
export async function fetchSalesChart(
  run: QuoteQueryRunner,
  dayStarts: Date[],
): Promise<SalesChartPoint[]> {
  const buckets = await fetchAcceptedBuckets(run, dayStarts);
  return buckets.map((b) => ({ ...b, label: toJalaliShort(b.date) }));
}

export function useSalesChart7d() {
  return useQuery<SalesChartPoint[]>({
    ...COMMON,
    queryKey: ["dash", "sales-chart-7d"],
    queryFn: () => {
      const dayStarts = lastTehranDayStarts(WINDOW_DAYS, new Date());
      const fromIso = dayStarts[0].toISOString();
      return fetchSalesChart(
        () =>
        // types.ts هنوز `accepted_at` را ندارد؛ ستون در دیتابیس زنده هست.
        // cast در همین مرز انجام می‌شود و شکل واقعی در QuoteQueryResult صریح است.
          supabase
            .from("sales_quotes")
            .select("final_amount, status, accepted_at")
            .gte("accepted_at", fromIso) as unknown as PromiseLike<QuoteQueryResult>,
        dayStarts,
      );
    },
  });
}

let loaded = false;
/**
 * برچسب جلالی از روی کلید روز تقویمی تهران.
 *
 * ورودی رشتهٔ YYYY-MM-DD است و نه یک Date، چون moment یک Date را در منطقهٔ زمانی
 * *محلی* قالب‌بندی می‌کند و اگر مرورگر عقب‌تر از تهران باشد برچسب یک روز جابه‌جا
 * می‌شد.
 */
function toJalaliShort(dayKey: string): string {
  if (!loaded) {
    moment.loadPersian({ usePersianDigits: true, dialect: "persian-modern" });
    loaded = true;
  }
  return moment(dayKey, "YYYY-MM-DD").format("jMM/jDD");
}
