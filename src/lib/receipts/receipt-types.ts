/**
 * مورد ۱۳۴ — چهار نوع مستقل فیش واریزی.
 *
 * مقادیر با constraint دیتابیس یکی هستند:
 * `payment_receipts_receipt_type_check` (migration 20260722140000).
 * مقدار قدیمی `payment` توسط همان migration به `invoice_payment` تبدیل شده
 * و دیگر مجاز نیست.
 */

export const RECEIPT_TYPES = [
  "invoice_payment",
  "debt_payment",
  "prepayment",
  "positive_credit",
] as const;

export type ReceiptType = (typeof RECEIPT_TYPES)[number];

export const RECEIPT_TYPE_FA: Record<ReceiptType, string> = {
  invoice_payment: "پرداخت پیش‌فاکتور",
  debt_payment: "پرداخت بدهی",
  prepayment: "پیش‌واریز",
  positive_credit: "اعتبار مثبت مستقل",
};

export const RECEIPT_TYPE_HINT_FA: Record<ReceiptType, string> = {
  invoice_payment: "این فیش باید به یک یا چند پیش‌فاکتور مشتری متصل شود.",
  debt_payment: "برای پرداخت بدهی نیازی به انتخاب پیش‌فاکتور نیست.",
  prepayment: "این مبلغ به عنوان پیش‌واریز مشتری ثبت می‌شود.",
  positive_credit: "این مبلغ به عنوان اعتبار مثبت مستقل برای مشتری ثبت می‌شود.",
};

/** برچسب فارسی نوع فیش؛ برای مقادیر ناشناخته خودِ مقدار برگردانده می‌شود. */
export function receiptTypeLabel(t: string): string {
  return RECEIPT_TYPE_FA[t as ReceiptType] ?? t;
}

/**
 * تنها نوعی که اتصال به پیش‌فاکتور برایش اجباری است. هر جا قبلاً شرط
 * `receipt_type === "payment"` بود و منظورش «پرداخت متصل به پیش‌فاکتور» بود،
 * باید از این تابع استفاده شود.
 */
export function requiresInvoiceLinks(t: string): boolean {
  return t === "invoice_payment";
}
