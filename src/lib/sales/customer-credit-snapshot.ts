import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

export type CustomerCreditProfileRow = Database["public"]["Tables"]["customer_credit_profile"]["Row"];
export type CustomerCreditBalanceRow = Database["public"]["Tables"]["customer_credit_balance"]["Row"];

export type TrustedCustomerStatus = "trusted" | "candidate" | "watch" | "blocked" | "unknown";
export type SettlementSpeedBand = "fast" | "normal" | "slow" | "unknown";
export type OverdueLockState = "none" | "warning" | "soft_lock" | "hard_lock" | "unknown";
export type ManualCreditOverrideState = "none" | "trusted" | "blocked" | "limit_adjusted" | "unknown";

export interface CustomerCreditSnapshot {
  customer_id: string;
  credit_profile: {
    credit_limit: number;
    credit_score: number;
    total_purchases: number;
    total_paid: number;
    outstanding_balance: number;
    late_payments_count: number;
    last_purchase_date: string | null;
    is_active: boolean;
  } | null;
  credit_balance: {
    available_credit: number;
    held_credit: number;
    last_transaction_at: string | null;
  } | null;
  trusted_status: {
    value: TrustedCustomerStatus;
    reason_codes: string[];
    explanation: string;
  };
  settlement_speed: {
    band: SettlementSpeedBand;
    score: number | null;
    explanation: string;
  };
  overdue_lock: {
    state: OverdueLockState;
    overdue_amount: number | null;
    overdue_count: number | null;
    explanation: string;
  };
  manual_override: {
    has_override: boolean;
    override_state: ManualCreditOverrideState;
    reason: string | null;
    approved_by: string | null;
    approved_at: string | null;
  };
  evidence: {
    data_sources: string[];
    calculated_at: string;
    stale: boolean;
  };
}

export interface BuildCustomerCreditSnapshotInput {
  customerId: string;
  profile: CustomerCreditProfileRow | null;
  balance: CustomerCreditBalanceRow | null;
  calculatedAt?: string;
}

function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function buildTrustedStatus(profile: CustomerCreditProfileRow | null): CustomerCreditSnapshot["trusted_status"] {
  if (!profile) {
    return {
      value: "unknown",
      reason_codes: ["credit_profile_missing"],
      explanation: "پروفایل اعتباری مشتری موجود نیست؛ وضعیت معتبر بودن قابل تشخیص نیست.",
    };
  }

  if (!profile.is_active) {
    return {
      value: "blocked",
      reason_codes: ["credit_profile_inactive"],
      explanation: "پروفایل اعتباری مشتری غیرفعال است؛ ادامه اعتبار نیاز به بررسی دارد.",
    };
  }

  return {
    value: "unknown",
    reason_codes: ["business_thresholds_not_approved"],
    explanation:
      "قوانین نهایی مشتری معتبر هنوز تأیید نشده‌اند؛ تا زمان تأیید آستانه‌ها وضعیت به‌صورت unknown برگردانده می‌شود.",
  };
}

export function buildCustomerCreditSnapshot({
  customerId,
  profile,
  balance,
  calculatedAt = new Date().toISOString(),
}: BuildCustomerCreditSnapshotInput): CustomerCreditSnapshot {
  const dataSources: string[] = [];
  if (profile) dataSources.push("customer_credit_profile");
  if (balance) dataSources.push("customer_credit_balance");

  return {
    customer_id: customerId,
    credit_profile: profile
      ? {
          credit_limit: toNumber(profile.credit_limit),
          credit_score: toNumber(profile.credit_score),
          total_purchases: toNumber(profile.total_purchases),
          total_paid: toNumber(profile.total_paid),
          outstanding_balance: toNumber(profile.outstanding_balance),
          late_payments_count: toNumber(profile.late_payments_count),
          last_purchase_date: profile.last_purchase_date,
          is_active: Boolean(profile.is_active),
        }
      : null,
    credit_balance: balance
      ? {
          available_credit: toNumber(balance.available_credit),
          held_credit: toNumber(balance.held_credit),
          last_transaction_at: balance.last_transaction_at,
        }
      : null,
    trusted_status: buildTrustedStatus(profile),
    settlement_speed: {
      band: "unknown",
      score: null,
      explanation:
        "فرمول سرعت تسویه هنوز در Group 3 Business Rules Review تأیید نشده است؛ مقدار فعلی عمداً unknown است.",
    },
    overdue_lock: {
      state: "unknown",
      overdue_amount: null,
      overdue_count: null,
      explanation:
        "قانون قفل معوق هنوز تأیید نشده است؛ این read model فعلاً هیچ قفل خودکار اعمال نمی‌کند.",
    },
    manual_override: {
      has_override: false,
      override_state: "none",
      reason: null,
      approved_by: null,
      approved_at: null,
    },
    evidence: {
      data_sources: dataSources,
      calculated_at: calculatedAt,
      stale: false,
    },
  };
}

export async function fetchCustomerCreditSnapshot(
  supabase: SupabaseClient<Database>,
  customerId: string,
): Promise<CustomerCreditSnapshot> {
  const [{ data: profile, error: profileError }, { data: balance, error: balanceError }] =
    await Promise.all([
      supabase
        .from("customer_credit_profile")
        .select("*")
        .eq("customer_id", customerId)
        .maybeSingle(),
      supabase
        .from("customer_credit_balance")
        .select("*")
        .eq("customer_id", customerId)
        .maybeSingle(),
    ]);

  if (profileError) throw profileError;
  if (balanceError) throw balanceError;

  return buildCustomerCreditSnapshot({
    customerId,
    profile: profile ?? null,
    balance: balance ?? null,
  });
}
