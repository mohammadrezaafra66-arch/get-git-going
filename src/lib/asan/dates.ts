/**
 * ASAN M4 — dates in the format Asan reads.
 *
 * Jalali `YYYY/MM/DD`, four-digit year, zero-padded, **Latin digits** — `1405/05/12`.
 *
 * The app's own `isoToJalaliDisplay` emits **Persian** digits, which is right for the UI and
 * wrong for this file. The conversion itself is not duplicated: `gregorianToJalali` is reused
 * and only the formatting differs (rule: extend, do not duplicate).
 *
 * Timezone: the caller passes a date that is already a calendar date in Asia/Tehran. Converting
 * a timestamp to Jalali before shifting it to Tehran is an off-by-one-day bug, so every SQL
 * source for these exports does `AT TIME ZONE 'Asia/Tehran'` then `::date` first.
 */
import { gregorianToJalali } from "@/lib/i18n/jalali";

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/** Fold Persian/Arabic-Indic digits back to Latin. */
export function toAsciiDigits(input: string): string {
  return input.replace(/[۰-۹٠-٩]/g, (d) => {
    const p = "۰۱۲۳۴۵۶۷۸۹".indexOf(d);
    if (p >= 0) return String(p);
    return String("٠١٢٣٤٥٦٧٨٩".indexOf(d));
  });
}

/** ISO `YYYY-MM-DD` (already a Tehran calendar date) → Jalali `YYYY/MM/DD` in Latin digits. */
export function isoToJalaliAsan(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return "";
  const { jy, jm, jd } = gregorianToJalali(+m[1], +m[2], +m[3]);
  return `${pad(jy, 4)}/${pad(jm)}/${pad(jd)}`;
}

/** True for a well-formed Asan date string. Used by the phase tests, not by the builders. */
export function isAsanDate(value: string): boolean {
  return /^\d{4}\/\d{2}\/\d{2}$/.test(value);
}
