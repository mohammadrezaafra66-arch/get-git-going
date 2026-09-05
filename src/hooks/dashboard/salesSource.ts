/**
 * منبع واحد «فروش» برای داشبورد.
 *
 * جدول `invoices` در migration 332 (۱۴۰۵/۰۵/۱۷ — 2026-08-08) حذف شده است و دیگر
 * وجود ندارد؛ پرس‌وجو روی آن خطای 42P01 می‌دهد و *نتیجهٔ خالی برنمی‌گرداند*.
 * تعریف مورد تأیید مالک:
 *
 *   «فروش امروز» = پیش‌فاکتورهایی که همان روز پذیرفته شده‌اند، بر پایهٔ `accepted_at`.
 *
 * مرز روز، روز تقویمی تهران است (`Asia/Tehran`) نه روز محلیِ مرورگر، چون گزارش
 * برای کاربر ایرانی است و ممکن است مرورگر روی منطقهٔ زمانی دیگری باشد.
 */

/** ستون‌های `sales_quotes` که داشبورد از آن‌ها می‌خواند. */
export interface AcceptedQuoteRow {
  final_amount: number | null;
  status: string | null;
  accepted_at: string | null;
}

export interface TodaySalesStats {
  count: number;
  totalAmount: number;
  issuedCount: number;
}

export interface DayBucket {
  /** کلید روز تقویمی تهران به شکل YYYY-MM-DD */
  date: string;
  amount: number;
  count: number;
}

const TEHRAN_TZ = "Asia/Tehran";

const TEHRAN_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: TEHRAN_TZ,
  hour12: false,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** ساعت دیواری تهران برای یک لحظه. */
function tehranWallClock(instant: Date): WallClock {
  const p: Record<string, string> = {};
  for (const part of TEHRAN_PARTS.formatToParts(instant)) {
    if (part.type !== "literal") p[part.type] = part.value;
  }
  // بعضی نسخه‌های ICU نیمه‌شب را با hour12:false به صورت "24" می‌دهند.
  const hour = p.hour === "24" ? 0 : Number(p.hour);
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour,
    minute: Number(p.minute),
    second: Number(p.second),
  };
}

/** کلید روز تقویمی تهران، به شکل YYYY-MM-DD. */
export function tehranDayKey(instant: Date): string {
  const w = tehranWallClock(instant);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${w.year}-${pad(w.month)}-${pad(w.day)}`;
}

/**
 * لحظه‌ای (UTC) که روز تقویمیِ تهرانِ شاملِ `instant` از آن آغاز می‌شود.
 *
 * اختلاف منطقهٔ زمانی از خودِ Intl گرفته می‌شود و در کد ثابت نشده، تا اگر ایران
 * روزی دوباره ساعت تابستانی بگذارد این تابع همچنان درست بماند.
 */
export function tehranDayStart(instant: Date): Date {
  const w = tehranWallClock(instant);
  const wallAsUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  // ساعت دیواری دقت ثانیه دارد؛ میلی‌ثانیهٔ لحظه را حذف می‌کنیم تا اختلاف، دقیقاً
  // اختلافِ منطقهٔ زمانی باشد.
  const offsetMs = wallAsUtc - Math.floor(instant.getTime() / 1000) * 1000;
  return new Date(Date.UTC(w.year, w.month - 1, w.day, 0, 0, 0) - offsetMs);
}

/** بازهٔ [شروع، پایان) روز تقویمی تهران، به صورت ISO، برای فیلتر PostgREST. */
export function tehranDayRange(instant: Date): { startIso: string; endIso: string } {
  const start = tehranDayStart(instant);
  // ۳۰ ساعت جلو می‌رویم و دوباره ابتدای روز را می‌گیریم؛ این کار حتی با تغییر
  // ساعت هم به ابتدای روز بعد می‌رسد، برخلاف «شروع + ۲۴ ساعت».
  const end = tehranDayStart(new Date(start.getTime() + 30 * 3_600_000));
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

/** ابتدای `n` روز تقویمی تهران، از قدیمی‌ترین به جدیدترین، با پایانِ امروز. */
export function lastTehranDayStarts(n: number, now: Date): Date[] {
  const today = tehranDayStart(now);
  const out: Date[] = [];
  for (let i = n - 1; i >= 0; i--) {
    out.push(tehranDayStart(new Date(today.getTime() - i * 24 * 3_600_000)));
  }
  return out;
}

/** جمع‌بندی پیش‌فاکتورهای پذیرفته‌شدهٔ یک روز. */
export function summariseAcceptedQuotes(rows: AcceptedQuoteRow[]): TodaySalesStats {
  return {
    count: rows.length,
    totalAmount: rows.reduce((s, r) => s + Number(r.final_amount ?? 0), 0),
    // `accepted_at` دقیقاً برای همان ردیف‌هایی پر است که status='accepted' دارند
    // (اندازه‌گیری ۱۴۰۵/۰۶/۱۴: ۹ در برابر ۹). این شمارش اگر روزی این دو از هم
    // جدا شدند، همچنان راست می‌ماند.
    issuedCount: rows.filter((r) => r.status === "accepted").length,
  };
}

/** توزیع پیش‌فاکتورهای پذیرفته‌شده روی روزهای تقویمی تهران. */
export function bucketAcceptedByTehranDay(
  rows: AcceptedQuoteRow[],
  dayStarts: Date[],
): DayBucket[] {
  const byDay = new Map<string, { amount: number; count: number }>();
  for (const r of rows) {
    if (!r.accepted_at) continue;
    const key = tehranDayKey(new Date(r.accepted_at));
    const cur = byDay.get(key) ?? { amount: 0, count: 0 };
    cur.amount += Number(r.final_amount ?? 0);
    cur.count += 1;
    byDay.set(key, cur);
  }
  return dayStarts.map((d) => {
    const key = tehranDayKey(d);
    const v = byDay.get(key) ?? { amount: 0, count: 0 };
    return { date: key, amount: v.amount, count: v.count };
  });
}

/**
 * شکل نتیجه‌ای که PostgREST برمی‌گرداند.
 *
 * توابع `fetch*` این ماژول یک «اجراکننده» می‌گیرند نه خود کلاینت را، تا تست بتواند
 * حالت خطا را بدون ساختن کلاینت جعلی بیازماید.
 */
export interface QuoteQueryResult {
  data: AcceptedQuoteRow[] | null;
  error: { message?: string; code?: string; details?: string | null } | null;
}

export type QuoteQueryRunner = () => PromiseLike<QuoteQueryResult>;

/** خطای PostgREST را به یک Error واقعی تبدیل می‌کند تا React Query آن را ببیند. */
export function quoteQueryError(error: NonNullable<QuoteQueryResult["error"]>): Error {
  const code = error.code ? ` [${error.code}]` : "";
  return new Error(`خواندن فروش از sales_quotes ناموفق بود${code}: ${error.message ?? "خطای ناشناخته"}`);
}

/**
 * جمع‌بندی فروش یک روز.
 *
 * خطا **پرتاب می‌شود** و به صفر تبدیل نمی‌شود. نسخهٔ پیشین با
 * `if (error || !data) return { count: 0, ... }` هر خطایی را به صفر تبدیل می‌کرد،
 * و چون `invoices` حذف شده بود کارت «فروش امروز» هفته‌ها یک صفرِ قاطعِ نادرست
 * نشان می‌داد. حالا «امروز فروشی نبوده» (صفر واقعی) و «پرس‌وجو شکست خورد»
 * (isError و data برابر undefined) دو حالت جدا هستند.
 */
export async function fetchTodaySales(run: QuoteQueryRunner): Promise<TodaySalesStats> {
  const { data, error } = await run();
  if (error) throw quoteQueryError(error);
  return summariseAcceptedQuotes(data ?? []);
}

/** توزیع فروش روی روزهای داده‌شده. خطا مثل بالا پرتاب می‌شود، نه بلعیده. */
export async function fetchAcceptedBuckets(
  run: QuoteQueryRunner,
  dayStarts: Date[],
): Promise<DayBucket[]> {
  const { data, error } = await run();
  if (error) throw quoteQueryError(error);
  return bucketAcceptedByTehranDay(data ?? [], dayStarts);
}
