/**
 * Wave 5 — «پخش حساب»: the four allocation RPCs, as typed functions.
 *
 * WHY THE RPCs ARE CALLED THROUGH A CAST AND NOT THROUGH THE GENERATED TYPES.
 * `src/integrations/supabase/types.ts` is a 13,201-line generated file shared by every branch,
 * and regenerating it mid-wave collides with everything else in flight. Migration 482's four
 * functions are therefore deliberately absent from it — exactly as `pay_purchase_with_voucher`
 * has been absent since migration 313 while being called successfully every day from
 * `src/lib/treasury/queries.ts:216-245`.
 *
 * The `rpc` reference below is BOUND on purpose. A bare captured `supabase.rpc` is invoked with
 * `this` undefined and PostgREST's `rpc` dereferences `this.rest` on its first line, so the page
 * throws "Cannot read properties of undefined (reading 'rest')" before it issues any request at
 * all. `src/lib/treasury/queries.ts:40-50` records the same lesson.
 *
 * Authority lives in the database, not here: all four functions are SECURITY DEFINER and raise
 * 42501 themselves — write for `admin|accountant`, read for `admin|manager|accountant` — and
 * `allocation_rows` carries RLS with the same split. Nothing in this file is a permission check.
 */
import { supabase } from "@/integrations/supabase/client";

type RpcFn = (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

const rpc = supabase.rpc.bind(supabase) as unknown as RpcFn;

/**
 * The five follow-up states, closed by owner decision D-20.
 *
 * There is no sixth. A row that has not been followed up yet carries `status = NULL`, which is an
 * ABSENCE rather than a state — `set_allocation_row_status` refuses NULL, so the UI can move a row
 * into this list but never back out of it.
 */
export const ALLOCATION_STATUSES = [
  "واریز شد",
  "خبر می‌ده",
  "جواب نمی‌ده",
  "شنبه واریز می‌کنه",
  "نمی‌خواد",
] as const;

export type AllocationStatus = (typeof ALLOCATION_STATUSES)[number];

/** The one status the database refuses without a promise date. */
export const STATUS_REQUIRING_PROMISE: AllocationStatus = "شنبه واریز می‌کنه";

export const ALLOCATION_PRIORITIES = [
  { value: "urgent", label: "فوری" },
  { value: "high", label: "زیاد" },
  { value: "normal", label: "معمولی" },
  { value: "low", label: "کم" },
] as const;

export type AllocationPriority = (typeof ALLOCATION_PRIORITIES)[number]["value"];

export const PRIORITY_FA: Record<string, string> = Object.fromEntries(
  ALLOCATION_PRIORITIES.map((p) => [p.value, p.label]),
);

/** One row of `list_allocation_rows` — migration 482, twenty columns. */
export interface AllocationRow {
  id: string;
  allocation_date: string;
  payer_customer_id: string;
  payer_person_id: string;
  payer_name: string | null;
  payer_quote_id: string | null;
  beneficiary_person_id: string;
  beneficiary_name: string | null;
  beneficiary_purchase_id: string | null;
  beneficiary_account_no: string | null;
  amount: number;
  priority: string;
  /** NULL means «پیگیری نشده» — not a sixth state. */
  status: string | null;
  promised_at: string | null;
  promised_note: string | null;
  /** Computed on read: «نمی‌خواد», or a promise that came due and was not paid. Flag only (D-21). */
  is_unfunded: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  total_count: number;
}

const num = (v: unknown) => Number(v ?? 0);

export async function listAllocationRows(input: {
  allocationDate: string;
  limit?: number;
  offset?: number;
}): Promise<AllocationRow[]> {
  const { data, error } = await rpc("list_allocation_rows", {
    p_allocation_date: input.allocationDate,
    p_limit: input.limit ?? 200,
    p_offset: input.offset ?? 0,
  });
  if (error) throw new Error(error.message);
  const rows = (data as AllocationRow[] | null) ?? [];
  return rows.map((r) => ({
    ...r,
    amount: num(r.amount),
    total_count: num(r.total_count),
    is_unfunded: Boolean(r.is_unfunded),
  }));
}

/**
 * `payer_person_id` is NOT a parameter and must never be sent: a trigger derives it from
 * `customers.person_id`. The two parties are also not editable afterwards —
 * `update_allocation_row` has no parameter for either, by design.
 */
export async function createAllocationRow(input: {
  payerCustomerId: string;
  beneficiaryPersonId: string;
  amount: number;
  allocationDate: string;
  priority: AllocationPriority;
  beneficiaryAccountNo?: string | null;
  payerQuoteId?: string | null;
  beneficiaryPurchaseId?: string | null;
}): Promise<string> {
  const { data, error } = await rpc("create_allocation_row", {
    p_payer_customer_id: input.payerCustomerId,
    p_beneficiary_person_id: input.beneficiaryPersonId,
    p_amount: input.amount,
    p_allocation_date: input.allocationDate,
    p_priority: input.priority,
    p_beneficiary_account_no: input.beneficiaryAccountNo ?? null,
    p_payer_quote_id: input.payerQuoteId ?? null,
    p_beneficiary_purchase_id: input.beneficiaryPurchaseId ?? null,
  });
  if (error) throw new Error(error.message);
  return String(data ?? "");
}

/**
 * NULL means "leave unchanged". To null a field, name it in `clear` — the database accepts only
 * `beneficiary_account_no`, `payer_quote_id` and `beneficiary_purchase_id` there.
 */
export async function updateAllocationRow(input: {
  allocationId: string;
  amount?: number | null;
  allocationDate?: string | null;
  priority?: AllocationPriority | null;
  beneficiaryAccountNo?: string | null;
  clear?: Array<"beneficiary_account_no" | "payer_quote_id" | "beneficiary_purchase_id">;
}): Promise<void> {
  const { error } = await rpc("update_allocation_row", {
    p_allocation_id: input.allocationId,
    p_amount: input.amount ?? null,
    p_allocation_date: input.allocationDate ?? null,
    p_priority: input.priority ?? null,
    p_beneficiary_account_no: input.beneficiaryAccountNo ?? null,
    p_payer_quote_id: null,
    p_beneficiary_purchase_id: null,
    p_clear: input.clear && input.clear.length > 0 ? input.clear : null,
  });
  if (error) throw new Error(error.message);
}

export async function setAllocationRowStatus(input: {
  allocationId: string;
  status: AllocationStatus;
  promisedAt?: string | null;
  promisedNote?: string | null;
}): Promise<void> {
  const { error } = await rpc("set_allocation_row_status", {
    p_allocation_id: input.allocationId,
    p_status: input.status,
    p_promised_at: input.promisedAt ?? null,
    p_promised_note: input.promisedNote ?? null,
  });
  if (error) throw new Error(error.message);
}

/**
 * `can_issue_customer_invoice` — the overdue signal for one customer.
 *
 * `reason` is finished Persian written for the accountant, so it is printed verbatim rather than
 * re-worded here. It is NULL when the customer has nothing overdue.
 */
export interface CustomerOverdueSignal {
  can_issue: boolean;
  customer_id: string;
  overdue_amount: number;
  overdue_count: number;
  oldest_due_date: string | null;
  reason: string | null;
}

export async function fetchCustomerOverdueSignals(
  customerIds: string[],
): Promise<Record<string, CustomerOverdueSignal>> {
  const unique = Array.from(new Set(customerIds.filter(Boolean)));
  const out: Record<string, CustomerOverdueSignal> = {};
  await Promise.all(
    unique.map(async (id) => {
      const { data, error } = await rpc("can_issue_customer_invoice", { p_customer_id: id });
      // One customer's signal failing must not blank the whole column; the row simply shows
      // no badge, which is the same as "not known" rather than "nothing overdue".
      if (error) return;
      const row = (data as CustomerOverdueSignal[] | null)?.[0];
      if (!row) return;
      out[id] = {
        can_issue: Boolean(row.can_issue),
        customer_id: id,
        overdue_amount: num(row.overdue_amount),
        overdue_count: num(row.overdue_count),
        oldest_due_date: row.oldest_due_date ?? null,
        reason: row.reason ?? null,
      };
    }),
  );
  return out;
}

/**
 * supplier id -> person id.
 *
 * The payables column is keyed by SUPPLIER, and `create_allocation_row` takes a PERSON, so the
 * two have to be bridged. This is a two-column lookup on `suppliers`, not a second payables
 * query: the money figures, the due dates and the aging all still come from
 * `get_payables_list`. `suppliers` carries its own RLS (`suppliers_select_role_scoped`:
 * admin, manager, accountant), so this cannot widen who sees what.
 */
export async function fetchSupplierPersonIds(
  supplierIds: string[],
): Promise<Record<string, string>> {
  const unique = Array.from(new Set(supplierIds.filter(Boolean)));
  if (unique.length === 0) return {};
  const { data, error } = await supabase.from("suppliers").select("id, person_id").in("id", unique);
  if (error) throw new Error(error.message);
  const out: Record<string, string> = {};
  for (const row of (data as unknown as Array<{ id: string; person_id: string | null }> | null) ??
    []) {
    if (row.person_id) out[row.id] = row.person_id;
  }
  return out;
}
