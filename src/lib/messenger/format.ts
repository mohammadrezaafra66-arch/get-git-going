import moment from "moment-jalaali";

let loaded = false;
function ensureLoaded() {
  if (loaded) return;
  moment.loadPersian({ usePersianDigits: true, dialect: "persian-modern" });
  loaded = true;
}

export function formatJalaliDateTime(input: string | Date | null | undefined): string {
  if (!input) return "—";
  ensureLoaded();
  const m = moment(input);
  if (!m.isValid()) return "—";
  return m.format("jYYYY/jMM/jDD HH:mm");
}

export function formatJalaliTime(input: string | Date | null | undefined): string {
  if (!input) return "—";
  ensureLoaded();
  const m = moment(input);
  if (!m.isValid()) return "—";
  return m.format("HH:mm");
}

export function formatJalaliRelative(input: string | Date | null | undefined): string {
  if (!input) return "—";
  ensureLoaded();
  const m = moment(input);
  if (!m.isValid()) return "—";
  const today = moment();
  if (m.format("jYYYY-jMM-jDD") === today.format("jYYYY-jMM-jDD")) return m.format("HH:mm");
  return m.format("jYYYY/jMM/jDD");
}

// تفاوت زمانی فارسی نسبت به اکنون — ورودی همان timestamp سرور است
// هیچ محاسبه‌ای روی Date.now() ذخیره نمی‌کند؛ فقط در لحظهٔ رندر فراخوانی می‌شود
export function formatJalaliFromNow(input: string | Date | null | undefined): string {
  if (!input) return "—";
  ensureLoaded();
  const m = moment(input);
  if (!m.isValid()) return "—";
  return m.fromNow();
}