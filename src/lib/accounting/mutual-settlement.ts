import { supabase } from "@/integrations/supabase/client";

/**
 * تسویهٔ متقابل (مهاجرت ۳۱۹).
 *
 * شخصی که هم مشتری است و هم تأمین‌کننده، دو مانده در دو نیمهٔ دفتر دارد. این
 * ماژول آن دو را کنار هم می‌گذارد و تهاتر می‌کند. تمام محاسبه و ثبت سمت
 * دیتابیس است (`SECURITY DEFINER`، فقط admin/accountant) — اینجا فقط فراخوان
 * است، تا منطق مالی در دو جا تکرار نشود.
 */

type RpcFn = (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

const rpc = supabase.rpc as unknown as RpcFn;

/** جهت تسویه، از دید شرکت. */
export type SettlementDirection = "customer_pays" | "we_pay" | "balanced";

export const SETTLEMENT_DIRECTION_FA: Record<SettlementDirection, string> = {
  customer_pays: "او باید به ما بپردازد",
  we_pay: "ما باید به او بپردازیم",
  balanced: "تراز است",
};

export type SettlementCandidate = {
  person_id: string;
  display_name: string | null;
  receivable: number;
  payable: number;
  net: number;
  direction: SettlementDirection;
};

export type SettlementPosition = SettlementCandidate & {
  customer_id: string | null;
  supplier_id: string | null;
};

/** اشخاص دو‌نقشی به‌همراه وضعیت تسویه‌شان. */
export async function fetchSettlementCandidates(): Promise<SettlementCandidate[]> {
  const { data, error } = await rpc("list_mutual_settlement_candidates", {});
  if (error) throw new Error(error.message);
  return (data as SettlementCandidate[] | null) ?? [];
}

/** وضعیت تسویهٔ یک شخص مشخص. */
export async function fetchSettlementPosition(
  personId: string,
): Promise<SettlementPosition | null> {
  const { data, error } = await rpc("person_settlement_position", { _person_id: personId });
  if (error) throw new Error(error.message);
  const rows = (data as SettlementPosition[] | null) ?? [];
  return rows[0] ?? null;
}

/**
 * ثبت تسویهٔ متقابل.
 *
 * دو مبلغ جداست و عمداً یکی نشده: `offsetAmount` مقدار تهاتر (کاهش هم‌زمان
 * طلب و بدهی، بدون جابه‌جایی پول) و `cashAmount` مقدار واقعی پولی که
 * جابه‌جا می‌شود. با یک عدد نمی‌شد هر دو را بیان کرد.
 */
export async function postMutualSettlement(input: {
  personId: string;
  offsetAmount: number;
  cashAmount?: number;
  bankAccountId?: string | null;
  note?: string | null;
  entryDate?: string | null;
}): Promise<string> {
  const { data, error } = await rpc("post_mutual_settlement", {
    _person_id: input.personId,
    _offset_amount: input.offsetAmount,
    _cash_amount: input.cashAmount ?? 0,
    _bank_account_id: input.bankAccountId ?? null,
    _note: input.note ?? null,
    _entry_date: input.entryDate ?? null,
  });
  if (error) throw new Error(error.message);
  return String(data ?? "");
}
