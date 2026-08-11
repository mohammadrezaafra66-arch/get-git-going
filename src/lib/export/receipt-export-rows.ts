import { isoToJalaliDisplay } from "@/lib/i18n/jalali";
import { receiptTypeLabel } from "@/lib/receipts/receipt-types";
import type { ExportRow } from "@/lib/export/export-modes";

/**
 * Phase 11 / decision D8-6 — receipt export rows, extracted from
 * `_app.accounting.receipts.tsx` so that the standard mapping can be tested
 * for byte-equality independently of React.
 *
 * ⚠️ `buildStandardReceiptRows` is a VERBATIM move of the mapping that shipped
 * before this phase — same keys, same order, same coercions, same fallbacks.
 * The phase 11 hard gate is that the existing export is unchanged for the same
 * input, so this function must not be "improved". Anything new belongs in
 * `buildLineDetailReceiptRows`, which only runs when the user opts in.
 */

export const RECEIPT_STATUS_FA: Record<string, string> = {
  pending_review: "در انتظار بررسی",
  approved: "تأییدشده",
  rejected: "ردشده",
};

export type ReceiptExportRecord = {
  id: string;
  amount: number;
  payment_date: string;
  payment_time: string | null;
  receipt_time: string | null;
  tracking_number: string;
  status: string;
  receipt_type: string;
  posting_status: string | null;
  posted_at: string | null;
  description: string | null;
  rejection_reason: string | null;
  bank_name: string | null;
  source_bank: string | null;
  destination_bank: string | null;
  payer_name: string;
  payer_phone: string | null;
  payer_accounting_code: string | null;
  receiver_name: string;
  receiver_phone: string | null;
  receiver_accounting_code: string | null;
  is_mobile_bank_screenshot: boolean | null;
  created_at: string;
  created_by: string | null;
  customer: {
    name: string | null;
    phone: string | null;
    accounting_code: string | null;
  } | null;
  destination_bank_account: { title: string | null } | null;
  // external_parties stores the display name in `full_name`; selecting
  // `name` made the whole export query fail.
  receiver_party: { full_name: string | null } | null;
};

/** One product line of a proforma that a receipt was linked to. */
export type ReceiptLineDetail = {
  receipt_id: string;
  quote_number: string | null;
  product_code: string | null;
  product_name: string | null;
  quantity: number | null;
  unit_price: number | null;
  line_total: number | null;
};

/**
 * The export exactly as it was before phase 11. One row per receipt.
 */
export function buildStandardReceiptRows(
  records: ReceiptExportRecord[],
  creatorMap: Map<string, string>,
): ExportRow[] {
  return records.map((r) => {
    const receiverTarget = r.destination_bank_account?.title
      ? `بانک ما: ${r.destination_bank_account.title}`
      : r.receiver_party?.full_name
        ? `طرف خارجی: ${r.receiver_party.full_name}`
        : r.receiver_name || "—";
    return {
      "تاریخ ثبت (شمسی)": isoToJalaliDisplay(r.created_at?.slice(0, 10)),
      "تاریخ فیش (شمسی)": isoToJalaliDisplay(r.payment_date),
      "ساعت فیش": r.payment_time?.slice(0, 5) ?? "",
      "ثبت‌کننده (کاربر)": (r.created_by && creatorMap.get(r.created_by)) || "—",
      "مشتری مرتبط": r.customer?.name ?? "—",
      "تلفن مشتری": r.customer?.phone ?? "",
      "کد آسان مشتری": r.customer?.accounting_code ?? "",
      "واریزکننده (نام)": r.payer_name,
      "واریزکننده (تلفن)": r.payer_phone ?? "",
      "واریزکننده (کد آسان)": r.payer_accounting_code ?? "",
      "بانک مبدأ": r.source_bank ?? r.bank_name ?? "",
      گیرنده: receiverTarget,
      "گیرنده (نام روی فیش)": r.receiver_name,
      "گیرنده (تلفن)": r.receiver_phone ?? "",
      "گیرنده (کد آسان)": r.receiver_accounting_code ?? "",
      "بانک مقصد": r.destination_bank ?? "",
      "مبلغ (تومان)": Number(r.amount),
      "شماره پیگیری": r.tracking_number,
      "نوع فیش": receiptTypeLabel(r.receipt_type),
      "رسید اسکرین‌شات همراه بانک": r.is_mobile_bank_screenshot ? "بله" : "خیر",
      وضعیت: RECEIPT_STATUS_FA[r.status] ?? r.status,
      "وضعیت ثبت سند": r.posting_status ?? "",
      "تاریخ ثبت سند (شمسی)": r.posted_at ? isoToJalaliDisplay(r.posted_at.slice(0, 10)) : "",
      "علت رد": r.rejection_reason ?? "",
      توضیحات: r.description ?? "",
      "شناسه فیش": r.id,
    };
  });
}

/**
 * Decisions 44–45 — the same export with product line detail appended.
 *
 * A payment receipt has no product lines of its own; the line detail is the
 * proforma content the payment was allocated to, reached through
 * payment_receipt_links -> sales_quotes -> sales_quote_items. That is a real
 * relationship in the schema, not a synthesised one: it answers "what did this
 * payment actually pay for".
 *
 * A receipt with no linked lines still emits exactly one row with the product
 * columns left empty. Dropping it would make the line-detail file quietly
 * smaller than the standard file, and an accountant reconciling totals would
 * find money missing.
 */
export function buildLineDetailReceiptRows(
  records: ReceiptExportRecord[],
  creatorMap: Map<string, string>,
  lines: ReceiptLineDetail[],
): ExportRow[] {
  const byReceipt = new Map<string, ReceiptLineDetail[]>();
  for (const l of lines) {
    const list = byReceipt.get(l.receipt_id);
    if (list) list.push(l);
    else byReceipt.set(l.receipt_id, [l]);
  }

  const base = buildStandardReceiptRows(records, creatorMap);

  return base.flatMap((row, i) => {
    const receiptLines = byReceipt.get(records[i].id) ?? [];
    if (receiptLines.length === 0) {
      return [
        {
          ...row,
          "شماره پیش‌فاکتور": "",
          "کد کالا": "",
          "نام کالا": "",
          تعداد: "",
          "مبلغ فی": "",
          "مبلغ کل ردیف": "",
        },
      ];
    }
    return receiptLines.map((l) => ({
      ...row,
      "شماره پیش‌فاکتور": l.quote_number ?? "",
      "کد کالا": l.product_code ?? "",
      "نام کالا": l.product_name ?? "",
      تعداد: l.quantity ?? "",
      "مبلغ فی": l.unit_price ?? "",
      "مبلغ کل ردیف": l.line_total ?? "",
    }));
  });
}
