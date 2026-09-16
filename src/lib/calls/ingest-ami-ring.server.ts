/**
 * Ingest a live ring/dial event (AMI or CEL) into call_ring_events.
 * service_role only — called from the public worker hook.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type UntypedDb = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (
        col: string,
        val: string,
      ) => {
        maybeSingle: () => Promise<{ data: unknown; error: { message: string } | null }>;
      };
    };
    insert: (row: Record<string, unknown>) => {
      select: (cols: string) => {
        maybeSingle: () => Promise<{
          data: { id: string } | null;
          error: { message: string; code?: string } | null;
        }>;
      };
    };
  };
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

const db = supabaseAdmin as unknown as UntypedDb;

export type AmiRingIngestInput = {
  linkedid?: string | null;
  uniqueid?: string | null;
  callerNumber?: string | null;
  extension: string;
  eventAt?: string | null;
  source?: "ami" | "cel" | "manual";
  direction?: "inbound" | "outbound";
  raw?: Record<string, unknown> | null;
};

export type AmiRingIngestResult =
  | {
      ok: true;
      id: string | null;
      duplicate: boolean;
      employee_id: string | null;
      person_id: string | null;
    }
  | { ok: false; error: string; message: string };

type MatchedPersonRow = { raw_number: string; person_id: string };

async function resolveEmployeeId(extension: string): Promise<string | null> {
  const { data, error } = await db
    .from("call_log_extensions")
    .select("employee_id")
    .eq("extension", extension)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { employee_id: string | null };
  return row.employee_id ?? null;
}

async function matchPerson(callerNumber: string | null | undefined): Promise<string | null> {
  if (!callerNumber || !callerNumber.trim()) return null;
  const { data, error } = await db.rpc("call_import_match_persons", {
    _raw_numbers: [callerNumber.trim()],
  });
  if (error || !data) return null;
  const rows = data as MatchedPersonRow[];
  return rows[0]?.person_id ?? null;
}

export async function listMappedExtensions(): Promise<string[]> {
  const { data, error } = await (supabaseAdmin as unknown as {
    from: (t: string) => {
      select: (c: string) => Promise<{ data: unknown; error: { message: string } | null }>;
    };
  })
    .from("call_log_extensions")
    .select("extension, employee_id");
  if (error || !data) return [];
  return (data as { extension: string | null; employee_id: string | null }[])
    .filter((r) => r.extension && r.employee_id)
    .map((r) => r.extension!.trim());
}

export async function ingestAmiRingEvent(
  input: AmiRingIngestInput,
): Promise<AmiRingIngestResult> {
  const extension = (input.extension ?? "").trim();
  if (!extension) {
    return { ok: false, error: "invalid_extension", message: "extension is required" };
  }

  const linkedid = input.linkedid?.trim() || null;
  const uniqueid = input.uniqueid?.trim() || null;
  const callerNumber = input.callerNumber?.trim() || null;
  const eventAt = input.eventAt?.trim() || new Date().toISOString();
  const source = input.source ?? "ami";
  const direction = input.direction === "outbound" ? "outbound" : "inbound";

  const [employeeId, personId] = await Promise.all([
    resolveEmployeeId(extension),
    matchPerson(callerNumber),
  ]);

  // Queue dials every member; only mapped extensions become popups.
  if (!employeeId) {
    return {
      ok: true,
      id: null,
      duplicate: false,
      employee_id: null,
      person_id: personId,
    };
  }

  const row = {
    linkedid,
    uniqueid,
    caller_number: callerNumber,
    extension,
    employee_id: employeeId,
    person_id: personId,
    event_at: eventAt,
    source,
    direction,
    metadata: {
      raw_number: callerNumber,
      stripped_number: callerNumber,
      unknown_number: !personId,
      direction,
      ...(input.raw ? { raw: input.raw } : {}),
    },
  };

  const { data, error } = await db.from("call_ring_events").insert(row).select("id").maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return {
        ok: true,
        id: null,
        duplicate: true,
        employee_id: employeeId,
        person_id: personId,
      };
    }
    return { ok: false, error: "insert_failed", message: error.message };
  }

  return {
    ok: true,
    id: data?.id ?? null,
    duplicate: false,
    employee_id: employeeId,
    person_id: personId,
  };
}
