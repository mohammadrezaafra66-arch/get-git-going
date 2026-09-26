import { toFaDigits } from "@/lib/i18n/formatters";

const FA = "۰۱۲۳۴۵۶۷۸۹";
const AR = "٠١٢٣٤٥٦٧٨٩";

export function parseDealAmountDigits(raw: string): string {
  let out = "";
  for (const ch of raw) {
    const fa = FA.indexOf(ch);
    if (fa >= 0) {
      out += String(fa);
      continue;
    }
    const ar = AR.indexOf(ch);
    if (ar >= 0) {
      out += String(ar);
      continue;
    }
    if (ch >= "0" && ch <= "9") out += ch;
  }
  return out;
}

export function formatDealAmountInput(raw: string): string {
  const digits = parseDealAmountDigits(raw);
  if (!digits) return "";
  return toFaDigits(Number(digits).toLocaleString("en-US")).replace(/,/g, "٬");
}

export function dealAmountNumber(raw: string): number | null {
  const digits = parseDealAmountDigits(raw);
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}
