import { formatJalaliFromNow } from "@/lib/messenger/format";

const FA_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

export function toPersianDigits(s: string | number | null | undefined): string {
  if (s === null || s === undefined) return "—";
  return String(s).replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]);
}

export function formatTomanFa(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return toPersianDigits(Math.round(n).toLocaleString("en-US"));
}

/** زمان نسبی فارسی نسبت به اکنون. */
export function timeAgoFa(input: string | Date | null | undefined): string {
  return formatJalaliFromNow(input);
}

/** ابتدای امروز بر اساس ساعت محلی به صورت ISO. */
export function startOfTodayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/** ابتدای روز محلی برای یک Date به صورت ISO. */
export function startOfDayIso(d: Date): string {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.toISOString();
}

/** ابتدای روز بعدی محلی برای یک Date به صورت ISO. */
export function startOfNextDayIso(d: Date): string {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() + 1);
  return x.toISOString();
}