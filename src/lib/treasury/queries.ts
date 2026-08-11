import { supabase } from "@/integrations/supabase/client";

/**
 * Phase 9 — خزانه (۱۸۰/۱۸۱/۱۸۲).
 * ماندهٔ حساب و گزارش ورود/خروج از RPCهای `SECURITY DEFINER` خوانده می‌شوند
 * (الگوی امن گزارش مالی: چک `has_any_role` سمت DB).
 */

export type AccountType = "bank" | "cash";

export const ACCOUNT_TYPE_FA: Record<AccountType, string> = {
  bank: "حساب بانکی",
  cash: "صندوق نقدی",
};

export type PayeeType = "supplier" | "external_party" | "customer" | "other";

export const PAYEE_TYPE_FA: Record<PayeeType, string> = {
  supplier: "تأمین‌کننده",
  external_party: "طرف حساب خارجی",
  customer: "مشتری",
  other: "سایر",
};

/** کانال‌های سند — همان مقادیر CHECK دیتابیس (migration 212). */
export const VOUCHER_CHANNELS: { value: string; label: string }[] = [
  { value: "card_to_card", label: "کارت به کارت" },
  { value: "paya", label: "پایا" },
  { value: "pol", label: "پل" },
  { value: "satna", label: "ساتنا" },
  { value: "cash", label: "نقدی" },
  { value: "cheque", label: "چک" },
  { value: "other", label: "سایر" },
];

export const CHANNEL_FA: Record<string, string> = Object.fromEntries(
  VOUCHER_CHANNELS.map((c) => [c.value, c.label]),
);

type RpcFn = (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

const rpc = supabase.rpc as unknown as RpcFn;

export type AccountBalance = {
  account_id: string;
  title: string;
  bank_name: string;
  account_type: AccountType;
  currency: string;
  is_active: boolean;
  opening_balance: number;
  total_in: number;
  total_out: number;
  current_balance: number;
  in_count: number;
  out_count: number;
};

export async function fetchAccountBalances(opts?: {
  accountType?: AccountType | null;
  includeInactive?: boolean;
}): Promise<AccountBalance[]> {
  const { data, error } = await rpc("get_account_balances", {
    p_account_type: opts?.accountType ?? null,
    p_include_inactive: opts?.includeInactive ?? false,
  });
  if (error) throw new Error(error.message);
  return (data as AccountBalance[] | null) ?? [];
}

export type LedgerEntry = {
  entry_id: string;
  entry_kind: "in" | "out";
  entry_date: string;
  document_number: string | null;
  counterparty: string | null;
  document_channel: string | null;
  amount: number;
  signed_amount: number;
  running_balance: number;
  description: string | null;
};

/** ۱۸۲ — گزارش دوطرفهٔ یک حساب در بازهٔ تاریخ، با ماندهٔ تجمعی. */
export async function fetchAccountLedger(
  accountId: string,
  fromDate?: string | null,
  toDate?: string | null,
): Promise<LedgerEntry[]> {
  const { data, error } = await rpc("get_account_ledger", {
    p_account_id: accountId,
    p_from_date: fromDate ?? null,
    p_to_date: toDate ?? null,
  });
  if (error) throw new Error(error.message);
  return (data as LedgerEntry[] | null) ?? [];
}

export type PaymentVoucher = {
  id: string;
  voucher_number: string | null;
  amount: number;
  payment_date: string;
  payee_type: PayeeType;
  payee_name: string | null;
  document_channel: string;
  source_bank_account_id: string;
  tracking_number: string | null;
  cheque_number: string | null;
  cheque_due_date: string | null;
  description: string | null;
  status: string;
  purchase_id: string | null;
  created_at: string;
  source_account_title: string | null;
  supplier_name: string | null;
  party_name: string | null;
  customer_name: string | null;
};

export async function fetchPaymentVouchers(filters?: {
  fromDate?: string | null;
  toDate?: string | null;
  accountId?: string | null;
  limit?: number;
}): Promise<PaymentVoucher[]> {
  let q = supabase
    .from("payment_vouchers")
    .select(
      `id, voucher_number, amount, payment_date, payee_type, payee_name, document_channel,
       source_bank_account_id, tracking_number, cheque_number, cheque_due_date, description,
       status, purchase_id, created_at,
       account:bank_accounts(title), supplier:suppliers(name),
       party:external_parties(full_name), customer:customers(name)`,
    )
    .order("payment_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(filters?.limit ?? 200);

  if (filters?.accountId) q = q.eq("source_bank_account_id", filters.accountId);
  if (filters?.fromDate) q = q.gte("payment_date", filters.fromDate);
  if (filters?.toDate) q = q.lte("payment_date", filters.toDate);

  const { data, error } = await q;
  if (error) throw error;

  return (
    (data ?? []) as unknown as Array<
      PaymentVoucher & {
        account: { title: string } | null;
        supplier: { name: string } | null;
        party: { full_name: string } | null;
        customer: { name: string } | null;
      }
    >
  ).map((r) => ({
    ...r,
    source_account_title: r.account?.title ?? null,
    supplier_name: r.supplier?.name ?? null,
    party_name: r.party?.full_name ?? null,
    customer_name: r.customer?.name ?? null,
  }));
}

/** نام دریافت‌کننده برای نمایش، بر اساس نوعش. */
export function voucherPayeeLabel(v: PaymentVoucher): string {
  return v.supplier_name ?? v.party_name ?? v.customer_name ?? v.payee_name ?? "—";
}

export type CreateVoucherInput = {
  amount: number;
  paymentDate: string;
  payeeType: PayeeType;
  payeeSupplierId?: string | null;
  payeePartyId?: string | null;
  payeeCustomerId?: string | null;
  payeeName?: string | null;
  documentChannel: string;
  sourceBankAccountId: string;
  trackingNumber?: string | null;
  chequeNumber?: string | null;
  chequeDueDate?: string | null;
  description?: string | null;
};

export async function createPaymentVoucher(
  input: CreateVoucherInput,
  createdBy: string,
): Promise<string> {
  const isCheque = input.documentChannel === "cheque";
  const { data, error } = await supabase
    .from("payment_vouchers")
    .insert({
      amount: input.amount,
      payment_date: input.paymentDate,
      payee_type: input.payeeType,
      // The DB CHECK requires exactly the id matching payee_type, so null the rest.
      payee_supplier_id: input.payeeType === "supplier" ? input.payeeSupplierId : null,
      payee_party_id: input.payeeType === "external_party" ? input.payeePartyId : null,
      payee_customer_id: input.payeeType === "customer" ? input.payeeCustomerId : null,
      payee_name: input.payeeType === "other" ? input.payeeName?.trim() || null : null,
      document_channel: input.documentChannel,
      source_bank_account_id: input.sourceBankAccountId,
      tracking_number: input.trackingNumber?.trim() || null,
      cheque_number: isCheque ? input.chequeNumber?.trim() || null : null,
      cheque_due_date: isCheque ? input.chequeDueDate || null : null,
      description: input.description?.trim() || null,
      status: "approved",
      created_by: createdBy,
    } as never)
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export type ExternalPartyOption = {
  id: string;
  full_name: string;
  phone: string | null;
  accounting_code: string | null;
};

/**
 * طرف حساب‌های خارجی فعال — همان منبعی که `PaymentReceiptForm` برای «گیرنده»
 * می‌خواند، تا سمت پرداخت و سمت دریافت از یک فهرست استفاده کنند.
 */
export async function fetchActiveExternalParties(): Promise<ExternalPartyOption[]> {
  const { data, error } = await supabase
    .from("external_parties")
    .select("id, full_name, phone, accounting_code")
    .eq("is_active", true)
    .order("full_name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ExternalPartyOption[];
}

/**
 * ۹.۲ — ساخت سند پرداخت برای یک خرید (اتمیک، سمت DB).
 *
 * مهاجرت ۳۱۳: هویت گیرنده و سند دفتر اضافه شد. `payeePartyId` اگر پر باشد یعنی
 * پرداخت به یک «طرف حساب خارجی» انجام شده، وگرنه گیرنده تأمین‌کنندهٔ خودِ خرید
 * است — دقیقاً همان XOR که CHECK جدول `payment_vouchers` تحمیل می‌کند.
 */
export async function payPurchaseWithVoucher(input: {
  purchaseId: string;
  sourceBankAccountId: string;
  paymentDate?: string | null;
  documentChannel?: string;
  amount?: number | null;
  trackingNumber?: string | null;
  chequeNumber?: string | null;
  chequeDueDate?: string | null;
  description?: string | null;
  /** شناسهٔ طرف حساب خارجی؛ خالی یعنی گیرنده تأمین‌کنندهٔ خرید است. */
  payeePartyId?: string | null;
  /** کد آسان ذینفع — اگر پر شود بر کد مشتق‌شده اولویت دارد. */
  payeeAccountingCode?: string | null;
}): Promise<string> {
  const { data, error } = await rpc("pay_purchase_with_voucher", {
    _purchase_id: input.purchaseId,
    _source_bank_account_id: input.sourceBankAccountId,
    _payment_date: input.paymentDate ?? null,
    _document_channel: input.documentChannel ?? "cash",
    _amount: input.amount ?? null,
    _tracking_number: input.trackingNumber ?? null,
    _cheque_number: input.chequeNumber ?? null,
    _cheque_due_date: input.chequeDueDate ?? null,
    _description: input.description ?? null,
    _payee_party_id: input.payeePartyId ?? null,
    _payee_accounting_code: input.payeeAccountingCode ?? null,
  });
  if (error) throw new Error(error.message);
  return String(data ?? "");
}
