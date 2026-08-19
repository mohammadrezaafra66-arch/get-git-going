import { supabase } from "@/integrations/supabase/client";

export type LedgerRpcName = "create_receipt" | "create_payment" | "create_dual_document";

export interface LedgerRpcOk {
  ok: true;
  id: string | null;
  documentNumber: string | null;
  journalEntryId: string | null;
}

export interface LedgerRpcFail {
  ok: false;
  code: string;
  message: string;
  unknownOutcome: boolean;
}

export type LedgerRpcResult = LedgerRpcOk | LedgerRpcFail;

function firstRow(data: unknown): Record<string, unknown> | null {
  if (Array.isArray(data) && data[0] && typeof data[0] === "object") {
    return data[0] as Record<string, unknown>;
  }
  if (data && typeof data === "object") return data as Record<string, unknown>;
  return null;
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Map PostgREST / Postgres errors to Persian UI copy.
 *
 * rpc-contracts.md (Gate A phase 2, M2): 23505 is NOT a success path. The
 * functions mint a fresh source_id each call, so a unique violation is a real
 * error, not "already created". The stepper-spec still says the old rule; the
 * live contract wins.
 */
export function mapLedgerError(error: {
  code?: string | null;
  message?: string | null;
  details?: string | null;
}): LedgerRpcFail {
  const raw = [error.code, error.message, error.details].filter(Boolean).join(" ");
  const message = error.message?.trim() || "خطای ناشناخته در ثبت سند.";

  if (raw.includes("42501") || error.code === "42501") {
    return {
      ok: false,
      code: "42501",
      message: "شما مجوز ثبت این سند را ندارید.",
      unknownOutcome: false,
    };
  }
  if (raw.includes("0A000") || error.code === "0A000") {
    return {
      ok: false,
      code: "0A000",
      message: "پیوست در این مرحله فعال نیست. سند را بدون فایل ثبت کنید.",
      unknownOutcome: false,
    };
  }
  if (raw.includes("23505") || error.code === "23505") {
    return {
      ok: false,
      code: "23505",
      message: "این مقدار تکراری است و سند ثبت نشد. فهرست اسناد را بررسی کنید.",
      unknownOutcome: false,
    };
  }
  if (
    raw.includes("P0001") ||
    error.code === "P0001" ||
    raw.includes("22023") ||
    error.code === "22023"
  ) {
    return { ok: false, code: error.code ?? "P0001", message, unknownOutcome: false };
  }
  const timeout = /timeout|Failed to fetch|network|abort/i.test(raw) || error.code === "57014";
  if (timeout) {
    return {
      ok: false,
      code: error.code ?? "timeout",
      message: "نتیجه ثبت مشخص نیست. دوباره ارسال نکنید؛ ابتدا فهرست اسناد را بررسی کنید.",
      unknownOutcome: true,
    };
  }
  return { ok: false, code: error.code ?? "unknown", message, unknownOutcome: false };
}

export async function callLedgerRpc(
  name: LedgerRpcName,
  args: Record<string, unknown>,
): Promise<LedgerRpcResult> {
  const { data, error } = await supabase.rpc(name as never, args as never);
  if (error) return mapLedgerError(error);

  const row = firstRow(data);
  return {
    ok: true,
    id: asText(row?.receipt_id) ?? asText(row?.voucher_id) ?? asText(row?.document_id),
    documentNumber: asText(row?.document_number),
    journalEntryId: asText(row?.journal_entry_id),
  };
}
