import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Issue 219 / C2 — the single call site of the central purchase RPC.
 *
 * Purchase registration used to be two independent inserts issued from the
 * browser (purchases, then purchase_items) with nothing joining them. If the
 * second failed, a purchase existed with no line and therefore no stock
 * movement, because the inventory trigger hangs off purchase_items. There was
 * also no protection against a double tap or a retried request.
 *
 * Everything now goes through public.create_purchase, which does both inserts
 * in one transaction. This hook is deliberately the ONLY place that calls it,
 * so a second implementation cannot appear by accident.
 */

export type CreatePurchaseInput = {
  product_id: string;
  payment_term_id: string;
  purchase_price: number;
  currency: "toman" | "usd" | "aed" | "usd_us";
  quantity: number;
  purchase_date: string; // yyyy-MM-dd
  supplier_id?: string | null;
  cash_price?: number | null;
  warehouse_id?: string | null;
  notes?: string | null;
  /** Issue 219 / C3 — links the purchase to a purchase request. */
  request_id?: string | null;
  idempotency_key?: string | null;
};

export type CreatePurchaseResult = {
  created: boolean;
  purchase: {
    id: string;
    short_id: string;
    product_id: string;
    product_name: string | null;
    supplier_id: string | null;
    supplier_name: string | null;
    warehouse_id: string | null;
    warehouse_name: string | null;
    payment_term_id: string | null;
    purchase_price: number;
    cash_price: number | null;
    currency: string;
    quantity: number;
    total_amount: number;
    purchase_date: string;
    status: string;
  };
  item: { id: string; quantity: number; line_total: number };
  request: {
    id: string;
    status: string;
    requested_quantity: number;
    allocated_quantity: number;
    total_allocated: number;
    effective_supplied: number;
    remaining_quantity: number;
    is_over_allocation: boolean;
    unit: string | null;
  } | null;
};

/**
 * Maps backend failures to a Persian sentence the operator can act on.
 *
 * The RPC returns a stable machine code in the PostgreSQL HINT field, so this
 * mapping keys on that rather than on message text — messages can be reworded
 * without silently breaking the mapping. A raw database error is never shown.
 */
const HINT_MESSAGES: Record<string, string> = {
  PURCHASE_NOT_AUTHENTICATED: "نشست شما منقضی شده است. دوباره وارد شوید.",
  PURCHASE_PERMISSION_DENIED: "اجازهٔ ثبت سند خرید ندارید.",
  PURCHASE_REQUEST_LINK_NOT_ENABLED: "اتصال سند خرید به درخواست خرید هنوز فعال نشده است.",
  PURCHASE_PRODUCT_REQUIRED: "انتخاب محصول الزامی است.",
  PURCHASE_PRODUCT_INVALID: "محصول انتخاب‌شده معتبر نیست.",
  PURCHASE_PRODUCT_INACTIVE: "محصول انتخاب‌شده فعال نیست.",
  PURCHASE_PAYMENT_TERM_INVALID: "زمان تسویه انتخاب‌شده معتبر نیست.",
  PURCHASE_PAYMENT_TERM_INACTIVE: "زمان تسویه انتخاب‌شده فعال نیست.",
  PURCHASE_SUPPLIER_INVALID: "تأمین‌کنندهٔ انتخاب‌شده معتبر نیست.",
  PURCHASE_SUPPLIER_INACTIVE: "تأمین‌کنندهٔ انتخاب‌شده فعال نیست.",
  PURCHASE_WAREHOUSE_INVALID: "انبار انتخاب‌شده معتبر نیست.",
  PURCHASE_WAREHOUSE_INACTIVE: "انبار انتخاب‌شده فعال نیست.",
  PURCHASE_CURRENCY_INVALID: "ارز انتخاب‌شده برای سند خرید پشتیبانی نمی‌شود.",
  PURCHASE_PRICE_INVALID: "قیمت خرید باید بزرگ‌تر از صفر باشد.",
  PURCHASE_CASH_PRICE_INVALID: "قیمت نقدی باید بزرگ‌تر از صفر باشد.",
  PURCHASE_QUANTITY_INVALID: "تعداد باید عددی صحیح و حداقل ۱ باشد.",
  PURCHASE_DATE_REQUIRED: "تاریخ خرید الزامی است.",
  PURCHASE_DATE_FUTURE: "تاریخ خرید نمی‌تواند در آینده باشد.",
  PURCHASE_NOTES_TOO_LONG: "توضیحات نمی‌تواند بیش از ۵۰۰ کاراکتر باشد.",
  PURCHASE_IDEMPOTENCY_CONFLICT:
    "این ثبت قبلاً با اطلاعات متفاوتی انجام شده است. صفحه را تازه کنید و دوباره تلاش کنید.",
  PURCHASE_IN_PROGRESS: "ثبت این خرید هم‌اکنون در جریان است. چند لحظه صبر کنید.",
  PURCHASE_ALLOCATION_WITHOUT_REQUEST: "پارامترهای تخصیص بدون درخواست خرید معنا ندارند.",
  // Issue 219 / C3 — request-linking errors
  REQUEST_NOT_FOUND: "درخواست خرید پیدا نشد.",
  REQUEST_NOT_APPROVED: "این درخواست هنوز آماده ثبت خرید نیست.",
  REQUEST_ALREADY_COMPLETED: "این درخواست قبلاً به‌طور کامل تأمین شده است.",
  REQUEST_CANCELLED: "این درخواست لغو شده است.",
  REQUEST_LEGACY_UNKNOWN: "این درخواست قدیمی سند مرتبط قابل اتکا ندارد.",
  NOT_ASSIGNED: "این درخواست به شما تخصیص داده نشده است.",
  PRODUCT_MISMATCH: "محصول خرید با محصول درخواست یکسان نیست.",
  INVALID_ALLOCATION: "مقدار تخصیص معتبر نیست.",
  OVER_ALLOCATION_CONFIRMATION_REQUIRED: "مقدار تخصیص از مقدار باقی‌مانده بیشتر است.",
  OVER_ALLOCATION_NOTE_REQUIRED: "برای تخصیص مازاد باید دلیل ثبت شود.",
};

export function purchaseErrorMessage(err: unknown): string {
  const e = err as { hint?: string; message?: string; code?: string } | null;

  if (e?.hint && HINT_MESSAGES[e.hint]) return HINT_MESSAGES[e.hint];

  // Persian text raised by a database trigger (for example the inventory
  // trigger) is already operator-readable — pass it through.
  if (e?.message && /[؀-ۿ]/.test(e.message)) return e.message;

  // Network / transport failures reach us without a PostgREST code.
  if (!e?.code && e?.message && /fetch|network|timeout|Failed to fetch/i.test(e.message)) {
    return "ارتباط با سرور برقرار نشد. پس از بررسی اتصال، دوباره تلاش کنید.";
  }

  return "ثبت خرید ناموفق بود. لطفاً دوباره تلاش کنید.";
}

export function useCreatePurchase() {
  const queryClient = useQueryClient();

  return useMutation<CreatePurchaseResult, unknown, CreatePurchaseInput>({
    mutationFn: async (input) => {
      const { data, error } = await supabase.rpc("create_purchase", {
        p_product_id: input.product_id,
        p_payment_term_id: input.payment_term_id,
        p_purchase_price: input.purchase_price,
        p_currency: input.currency,
        p_quantity: input.quantity,
        p_purchase_date: input.purchase_date,
        p_supplier_id: input.supplier_id ?? null,
        p_cash_price: input.cash_price ?? null,
        p_warehouse_id: input.warehouse_id ?? null,
        p_notes: input.notes ?? null,
        p_request_id: input.request_id ?? null,
        p_idempotency_key: input.idempotency_key ?? null,
      });
      if (error) throw error;
      return data as unknown as CreatePurchaseResult;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchases"] });
    },
  });
}
