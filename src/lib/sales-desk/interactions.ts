/**
 * Sales-desk · wrappers for migration 546 interaction RPCs.
 *
 * Browser supabase + authenticated RPC — no service_role route needed.
 * `author_id` is always set server-side to auth.uid(); never send identity.
 *
 * types.ts predates 545/546; narrow untyped cast (same pattern as credit/requests.ts).
 */
import { supabase } from "@/integrations/supabase/client";
import { salesDeskErrorMessage } from "./errors";
import {
  insertSalesInteractionItems,
  type SalesInteractionItemInput,
} from "./items";
import { parseCreateDealInteraction } from "./schema";

export type SalesInteractionKind = "request" | "call" | "note";
export type SalesInteractionStatus = "open" | "won" | "lost" | "cancelled" | "done";

type CreateSalesInteractionBase = {
  personId: string;
  body?: string;
  title?: string | null;
  customerId?: string | null;
  callLogId?: string | null;
  nextFollowUpAt?: string | null;
  source?: string;
  status?: SalesInteractionStatus;
  /**
   * Link call/note to a deal (request) row via sales_interactions.deal_id.
   * Applied with a follow-up UPDATE when the column exists (migration 564).
   */
  dealId?: string | null;
  /** C6 — persist to sales_interaction_items after create. */
  items?: SalesInteractionItemInput[];
  pipelineId?: string | null;
  stageId?: string | null;
  estimatedAmount?: number | null;
  introducerPersonId?: string | null;
  /** Retry follow-up writes without inserting a second deal. */
  existingId?: string | null;
};

/** kind=request requires non-empty salespersonId (zod + trigger RESPONSIBLE_REQUIRED). */
export type CreateSalesInteractionInput =
  | (CreateSalesInteractionBase & {
      kind: "request";
      salespersonId: string;
    })
  | (CreateSalesInteractionBase & {
      kind: "call" | "note";
      salespersonId?: string | null;
    });

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
  // C2 — zod gate for deals before RPC (UI may also validate; lib must not skip).
  let salespersonId: string | null = input.salespersonId ?? null;
  if (input.kind === "request") {
    const parsed = parseCreateDealInteraction({
      ...input,
      body: input.body ?? "",
      salespersonId: input.salespersonId,
    });
    salespersonId = parsed.salespersonId;
    if (!input.pipelineId && parsed.pipelineId) input.pipelineId = parsed.pipelineId;
    if (!input.stageId && parsed.stageId) input.stageId = parsed.stageId;
  }

  let id = input.existingId ?? null;
  if (!id) {
    const { data, error } = await rpc()("sales_interaction_create", {
      p_person_id: input.personId,
      p_kind: input.kind,
      p_body: input.body ?? "",
      p_title: input.title ?? null,
      p_customer_id: input.customerId ?? null,
      p_salesperson_id: salespersonId,
      p_call_log_id: input.callLogId ?? null,
      p_next_follow_up_at: input.nextFollowUpAt ?? null,
      p_source: input.source ?? "manual",
      p_status: input.status ?? "open",
      p_pipeline_id: input.pipelineId ?? null,
      p_stage_id: input.stageId ?? null,
      p_expected_close_on: (input as { expectedCloseOn?: string | null }).expectedCloseOn ?? null,
      p_acquaintance_id: (input as { acquaintanceId?: string | null }).acquaintanceId ?? null,
      p_company_person_id: (input as { companyPersonId?: string | null }).companyPersonId ?? null,
      p_probability: (input as { probability?: number | null }).probability ?? null,
      p_is_vip: (input as { isVip?: boolean }).isVip ?? false,
      p_estimated_amount: (input as { estimatedAmount?: number | null }).estimatedAmount ?? null,
      p_introducer_person_id:
        (input as { introducerPersonId?: string | null }).introducerPersonId ?? null,
    });
    if (error) throw new Error(salesDeskErrorMessage(error.message));
    if (typeof data !== "string" || !data) {
      throw new Error("sales_interaction_create مقدار شناسه برنگرداند.");
    }
    id = data;
  }

  try {
    if (input.dealId) {
      await linkSalesInteractionDeal({ id, dealId: input.dealId });
    }

    if (input.items && input.items.length > 0) {
      await insertSalesInteractionItems(id, input.items);
    }

    if (input.kind === "request" && input.pipelineId && input.stageId) {
      const { error: moveErr } = await rpc()("sales_deal_move", {
        p_id: id,
        p_pipeline_id: input.pipelineId,
        p_stage_id: input.stageId,
      });
      if (moveErr) throw new Error(salesDeskErrorMessage(moveErr.message));
    }

    return id;
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    (err as Error & { createdId?: string }).createdId = id;
    throw err;
  }
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
    throw new Error(salesDeskErrorMessage(error.message));
  }
}

export async function updateSalesInteractionStatus(input: {
  id: string;
  status: SalesInteractionStatus;
  outcomeNote?: string | null;
  lostReasonId?: string | null;
  lostReasonNote?: string | null;
  lostReasonOther?: string | null;
}): Promise<string> {
  if (input.status === "lost" && !input.lostReasonId) {
    throw new Error("دلیل شکست را انتخاب کنید");
  }

  const { data, error } = await rpc()("sales_interaction_update_status", {
    p_id: input.id,
    p_status: input.status,
    p_outcome_note: input.outcomeNote ?? null,
    p_lost_reason_id: input.lostReasonId ?? null,
    p_lost_reason_note: input.lostReasonNote ?? null,
    p_lost_reason_other: input.lostReasonOther ?? null,
  });
  if (error) throw new Error(salesDeskErrorMessage(error.message));
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
  if (error) throw new Error(salesDeskErrorMessage(error.message));
  if (typeof data !== "string" || !data) {
    throw new Error("sales_interaction_set_follow_up مقدار شناسه برنگرداند.");
  }
  return data;
}

/** Load one deal (kind=request) with author/salesperson names for detail view. */
export async function loadDealById(id: string): Promise<{
  id: string;
  person_id: string;
  customer_id: string | null;
  kind: string;
  title: string | null;
  body: string;
  status: string;
  salesperson_id: string | null;
  author_id: string;
  won_at: string | null;
  lost_at: string | null;
  lost_reason_id: string | null;
  lost_reason_note: string | null;
  lost_reason_other: string | null;
  next_follow_up_at: string | null;
  created_at: string;
  pipeline_id: string | null;
  stage_id: string | null;
  deleted_at: string | null;
  display_code: number | null;
  probability: number | null;
  expected_close_on: string | null;
  company_person_id: string | null;
  acquaintance_id: string | null;
  is_vip: boolean;
  pinned_at: string | null;
  register_time: string | null;
  last_activity_at: string | null;
  won_by: string | null;
  lost_by: string | null;
  stage_entered_at: string | null;
  introducer_person_id?: string | null;
  estimated_amount?: number | null;
  author?: { id: string; full_name: string | null } | null;
  salesperson?: { id: string; full_name: string | null } | null;
} | null> {
  const { data, error } = await supabase
    .from("sales_interactions" as never)
    .select(
      "id, person_id, customer_id, kind, title, body, status, salesperson_id, author_id, won_at, lost_at, lost_reason_id, lost_reason_note, lost_reason_other, next_follow_up_at, created_at, pipeline_id, stage_id, deleted_at, display_code, probability, expected_close_on, company_person_id, acquaintance_id, is_vip, pinned_at, register_time, last_activity_at, won_by, lost_by, stage_entered_at, introducer_person_id, estimated_amount" as never,
    )
    .eq("id" as never, id as never)
    .maybeSingle();
  if (error) throw new Error(salesDeskErrorMessage(error.message));
  if (!data) return null;
  const row = data as unknown as {
    id: string;
    person_id: string;
    customer_id: string | null;
    kind: string;
    title: string | null;
    body: string;
    status: string;
    salesperson_id: string | null;
    author_id: string;
    won_at: string | null;
    lost_at: string | null;
    lost_reason_id: string | null;
    lost_reason_note: string | null;
    lost_reason_other: string | null;
    next_follow_up_at: string | null;
    created_at: string;
    pipeline_id: string | null;
    stage_id: string | null;
    deleted_at: string | null;
    display_code: number | null;
    probability: number | null;
    expected_close_on: string | null;
    company_person_id: string | null;
    acquaintance_id: string | null;
    is_vip: boolean;
    pinned_at: string | null;
    register_time: string | null;
    last_activity_at: string | null;
    won_by: string | null;
    lost_by: string | null;
    stage_entered_at: string | null;
  };
  const profileIds = [row.author_id, row.salesperson_id].filter(Boolean) as string[];
  let author: { id: string; full_name: string | null } | null = null;
  let salesperson: { id: string; full_name: string | null } | null = null;
  if (profileIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", profileIds);
    const map = new Map((profiles ?? []).map((p) => [p.id, p]));
    author = map.get(row.author_id) ?? null;
    salesperson = row.salesperson_id ? map.get(row.salesperson_id) ?? null : null;
  }
  return { ...row, author, salesperson };
}
