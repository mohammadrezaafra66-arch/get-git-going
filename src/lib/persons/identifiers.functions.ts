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
 * Identifiers whose value genuinely designates ONE party, so a collision is a
 * real conflict even before verification. Mirrors the DB partial unique index
 * `uq_person_identifiers_strong_active` (migration 228) — keep the two in sync.
 */
const STRONG_IDENTIFIER_KINDS: ReadonlySet<IdentifierKind> = new Set([
  "national_id_ir",
  "tax_id_ir",
  "company_reg_id_ir",
  "iban",
]);

/**
 * Cross-person duplicate guard.
 *
 * Originally (S12) this rejected ANY non-revoked cross-person duplicate. That
 * matched the old `uq_person_identifiers_active_kind_value` index, which
 * migration 228 removed as blocker B3: two family members could not both
 * register a shared landline, and a mistyped provisional phone permanently
 * blocked its real owner.
 *
 * The rule now mirrors the database exactly:
 *   strong kinds (national/tax/company/IBAN) — conflict on any non-revoked row
 *   weak kinds  (mobile/landline/email/custom) — conflict only when BOTH the
 *                incoming row and the existing row are 'confirmed'
 *
 * Leaving the old behaviour here would have made the app stricter than the
 * schema, so B3 would have looked fixed in SQL while still failing in the UI.
 *
 * NOTE: the lookup uses the TypeScript-normalized value. Since migration 228
 * the DB normalizes authoritatively via trigger, so this probe is advisory —
 * the unique indexes remain the real guarantee.
 */
async function findCrossPersonDuplicate(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  args: {
    kind: IdentifierKind;
    value_normalized: string;
    person_id: string;
    status: "provisional" | "confirmed" | "revoked";
    excludeId?: string;
  },
): Promise<string | null> {
  const isStrong = STRONG_IDENTIFIER_KINDS.has(args.kind);

  // A weak identifier that is not being confirmed cannot collide with anything.
  if (!isStrong && args.status !== "confirmed") return null;

  let q = supabase
    .from("person_identifiers")
    .select("id, person_id, status")
    .eq("kind", args.kind)
    .eq("value_normalized", args.value_normalized)
    .neq("status", "revoked")
    .neq("person_id", args.person_id)
    .limit(1);
  // Weak identifiers only conflict with an already-CONFIRMED holder.
  if (!isStrong) q = q.eq("status", "confirmed");
  if (args.excludeId) q = q.neq("id", args.excludeId);

  const { data, error } = await q;
  if (error) throw mapPgError(error.code, error.message);
  if (data && data.length > 0) {
    return isStrong
      ? "این شناسه قبلاً برای شخص دیگری ثبت شده است."
      : "این شناسه قبلاً به‌صورت تأییدشده برای شخص دیگری ثبت شده است.";
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
      status: data.status,
    });
    if (dupMsg) throw new Error(dupMsg);

    // value_normalized is intentionally NOT sent: trg_person_identifiers_normalize
    // (migration 228) computes it from (kind, value_raw) on every write path, so
    // the database is the single authority. normalizeIdentifier() above is kept
    // for fast validation feedback and for the duplicate probe.
    const { data: row, error } = await supabase
      .from("person_identifiers")
      .insert({
        person_id: data.person_id,
        kind: data.kind,
        value_raw: data.value_raw.trim(),
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
    type CurRow = {
      kind: IdentifierKind;
      value_raw: string;
      value_normalized: string;
      status: string;
      person_id: string;
    };
    let cur: CurRow | null = null;
    if (wantsRevalue || wantsStatusChange) {
      const { data: row, error: curErr } = await supabase
        .from("person_identifiers")
        .select("kind, value_raw, value_normalized, status, person_id")
        .eq("id", data.id)
        .maybeSingle();
      if (curErr) throw mapPgError(curErr.code, curErr.message);
      if (!row) throw new Error("شناسه یافت نشد یا دسترسی به آن ندارید");
      cur = row as CurRow;
    }

    if (wantsRevalue && cur) {
      const effectiveKind = (data.kind ?? cur.kind) as IdentifierKind;
      const effectiveRaw = data.value_raw ?? cur.value_raw;
      const norm = normalizeIdentifier(effectiveKind, effectiveRaw);
      if (!norm.ok) throw new Error(norm.message_fa);

      if (data.kind !== undefined) patch.kind = data.kind;
      if (data.value_raw !== undefined) patch.value_raw = data.value_raw.trim();
      // Not patched into the row — trg_person_identifiers_normalize recomputes
      // it (migration 228). Held locally only for the duplicate probe below.
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
          status: effectiveStatus as "provisional" | "confirmed" | "revoked",
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
