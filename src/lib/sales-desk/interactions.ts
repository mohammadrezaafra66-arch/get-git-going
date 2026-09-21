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
  /**
   * Link call/note to a deal (request) row via sales_interactions.deal_id.
   * Applied with a follow-up UPDATE when the column exists (migration 564).
   */
  dealId?: string | null;
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

  if (input.dealId) {
    await linkSalesInteractionDeal({ id: data, dealId: input.dealId });
  }

  return data;
}

/**
 * Soft-fail only when deal_id column is absent (migration 564 not applied).
 * FK / RLS / permission errors must NOT match — they must throw.
 */
export function isMissingDealIdColumnError(message: string): boolean {
  const msg = message || "";
  return (
    /column\s+["']?deal_id["']?\s+(?:of\s+\S+\s+)?does not exist/i.test(msg) ||
    /deal_id.*does not exist/i.test(msg) ||
    /Could not find.*(?:['"]deal_id['"]|column.*deal_id)/i.test(msg) ||
    /Could not find the ['"]?deal_id['"]? column/i.test(msg) ||
    /schema cache.*deal_id|deal_id.*schema cache/i.test(msg)
  );
}

/**
 * Set sales_interactions.deal_id after create (column from migration 564).
 * Soft-fail only if column missing; FK/constraint errors throw.
 */
export async function linkSalesInteractionDeal(input: {
  id: string;
  dealId: string;
}): Promise<void> {
  const { error } = await supabase
    .from("sales_interactions" as never)
    .update({ deal_id: input.dealId } as never)
    .eq("id" as never, input.id as never);

  if (error) {
    const msg = error.message || "";
    if (isMissingDealIdColumnError(msg)) {
      // Migration not live — leave interaction unlinked; UI still saved.
      return;
    }
    throw new Error(error.message);
  }
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
