/**
 * Phase 2 — Persons Core (S07)
 *
 * Server-side write path for `public.person_identifiers`.
 *
 * Responsibilities:
 *  - Normalize raw input to `value_normalized` on the server (never trust the client).
 *  - Validate kind/value/status with Persian error messages.
 *  - Delegate authorization to RLS (S06: admin/manager only for INSERT/UPDATE).
 *  - Preserve S06 audit triggers — handler performs plain INSERT/UPDATE.
 *  - Never expose `value_raw` in returned errors or logs.
 *
 * No new external dependencies. No CDN. No secrets. Safe for self-host.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  IDENTIFIER_KINDS,
  normalizeIdentifier,
  type IdentifierKind,
} from "./identifiers-normalize";

const KindEnum = z.enum(IDENTIFIER_KINDS as unknown as [IdentifierKind, ...IdentifierKind[]]);

const StatusEnum = z.enum(["provisional", "confirmed", "revoked"]);

const CreateInputSchema = z.object({
  person_id: z.string().uuid({ message: "شناسه شخص نامعتبر است" }),
  kind: KindEnum,
  value_raw: z
    .string()
    .min(1, "مقدار شناسه نمی‌تواند خالی باشد")
    .max(512, "طول مقدار شناسه بیش از حد مجاز است"),
  status: StatusEnum.optional().default("provisional"),
  is_primary: z.boolean().optional().default(false),
});

const UpdateInputSchema = z.object({
  id: z.string().uuid({ message: "شناسه ردیف نامعتبر است" }),
  // Optional fields. value_raw triggers re-normalization.
  value_raw: z.string().min(1).max(512).optional(),
  kind: KindEnum.optional(),
  status: StatusEnum.optional(),
  is_primary: z.boolean().optional(),
});

const RevokeInputSchema = z.object({
  id: z.string().uuid({ message: "شناسه ردیف نامعتبر است" }),
});

export type PersonIdentifierDTO = {
  id: string;
  person_id: string;
  kind: IdentifierKind;
  value_normalized: string;
  status: "provisional" | "confirmed" | "revoked";
  is_primary: boolean;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * S12 — Cross-person duplicate guard (D2).
 *
 * Reject when another person already has a non-revoked identifier with the
 * same (kind, value_normalized). Admin/manager (the only roles allowed to
 * insert/update identifiers per S06 RLS) can SELECT all persons across
 * visibility scopes, so RLS does not hide rows from this check.
 *
 * Returns the Persian rejection message if a conflict exists, otherwise null.
 */
async function findCrossPersonDuplicate(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  args: {
    kind: IdentifierKind;
    value_normalized: string;
    person_id: string;
    excludeId?: string;
  },
): Promise<string | null> {
  let q = supabase
    .from("person_identifiers")
    .select("id, person_id, status")
    .eq("kind", args.kind)
    .eq("value_normalized", args.value_normalized)
    .neq("status", "revoked")
    .neq("person_id", args.person_id)
    .limit(1);
  if (args.excludeId) q = q.neq("id", args.excludeId);
  const { data, error } = await q;
  if (error) throw mapPgError(error.code, error.message);
  if (data && data.length > 0) {
    return "این شناسه قبلاً برای شخص دیگری ثبت شده است.";
  }
  return null;
}

/**
 * Map raw Postgres / RLS errors to Persian, business-safe messages.
 * Never echoes value_raw back.
 */
function mapPgError(code: string | undefined, message: string): Error {
  // Postgres unique_violation
  if (code === "23505") {
    if (message.includes("uq_person_identifiers_confirmed_kind_value")) {
      return new Error("این شناسه قبلاً به‌صورت تأییدشده برای شخص دیگری ثبت شده است");
    }
    if (message.includes("uq_person_identifiers_primary_active")) {
      return new Error("برای این شخص از قبل یک شناسه‌ی اصلی فعال از همین نوع وجود دارد");
    }
    return new Error("مقدار تکراری است");
  }
  // RLS / insufficient_privilege / check violation
  if (code === "42501") return new Error("دسترسی لازم برای این عملیات را ندارید");
  if (code === "23514") return new Error("مقدار وارد شده با محدودیت‌های پایگاه داده سازگار نیست");
  if (code === "23503") return new Error("شخص مرتبط یافت نشد");
  return new Error(message || "خطای ناشناخته در پایگاه داده");
}

/** Create a new person_identifier. Admin/manager only (enforced by RLS). */
export const createPersonIdentifier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => CreateInputSchema.parse(input))
  .handler(async ({ data, context }): Promise<PersonIdentifierDTO> => {
    const norm = normalizeIdentifier(data.kind, data.value_raw);
    if (!norm.ok) {
      throw new Error(norm.message_fa);
    }

    const { supabase } = context;
    // S12: server-side cross-person duplicate guard (provisional + confirmed).
    const dupMsg = await findCrossPersonDuplicate(supabase, {
      kind: data.kind,
      value_normalized: norm.value_normalized,
      person_id: data.person_id,
    });
    if (dupMsg) throw new Error(dupMsg);

    const { data: row, error } = await supabase
      .from("person_identifiers")
      .insert({
        person_id: data.person_id,
        kind: data.kind,
        value_raw: data.value_raw.trim(),
        value_normalized: norm.value_normalized,
        status: data.status,
        is_primary: data.is_primary,
      })
      .select(
        "id, person_id, kind, value_normalized, status, is_primary, verified_at, created_at, updated_at",
      )
      .single();

    if (error) throw mapPgError(error.code, error.message);
    return row as PersonIdentifierDTO;
  });

/**
 * Update fields of an identifier. Admin/manager only (RLS).
 * If value_raw or kind changes, server re-normalizes.
 */
export const updatePersonIdentifier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => UpdateInputSchema.parse(input))
  .handler(async ({ data, context }): Promise<PersonIdentifierDTO> => {
    const { supabase } = context;

    const patch: {
      kind?: IdentifierKind;
      value_raw?: string;
      value_normalized?: string;
      status?: "provisional" | "confirmed" | "revoked";
      is_primary?: boolean;
    } = {};
    const wantsRevalue = data.value_raw !== undefined || data.kind !== undefined;

    // Always fetch the current row when we might need a duplicate check
    // (revalue OR status transition from revoked -> non-revoked).
    const wantsStatusChange = data.status !== undefined;
    let cur:
      | { kind: IdentifierKind; value_raw: string; value_normalized: string; status: string; person_id: string }
      | null = null;
    if (wantsRevalue || wantsStatusChange) {
      const { data: row, error: curErr } = await supabase
        .from("person_identifiers")
        .select("kind, value_raw, value_normalized, status, person_id")
        .eq("id", data.id)
        .maybeSingle();
      if (curErr) throw mapPgError(curErr.code, curErr.message);
      if (!row) throw new Error("شناسه یافت نشد یا دسترسی به آن ندارید");
      cur = row as typeof cur;
    }

    if (wantsRevalue && cur) {
      const effectiveKind = (data.kind ?? cur.kind) as IdentifierKind;
      const effectiveRaw = data.value_raw ?? cur.value_raw;
      const norm = normalizeIdentifier(effectiveKind, effectiveRaw);
      if (!norm.ok) throw new Error(norm.message_fa);

      if (data.kind !== undefined) patch.kind = data.kind;
      if (data.value_raw !== undefined) patch.value_raw = data.value_raw.trim();
      patch.value_normalized = norm.value_normalized;
    }

    if (data.status !== undefined)
      patch.status = data.status as "provisional" | "confirmed" | "revoked";
    if (data.is_primary !== undefined) patch.is_primary = data.is_primary;

    if (Object.keys(patch).length === 0) {
      throw new Error("هیچ تغییری برای اعمال وجود ندارد");
    }

    // S12: server-side cross-person duplicate guard for UPDATE.
    if (cur) {
      const effectiveKind = (patch.kind ?? cur.kind) as IdentifierKind;
      const effectiveValueNormalized = patch.value_normalized ?? cur.value_normalized;
      const effectiveStatus = (patch.status ?? cur.status) as string;
      if (effectiveStatus !== "revoked") {
        const dupMsg = await findCrossPersonDuplicate(supabase, {
          kind: effectiveKind,
          value_normalized: effectiveValueNormalized,
          person_id: cur.person_id,
          excludeId: data.id,
        });
        if (dupMsg) throw new Error(dupMsg);
      }
    }

    const { data: row, error } = await supabase
      .from("person_identifiers")
      .update(patch)
      .eq("id", data.id)
      .select(
        "id, person_id, kind, value_normalized, status, is_primary, verified_at, created_at, updated_at",
      )
      .single();

    if (error) throw mapPgError(error.code, error.message);
    return row as PersonIdentifierDTO;
  });

/** Revoke (soft-delete) an identifier by setting status='revoked' and is_primary=false. */
export const revokePersonIdentifier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => RevokeInputSchema.parse(input))
  .handler(async ({ data, context }): Promise<PersonIdentifierDTO> => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("person_identifiers")
      .update({ status: "revoked", is_primary: false })
      .eq("id", data.id)
      .select(
        "id, person_id, kind, value_normalized, status, is_primary, verified_at, created_at, updated_at",
      )
      .single();

    if (error) throw mapPgError(error.code, error.message);
    return row as PersonIdentifierDTO;
  });
