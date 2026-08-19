import { supabase } from "@/integrations/supabase/client";

import type { BankAccountOption, HeldCheque, OpenProforma } from "./types";

export async function listBankAccounts(): Promise<BankAccountOption[]> {
  const { data, error } = await supabase
    .from("bank_accounts")
    .select("id, title, bank_name, account_type")
    .eq("is_active", true)
    .order("title", { ascending: true });
  if (error) throw error;
  return (data ?? []) as BankAccountOption[];
}

export async function listOpenProformas(customerId: string): Promise<OpenProforma[]> {
  const { data: qs, error } = await supabase
    .from("sales_quotes")
    .select("id, quote_number, final_amount, status")
    .eq("customer_id" as never, customerId)
    .eq("status", "accepted")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  const list = (qs ?? []) as Array<{
    id: string;
    quote_number: string | null;
    final_amount: number;
  }>;
  if (list.length === 0) return [];

  const ids = list.map((q) => q.id);
  const { data: links, error: linkErr } = await supabase
    .from("payment_receipt_links")
    .select("quote_id, amount, receipt:payment_receipts!inner(status)")
    .in("quote_id" as never, ids);
  if (linkErr) throw linkErr;

  const paidMap = new Map<string, number>();
  for (const row of (links ?? []) as unknown as Array<{
    quote_id: string;
    amount: number;
    receipt: { status: string } | null;
  }>) {
    if (row.receipt?.status === "approved") {
      paidMap.set(row.quote_id, (paidMap.get(row.quote_id) ?? 0) + Number(row.amount));
    }
  }

  return list
    .map((q) => {
      const paid = paidMap.get(q.id) ?? 0;
      const total = Number(q.final_amount);
      return {
        id: q.id,
        number: q.quote_number,
        total_amount: total,
        paid_so_far: paid,
        remaining: Math.max(0, total - paid),
      };
    })
    .filter((o) => o.remaining > 0.001);
}

export async function listHeldCheques(): Promise<HeldCheque[]> {
  const { data, error } = await supabase
    .from("payment_receipts")
    .select("id, amount, payment_date, tracking_number, customer:customers(name)")
    .eq("document_channel" as never, "cheque")
    .eq("status", "approved")
    .order("payment_date", { ascending: false })
    .limit(50);
  if (error) throw error;

  return (
    (data ?? []) as unknown as Array<{
      id: string;
      amount: number;
      payment_date: string;
      tracking_number: string | null;
      customer: { name: string } | null;
    }>
  ).map((row) => ({
    id: row.id,
    amount: Number(row.amount),
    payment_date: row.payment_date,
    cheque_number: row.tracking_number,
    customer_name: row.customer?.name ?? null,
  }));
}
