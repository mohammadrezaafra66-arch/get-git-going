import { supabaseAdmin } from "@/integrations/supabase/client.server";

type AdminDb = {
  from: (table: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => any;
};

export function torobOpsAdmin(): AdminDb {
  return supabaseAdmin as unknown as AdminDb;
}

export async function writeTorobOpsAudit(input: {
  actorId: string;
  action: string;
  entityId: string;
  diff?: Record<string, unknown>;
}): Promise<void> {
  try {
    const { error } = await torobOpsAdmin().rpc("log_event", {
      _entity_type: "torob_ops",
      _entity_id: input.entityId,
      _action: input.action,
      _diff: input.diff ?? {},
    });
    if (error) {
      // Fallback: direct insert if log_event rejects for any reason
      await torobOpsAdmin()
        .from("audit_logs")
        .insert({
          actor_id: input.actorId,
          entity_type: "torob_ops",
          entity_id: input.entityId,
          action: input.action,
          diff: input.diff ?? {},
        });
    }
  } catch (err) {
    console.warn("[torob-ops] audit write failed", err);
  }
}
