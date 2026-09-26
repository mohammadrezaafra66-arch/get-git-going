import { toFaDigits } from "@/lib/i18n/formatters";

const ISO_TS = /^\d{4}-\d{2}-\d{2}(?:T| )/;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function formatDealNumber(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return toFaDigits(n.toLocaleString("en-US")).replace(/,/g, "٬");
}

export function formatDealIrr(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "IRR —";
  return `IRR ${formatDealNumber(n)}`;
}

export function formatDealPercent(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `${formatDealNumber(n)}٪`;
}

export function formatDealDaysAgo(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `${formatDealNumber(n)} روز پیش`;
}

export function formatJalaliDateTimeTehran(input: string | Date | null | undefined): string {
  if (!input) return "—";
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return "—";
  try {
    const parts = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
      timeZone: "Asia/Tehran",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(d);
    const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
    return `${get("year")}/${get("month")}/${get("day")} ${get("hour")}:${get("minute")}`;
  } catch {
    return "—";
  }
}

export function isIsoDateValue(v: string): boolean {
  return ISO_TS.test(v) || ISO_DAY.test(v);
}
