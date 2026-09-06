/**
 * Wave 6 B-3 — the query layer for `credit_requests`.
 *
 * The table existed with zero rows and ZERO references anywhere in `src/`; this is the first
 * reader and writer. Every call goes through the ordinary authenticated client, so RLS is the
 * enforcement and this file is only a shape.
 *
 * Two things are deliberately NOT symmetrical here:
 *
 * - CREATING a request is a plain INSERT. `cr_insert_sales` already allows
 *   admin/manager/sales/accountant, `customer_person_id` is filled by the existing BEFORE
 *   trigger `trg_credit_requests_derive_person`, and the audit row comes from
 *   `trg_credit_requests_audit`. There is nothing for a function to add.
 *
 * - REVIEWING goes through the `review_credit_request` RPC, because approval also writes
 *   `customers.manual_credit_floor`, and no browser role may set a credit ceiling directly.
 *   The RPC re-checks the role server-side and raises 42501 regardless of what the UI shows.
 */
import { supabase } from "@/integrations/supabase/client";

export type CreditRequestStatus = "pending" | "approved" | "rejected";

export interface CreditRequestRow {
  id: string;
  customer_id: string;
  requested_by: string | null;
  requested_amount: number;
  status: CreditRequestStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  notes: string | null;
  created_at: string;
  customer: { id: string; name: string | null } | null;
}

/**
 * The visible requests, newest first.
 *
 * No client-side role filtering: `cr_read_privileged` already narrows a salesperson to their
 * own rows (`requested_by = auth.uid()`) and shows admin/manager/accountant everything.
 * Re-implementing that here would be a second, weaker copy of the rule.
 *
 * CLAUDE.md rule 11 — bounded, ordered, and paged rather than an open select.
 */
export async function listCreditRequests(params?: {
  status?: CreditRequestStatus | "all";
  limit?: number;
}): Promise<CreditRequestRow[]> {
  const limit = Math.min(params?.limit ?? 100, 200);
  let q = supabase
    .from("credit_requests")
    .select(
      "id, customer_id, requested_by, requested_amount, status, reviewed_by, reviewed_at, notes, created_at, customer:customers(id, name)",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (params?.status && params.status !== "all") q = q.eq("status", params.status);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as CreditRequestRow[];
}

export async function createCreditRequest(input: {
  customerId: string;
  amount: number;
  notes?: string | null;
}): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from("credit_requests").insert({
    customer_id: input.customerId,
    requested_by: auth.user?.id ?? null,
    requested_amount: input.amount,
    notes: input.notes ?? null,
    status: "pending",
  } as never);
  if (error) throw new Error(error.message);
}

/**
 * `src/integrations/supabase/types.ts` is GENERATED from the schema and predates migration 505,
 * so it does not yet list `review_credit_request` and `supabase.rpc` rejects the name.
 *
 * The narrow cast below is deliberate, and regenerating the types file was rejected rather than
 * overlooked: it is a single shared generated artefact, and re-generating it during wave 6 would
 * sweep in every other agent's in-flight schema change alongside this one. The cast is confined
 * to this one call and disappears the next time the types are regenerated normally.
 * (`@ts-ignore` is forbidden and is not used.)
 */
type UntypedRpc = (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ error: { message: string } | null }>;

export async function reviewCreditRequest(input: {
  requestId: string;
  decision: "approved" | "rejected";
  notes?: string | null;
}): Promise<void> {
  const rpc = supabase.rpc as unknown as UntypedRpc;
  const { error } = await rpc("review_credit_request", {
    p_request_id: input.requestId,
    p_decision: input.decision,
    p_notes: input.notes ?? null,
  });
  if (error) throw new Error(error.message);
}

/** Customers the requester can pick from. Bounded and searchable (rule 11). */
export async function searchCustomersForCredit(
  term: string,
): Promise<Array<{ id: string; name: string | null; manual_credit_floor: number | null }>> {
  let q = supabase
    .from("customers")
    .select("id, name, manual_credit_floor")
    .order("name", { ascending: true })
    .limit(30);
  if (term.trim()) q = q.ilike("name", `%${term.trim()}%`);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Array<{
    id: string;
    name: string | null;
    manual_credit_floor: number | null;
  }>;
}
