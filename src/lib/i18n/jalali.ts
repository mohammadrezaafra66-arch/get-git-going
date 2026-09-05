/**
 * Minimal Jalali (Persian Solar Hijri) ↔ Gregorian conversion.
 * Algorithm by Kazimierz M. Borkowski / Jamshid Borujerdi (public domain).
 * Returns YYYY-MM-DD strings.
 */

function div(a: number, b: number) {
  return Math.floor(a / b);
}

/** Convert Jalali (jy/jm/jd) to Gregorian (gy/gm/gd). */
export function jalaliToGregorian(
  jy: number,
  jm: number,
  jd: number,
): { gy: number; gm: number; gd: number } {
  jy += 1595;
  let days =
    -355668 +
    365 * jy +
    div(jy, 33) * 8 +
    div((jy % 33) + 3, 4) +
    jd +
    (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  let gy = 400 * div(days, 146097);
  days %= 146097;
  if (days > 36524) {
    gy += 100 * div(--days, 36524);
    days %= 36524;
    if (days >= 365) days++;
  }
  gy += 4 * div(days, 1461);
  days %= 1461;
  if (days > 365) {
    gy += div(days - 1, 365);
    days = (days - 1) % 365;
  }
  let gd = days + 1;
  const sal_a = [
    0,
    31,
    (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0 ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  let gm = 0;
  for (gm = 1; gm <= 12 && gd > sal_a[gm]; gm++) gd -= sal_a[gm];
  return { gy, gm, gd };
}

/**
 * Parse a date string that may be Jalali (1300-1499) or Gregorian (19xx-20xx),
 * with /, -, or . separators. Returns ISO YYYY-MM-DD (always Gregorian) or null.
 */
export function parseDateToGregorianIso(input: string | null | undefined): string | null {
  if (!input) return null;
  const s = String(input).trim();
  const m = /^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  if (y >= 1300 && y <= 1499) {
    const { gy, gm, gd } = jalaliToGregorian(y, mo, d);
    return `${gy.toString().padStart(4, "0")}-${gm.toString().padStart(2, "0")}-${gd.toString().padStart(2, "0")}`;
  }
  if (y >= 1900 && y <= 2100) {
    return `${y.toString().padStart(4, "0")}-${mo.toString().padStart(2, "0")}-${d.toString().padStart(2, "0")}`;
  }
  return null;
}

/** Convert Gregorian (gy/gm/gd) to Jalali (jy/jm/jd). */
export function gregorianToJalali(
  gy: number,
  gm: number,
  gd: number,
): { jy: number; jm: number; jd: number } {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let jy = gy <= 1600 ? 0 : 979;
  gy -= gy <= 1600 ? 621 : 1600;
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days =
    365 * gy + div(gy2 + 3, 4) - div(gy2 + 99, 100) + div(gy2 + 399, 400) - 80 + gd + g_d_m[gm - 1];
  jy += 33 * div(days, 12053);
  days %= 12053;
  jy += 4 * div(days, 1461);
  days %= 1461;
  if (days > 365) {
    jy += div(days - 1, 365);
    days = (days - 1) % 365;
  }
  const jm = days < 186 ? 1 + div(days, 31) : 7 + div(days - 186, 30);
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return { jy, jm, jd };
}

const JALALI_MONTH_NAMES_FA = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
];

/**
 * Format an ISO Gregorian date as a Jalali *month*, e.g. "مرداد ۱۴۰۵".
 *
 * D-9 (migration 455) needs this: when a score is read from an older month than the
 * current one, the page has to name that month rather than silently showing a stale
 * number. A bare `YYYY/MM/DD` would be read as "this is today's figure", so the month
 * is spelled out.
 */
export function isoToJalaliMonthDisplay(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return "";
  const { jy, jm } = gregorianToJalali(+m[1], +m[2], +m[3]);
  const name = JALALI_MONTH_NAMES_FA[jm - 1];
  if (!name) return "";
  const faYear = String(jy).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[+d]);
  return `${name} ${faYear}`;
}

/** Format an ISO Gregorian YYYY-MM-DD as Jalali YYYY/MM/DD (Persian digits). */
export function isoToJalaliDisplay(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return "";
  const { jy, jm, jd } = gregorianToJalali(+m[1], +m[2], +m[3]);
  const fa = (n: number, w = 2) =>
    String(n)
      .padStart(w, "0")
      .replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[+d]);
  return `${fa(jy, 4)}/${fa(jm)}/${fa(jd)}`;
}
