/**
 * Map Postgres/PostgREST business-rule codes to Persian UI copy (CONTRACTS.md).
 */
export function salesDeskErrorMessage(raw: string | null | undefined): string {
  const msg = (raw ?? "").trim();
  if (!msg) return "خطای ناشناخته";
  if (/RESPONSIBLE_REQUIRED/i.test(msg)) return "مسئول معامله الزامی است";
  if (/LOST_REASON_REQUIRED/i.test(msg)) return "دلیل شکست را انتخاب کنید";
  return msg;
}
