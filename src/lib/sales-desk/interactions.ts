/**
 * Sales-desk · wrappers for migration 546 interaction RPCs.
 *
 * Browser supabase + authenticated RPC — no service_role route needed.
 * `author_id` is always set server-side to auth.uid(); never send identity.
 *
 * types.ts predates 545/546; narrow untyped cast (same pattern as credit/requests.ts).
 */
import { supabase } from "@/integrations/supabase/client";

export type SalesInteractionKind = "request" | "call" | "note";
export type SalesInteractionStatus = "open" | "won" | "lost" | "cancelled" | "done";

export type CreateSalesInteractionInput = {
  personId: string;
  kind: SalesInteractionKind;
  body?: string;
  title?: string | null;
  customerId?: string | null;
  salespersonId?: string | null;
  callLogId?: string | null;
  nextFollowUpAt?: string | null;
  source?: string;
  status?: SalesInteractionStatus;
};

type UntypedRpc = (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

function rpc(): UntypedRpc {
  // `.bind(supabase)` required — detaching rpc loses `this` (see credit/requests.ts).
  return supabase.rpc.bind(supabase) as unknown as UntypedRpc;
}

export async function createSalesInteraction(
  input: CreateSalesInteractionInput,
): Promise<string> {
  const { data, error } = await rpc()("sales_interaction_create", {
    p_person_id: input.personId,
    p_kind: input.kind,
    p_body: input.body ?? "",
    p_title: input.title ?? null,
    p_customer_id: input.customerId ?? null,
    p_salesperson_id: input.salespersonId ?? null,
    p_call_log_id: input.callLogId ?? null,
    p_next_follow_up_at: input.nextFollowUpAt ?? null,
    p_source: input.source ?? "manual",
    p_status: input.status ?? "open",
  });
  if (error) throw new Error(error.message);
  if (typeof data !== "string" || !data) {
    throw new Error("sales_interaction_create مقدار شناسه برنگرداند.");
  }
  return data;
}

export async function updateSalesInteractionStatus(input: {
  id: string;
  status: SalesInteractionStatus;
  outcomeNote?: string | null;
}): Promise<string> {
  const { data, error } = await rpc()("sales_interaction_update_status", {
    p_id: input.id,
    p_status: input.status,
    p_outcome_note: input.outcomeNote ?? null,
  });
  if (error) throw new Error(error.message);
  if (typeof data !== "string" || !data) {
    throw new Error("sales_interaction_update_status مقدار شناسه برنگرداند.");
  }
  return data;
}

export async function setSalesInteractionFollowUp(input: {
  id: string;
  nextFollowUpAt: string | null;
  followedUpAt?: string | null;
}): Promise<string> {
  const { data, error } = await rpc()("sales_interaction_set_follow_up", {
    p_id: input.id,
    p_next_follow_up_at: input.nextFollowUpAt,
    p_followed_up_at: input.followedUpAt ?? null,
  });
  if (error) throw new Error(error.message);
  if (typeof data !== "string" || !data) {
    throw new Error("sales_interaction_set_follow_up مقدار شناسه برنگرداند.");
  }
  return data;
}
