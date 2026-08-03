import type { Database } from "@/integrations/supabase/types";

export type SalesQuoteStatus = Database["public"]["Enums"]["sales_quote_status"];
export type SalesQuoteItemSource = Database["public"]["Enums"]["sales_quote_item_source"];

export const SALES_QUOTE_STATUS_LABELS: Record<SalesQuoteStatus, string> = {
  draft: "پیش‌نویس",
  sent: "ارسال‌شده",
  accepted: "پذیرفته‌شده",
  rejected: "ردشده",
  canceled: "لغوشده",
};

export const SALES_QUOTE_SOURCE_LABELS: Record<SalesQuoteItemSource, string> = {
  product_price: "از قیمت محصول",
  quick_price: "از محاسبه سریع",
  manual: "آیتم آزاد",
};

export const SALES_QUOTES_PAGE_SIZE = 20;

export interface DraftQuoteItem {
  /** کلید موقت سمت کلاینت */
  key: string;
  source: SalesQuoteItemSource;
  product_id: string | null;
  free_item_name: string | null;
  sku_snapshot: string | null;
  title_snapshot: string;
  sale_price_type_id: string | null;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  /**
   * D8-8 (274/275): the warehouse this LINE is drawn from, so one proforma can
   * pull from several warehouses. `null` means "use the document's warehouse",
   * which keeps the common single-warehouse case exactly as cheap to fill in as
   * it was — the selector defaults to null, not to a warehouse the user must
   * confirm on every line.
   */
  warehouse_id?: string | null;
}

export function lineTotal(
  item: Pick<DraftQuoteItem, "quantity" | "unit_price" | "discount_amount">,
): number {
  const gross = (item.quantity || 0) * (item.unit_price || 0);
  const disc = item.discount_amount || 0;
  return Math.max(0, gross - disc);
}

export function computeTotals(items: DraftQuoteItem[]): {
  subtotal_amount: number;
  discount_amount: number;
  final_amount: number;
} {
  let subtotal = 0;
  let discount = 0;
  let final = 0;
  for (const it of items) {
    subtotal += (it.quantity || 0) * (it.unit_price || 0);
    discount += it.discount_amount || 0;
    final += lineTotal(it);
  }
  return {
    subtotal_amount: Math.round(subtotal),
    discount_amount: Math.round(discount),
    final_amount: Math.round(final),
  };
}

const PHONE_RE = /^[0-9+\-\s]{4,}$/;

export interface QuoteHeaderInput {
  customer_name: string;
  customer_phone: string;
  customer_note?: string | null;
  expires_at?: string | null;
}

export interface QuoteValidationError {
  field: string;
  message: string;
}

export function validateQuote(
  header: QuoteHeaderInput,
  items: DraftQuoteItem[],
): QuoteValidationError[] {
  const errs: QuoteValidationError[] = [];
  const name = header.customer_name?.trim() ?? "";
  if (name.length < 2)
    errs.push({ field: "customer_name", message: "نام مشتری باید حداقل ۲ کاراکتر باشد." });
  if (name.length > 200)
    errs.push({ field: "customer_name", message: "نام مشتری حداکثر ۲۰۰ کاراکتر." });

  const phone = header.customer_phone?.trim() ?? "";
  if (!phone) errs.push({ field: "customer_phone", message: "شماره تماس مشتری الزامی است." });
  else if (!PHONE_RE.test(phone))
    errs.push({ field: "customer_phone", message: "شماره تماس نامعتبر است." });

  if (header.expires_at) {
    const d = new Date(header.expires_at);
    if (Number.isNaN(d.getTime())) {
      errs.push({ field: "expires_at", message: "تاریخ اعتبار نامعتبر است." });
    } else {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (d.getTime() <= today.getTime()) {
        errs.push({ field: "expires_at", message: "تاریخ اعتبار باید بعد از امروز باشد." });
      }
    }
  }

  if (items.length === 0) {
    errs.push({ field: "items", message: "حداقل یک آیتم برای ثبت پیش‌فاکتور لازم است." });
  }

  items.forEach((it, idx) => {
    if (it.source === "product_price" && !it.product_id) {
      errs.push({
        field: `items.${idx}.product_id`,
        message: `آیتم ${idx + 1}: محصول انتخاب نشده است.`,
      });
    }
    if (
      (it.source === "manual" || it.source === "quick_price") &&
      !(it.free_item_name && it.free_item_name.trim().length > 0)
    ) {
      errs.push({
        field: `items.${idx}.free_item_name`,
        message: `آیتم ${idx + 1}: نام کالا الزامی است.`,
      });
    }
    if (!(it.quantity > 0)) {
      errs.push({
        field: `items.${idx}.quantity`,
        message: `آیتم ${idx + 1}: تعداد باید بزرگ‌تر از صفر باشد.`,
      });
    }
    if (!(it.unit_price > 0)) {
      errs.push({
        field: `items.${idx}.unit_price`,
        message: `آیتم ${idx + 1}: قیمت واحد باید بزرگ‌تر از صفر باشد.`,
      });
    }
    if (it.discount_amount < 0) {
      errs.push({
        field: `items.${idx}.discount_amount`,
        message: `آیتم ${idx + 1}: تخفیف نمی‌تواند منفی باشد.`,
      });
    }
    if (it.discount_amount > it.quantity * it.unit_price) {
      errs.push({
        field: `items.${idx}.discount_amount`,
        message: `آیتم ${idx + 1}: تخفیف از مبلغ خط بیشتر است.`,
      });
    }
  });

  return errs;
}
