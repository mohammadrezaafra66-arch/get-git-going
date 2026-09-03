// دفتر اسناد — the register over the three recorded document types.
//
// Source of truth is the database view public.v_documents_unified (migration 422), which unions
// payment_receipts, payment_vouchers and dual_documents. The view carries security_invoker=true, so
// the caller's own RLS on each source table decides what comes back — admin, manager and accountant
// see rows, everyone else sees none.
//
// The type filter is a QUERY PARAMETER, not a client-side pass: `doc_type` is pushed down to
// PostgREST as `doc_type=eq.…`, so the database does the narrowing. The same is true of the date
// range. Nothing is fetched and then discarded in the browser.

import { supabase } from "@/integrations/supabase/client";
import { gregorianToJalali, isoToJalaliDisplay } from "@/lib/i18n/jalali";

/** The four states of the type control. `all` is the default and pushes no doc_type predicate. */
export type DocumentTypeFilter = "all" | "receipt" | "payment" | "dual";

export type DocumentRegisterRow = {
  doc_type: "receipt" | "payment" | "dual";
  doc_id: string;
  document_number: string | null;
  doc_date: string | null; // ISO Gregorian, as the view returns it
  channel: string | null;
  party_name: string | null;
  party_payer_name: string | null;
  party_beneficiary_name: string | null;
  asan_code: string | null;
  amount: number | string | null; // TOMAN, exactly as the source tables store it
  bank_account: string | null;
  tracking_number: string | null;
  description: string | null;
  status: string | null;
  reversed: boolean | null;
  created_at: string | null;
};

/** Persian labels. `doc_type` values come from the RPCs; only the display text is added here. */
export const DOC_TYPE_FA: Record<DocumentRegisterRow["doc_type"], string> = {
  receipt: "دریافت",
  payment: "پرداخت",
  dual: "سند دوبل",
};

/** The four filter options, in the order the owner asked for them. */
export const DOC_TYPE_FILTERS: { value: DocumentTypeFilter; label: string }[] = [
  { value: "all", label: "همه" },
  { value: "receipt", label: "دریافت" },
  { value: "payment", label: "پرداخت" },
  { value: "dual", label: "سند دوبل" },
];

const STATUS_FA: Record<string, string> = {
  approved: "تأیید شده",
  pending_review: "در انتظار بررسی",
  rejected: "رد شده",
  draft: "پیش‌نویس",
};

export function statusLabel(status: string | null | undefined): string {
  if (!status) return "";
  return STATUS_FA[status] ?? status;
}

/** A dual document has no channel of ours — the money never lands in our account (T12). */
const CHANNEL_FA_LOCAL: Record<string, string> = {
  card_to_card: "کارت به کارت",
  paya: "پایا",
  pol: "پل",
  satna: "ساتنا",
  cash: "نقدی",
  cheque: "چک",
  other: "سایر",
};

export function channelLabel(channel: string | null | undefined): string {
  if (!channel) return "";
  return CHANNEL_FA_LOCAL[channel] ?? channel;
}

/**
 * Read the register. Both filters are pushed into the query.
 *
 * The limit mirrors the receipts exporter's 5000 and exists so a mis-set date range cannot pull the
 * whole table into the browser. The register is meant to answer "what was recorded today", which is
 * inherently small; if a range ever exceeds the cap the page says so rather than silently truncating.
 */
export const DOCUMENT_REGISTER_LIMIT = 5000;

export async function fetchDocumentRegister(params: {
  fromDate?: string | null;
  toDate?: string | null;
  docType?: DocumentTypeFilter;
}): Promise<DocumentRegisterRow[]> {
  let q = supabase
    .from("v_documents_unified")
    .select(
      "doc_type, doc_id, document_number, doc_date, channel, party_name, party_payer_name, party_beneficiary_name, asan_code, amount, bank_account, tracking_number, description, status, reversed, created_at",
    )
    .order("doc_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(DOCUMENT_REGISTER_LIMIT);

  // Pushed down, not filtered in the browser.
  if (params.fromDate) q = q.gte("doc_date", params.fromDate);
  if (params.toDate) q = q.lte("doc_date", params.toDate);
  if (params.docType && params.docType !== "all") q = q.eq("doc_type", params.docType);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as DocumentRegisterRow[];
}

// ---------------------------------------------------------------------------------------------
// Excel
// ---------------------------------------------------------------------------------------------

/**
 * The eleven columns the owner specified, in order.
 *
 * Two rules the owner stated explicitly and that the tests assert:
 *   • amounts are NUMBERS, not formatted strings, so Excel can sum the column. The view stores
 *     Toman; «مبلغ (ریال)» means the conversion (×10) happens here, at the edge that names the unit.
 *   • an empty cell is empty — "" — never the string "null" and never "—".
 */
export const DOCUMENT_EXPORT_HEADERS = [
  "شماره سند",
  "تاریخ",
  "نوع سند",
  "کانال",
  "طرف حساب",
  "کد آسان",
  "مبلغ (ریال)",
  "حساب بانکی / صندوق",
  "شماره پیگیری",
  "شرح",
  "وضعیت",
] as const;

const s = (v: string | null | undefined): string => (v == null ? "" : String(v));

export function buildDocumentExportRows(
  rows: DocumentRegisterRow[],
): Record<string, string | number>[] {
  return rows.map((r) => {
    const toman = r.amount == null ? null : Number(r.amount);
    return {
      "شماره سند": s(r.document_number),
      // Jalali, using the same helper the receipts exporter uses, so the two files agree.
      "تاریخ": r.doc_date ? isoToJalaliDisplay(r.doc_date) : "",
      "نوع سند": DOC_TYPE_FA[r.doc_type] ?? r.doc_type,
      "کانال": channelLabel(r.channel),
      "طرف حساب": s(r.party_name),
      "کد آسان": s(r.asan_code),
      // Toman → rial. Number, not string: the column must be summable.
      "مبلغ (ریال)": toman == null || Number.isNaN(toman) ? "" : toman * 10,
      "حساب بانکی / صندوق": s(r.bank_account),
      "شماره پیگیری": s(r.tracking_number),
      "شرح": s(r.description),
      "وضعیت": statusLabel(r.status),
    };
  });
}

/** `1405-06-12` — Jalali, Latin digits, because Persian digits in a filename travel badly. */
function jalaliFileStamp(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const { jy, jm, jd } = gregorianToJalali(+m[1], +m[2], +m[3]);
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(jy, 4)}-${p(jm)}-${p(jd)}`;
}

/**
 * اسناد_<from>_<to>.xlsx, or اسناد_<date>.xlsx when both ends are the same day.
 * With no range set at all, the file is stamped with today, so two exports never collide silently.
 */
export function documentExportFilename(
  fromDate: string | null | undefined,
  toDate: string | null | undefined,
): string {
  const from = fromDate ? jalaliFileStamp(fromDate) : null;
  const to = toDate ? jalaliFileStamp(toDate) : null;
  if (from && to) return from === to ? `اسناد_${from}.xlsx` : `اسناد_${from}_${to}.xlsx`;
  const one = from ?? to ?? jalaliFileStamp(new Date().toISOString().slice(0, 10));
  return `اسناد_${one}.xlsx`;
}
