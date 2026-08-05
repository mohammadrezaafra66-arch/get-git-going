import { toFaDigits } from "@/lib/i18n/formatters";

/** Jalali date + Tehran clock from a UTC timestamptz. */
export function formatReleasePublishedAt(input: string | Date | null | undefined): string {
  if (!input) return "—";
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return "—";
  try {
    const datePart = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
      timeZone: "Asia/Tehran",
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(d);
    const timePart = new Intl.DateTimeFormat("fa-IR", {
      timeZone: "Asia/Tehran",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);
    return `${datePart}، ساعت ${timePart}`;
  } catch {
    return "—";
  }
}

export function formatReleaseNumber(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `شماره ${toFaDigits(n)}`;
}

export function shortSha(sha: string | null | undefined): string | null {
  if (!sha) return null;
  return sha.slice(0, 8);
}
