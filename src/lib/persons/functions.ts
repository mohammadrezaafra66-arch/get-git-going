/**
 * Phase 2 — Persons Core (S07 correction)
 *
 * Server-side write/read path for `public.persons` (+ optional field_values).
 *
 * Responsibilities:
 *  - Validate input with Zod.
 *  - Enforce required-field rules against active person_field_definitions.
 *  - Delegate row-level authorization to RLS (S04/S05). admin/manager only
 *    for INSERT/UPDATE of persons and field values.
 *  - Preserve S04/S05 audit triggers — handlers perform plain DML.
 *  - Return safe DTOs (no raw error leakage).
 *
 * Atomicity note:
 *  Supabase JS client does not expose multi-table transactions. createPerson
 *  + field_values are issued as separate INSERTs. If a field_values insert
 *  fails after the parent row exists, the parent is NOT rolled back. The
 *  required-field check runs BEFORE any INSERT to minimize the partial-write
 *  window. Truly atomic creation requires a Postgres function (deferred to
 *  a future step).
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  CreatePersonInputSchema,
  UpdatePersonInputSchema,
  type CreatePersonInput,
  type PersonDTO,
  type PersonFieldValueDTO,
  type PersonFieldValueInput,
  type PersonKind,
  type PersonWithFieldValuesDTO,
  type UpdatePersonInput,
} from "./schemas";

const GetPersonInputSchema = z.object({
  id: z.string().uuid({ message: "شناسه شخص نامعتبر است" }),
});

function mapPgError(code: string | undefined, message: string): Error {
  if (code === "23505") return new Error("مقدار تکراری است");
  if (code === "42501") return new Error("دسترسی لازم برای این عملیات را ندارید");
  if (code === "23514") return new Error("مقدار وارد شده با محدودیت‌های پایگاه داده سازگار نیست");
  if (code === "23503") return new Error("ارجاع نامعتبر — رکورد مرتبط یافت نشد");
  return new Error(message || "خطای ناشناخته در پایگاه داده");
}

/**
 * Guarantee any thrown value bubbles out of a serverFn handler as a proper
 * `Error` with a Persian message. Without this, raw `Response` objects or
 * non-Error rejections cross the serverFn boundary and the client surfaces
 * them as the literal string "[object Response]", blanking the page.
 */
function toServerError(e: unknown): Error {
  if (e instanceof Error) return e;
  if (typeof Response !== "undefined" && e instanceof Response) {
    if (e.status === 401) return new Error("نشست کاربری معتبر نیست. لطفاً دوباره وارد شوید.");
    if (e.status === 403) return new Error("دسترسی لازم برای این عملیات را ندارید");
    return new Error(`خطای سرور (${e.status})`);
  }
  if (e && typeof e === "object") {
    const obj = e as { code?: string; message?: string };
    if (obj.code || obj.message) return mapPgError(obj.code, obj.message ?? "");
  }
  return new Error("خطای ناشناخته در پردازش درخواست");
}

function valueIsEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim().length === 0;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v as object).length === 0;
  return false;
}

/**
 * Server-side required-field enforcement.
 *
 * Loads all active person_field_definitions with is_required=true that apply
 * to the given person kind (matches the kind or applies_to_kind='both'), then
 * verifies every such definition has a non-empty value in `fieldValues`.
 *
 * Returns the list of missing definition labels. Empty array means OK.
 *
 * The caller must throw or surface an error if the array is non-empty.
 */
export async function validateRequiredPersonFields(
  // The authenticated Supabase client from requireSupabaseAuth context.
  // Typed loosely to avoid coupling this helper to Database<> generics.
  supabase: {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (
          c: string,
          v: unknown,
        ) => {
          eq: (
            c: string,
            v: unknown,
          ) => {
            in: (c: string, vals: unknown[]) => Promise<{ data: unknown; error: unknown }>;
          };
        };
      };
    };
  },
  personKind: PersonKind,
  fieldValues: PersonFieldValueInput[],
): Promise<{ ok: true } | { ok: false; missing: Array<{ id: string; label: string }> }> {
  const { data, error } = await supabase
    .from("person_field_definitions")
    .select("id, label, applies_to_kind")
    .eq("is_active", true)
    .eq("is_required", true)
    .in("applies_to_kind", [personKind, "both"]);

  if (error) {
    const e = error as { code?: string; message?: string };
    throw mapPgError(e.code, e.message ?? "");
  }

  const required = (data as Array<{ id: string; label: string }> | null) ?? [];
  const provided = new Map<string, unknown>();
  for (const fv of fieldValues) provided.set(fv.field_definition_id, fv.value);

  const missing: Array<{ id: string; label: string }> = [];
  for (const def of required) {
    if (!provided.has(def.id) || valueIsEmpty(provided.get(def.id))) {
      missing.push({ id: def.id, label: def.label });
    }
  }
  return missing.length === 0 ? { ok: true } : { ok: false, missing };
}

async function insertFieldValues(
  // Loosely typed — matches the authenticated client from middleware context.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  personId: string,
  fieldValues: PersonFieldValueInput[],
): Promise<PersonFieldValueDTO[]> {
  if (fieldValues.length === 0) return [];
  const rows = fieldValues.map((fv) => ({
    person_id: personId,
    field_definition_id: fv.field_definition_id,
    value: fv.value as never,
  }));
  const { data, error } = await supabase
    .from("person_field_values")
    .insert(rows)
    .select("id, person_id, field_definition_id, value, updated_at");
  if (error) throw mapPgError(error.code, error.message);
  return (data as PersonFieldValueDTO[]) ?? [];
}

/* ---------- createPerson ---------- */

export const createPerson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => CreatePersonInputSchema.parse(input))
  .handler(async ({ data, context }): Promise<PersonWithFieldValuesDTO> => {
    try {
      const input: CreatePersonInput = data;
      const { supabase } = context;

      // Required-field pre-check (best-effort: not atomic with INSERTs).
      const check = await validateRequiredPersonFields(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase as any,
        input.kind,
        input.field_values,
      );
      if (!check.ok) {
        const labels = check.missing.map((m) => m.label).join("، ");
        throw new Error(`فیلدهای الزامی تکمیل نشده: ${labels}`);
      }

      const { data: personRow, error: personErr } = await supabase
        .from("persons")
        .insert({
          kind: input.kind,
          display_name: input.display_name,
          legal_name: input.legal_name ?? null,
          visibility_scope: input.visibility_scope,
          is_active: input.is_active,
          notes: input.notes ?? null,
        })
        .select(
          "id, kind, display_name, legal_name, visibility_scope, is_active, notes, created_by, created_at, updated_at",
        )
        .single();
      if (personErr) throw mapPgError(personErr.code, personErr.message);
      if (!personRow) throw new Error("ایجاد شخص ناموفق بود — رکوردی بازگردانده نشد");

      const person = personRow as PersonDTO;
      const values = await insertFieldValues(supabase, person.id, input.field_values);

      return { ...person, field_values: values };
    } catch (e) {
      throw toServerError(e);
    }
  });

/* ---------- updatePerson ---------- */

export const updatePerson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => UpdatePersonInputSchema.parse(input))
  .handler(async ({ data, context }): Promise<PersonWithFieldValuesDTO> => {
    try {
      const input: UpdatePersonInput = data;
      const { supabase } = context;

      // Build sparse patch.
      const patch: {
        kind?: PersonKind;
        display_name?: string;
        legal_name?: string | null;
        visibility_scope?: PersonDTO["visibility_scope"];
        is_active?: boolean;
        notes?: string | null;
      } = {};
      if (input.kind !== undefined) patch.kind = input.kind;
      if (input.display_name !== undefined) patch.display_name = input.display_name;
      if (input.legal_name !== undefined) patch.legal_name = input.legal_name ?? null;
      if (input.visibility_scope !== undefined) patch.visibility_scope = input.visibility_scope;
      if (input.is_active !== undefined) patch.is_active = input.is_active;
      if (input.notes !== undefined) patch.notes = input.notes ?? null;

      // If field_values are provided, re-validate required against effective kind.
      if (input.field_values !== undefined && input.field_values.length > 0) {
        // Need the current kind to evaluate against effective kind.
        const { data: cur, error: curErr } = await supabase
          .from("persons")
          .select("kind")
          .eq("id", input.id)
          .maybeSingle();
        if (curErr) throw mapPgError(curErr.code, curErr.message);
        if (!cur) throw new Error("شخص یافت نشد یا دسترسی به آن ندارید");

        const effectiveKind = (patch.kind ?? (cur.kind as PersonKind)) as PersonKind;
        const check = await validateRequiredPersonFields(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          supabase as any,
          effectiveKind,
          input.field_values,
        );
        if (!check.ok) {
          const labels = check.missing.map((m) => m.label).join("، ");
          throw new Error(`فیلدهای الزامی تکمیل نشده: ${labels}`);
        }
      }

      let person: PersonDTO;
      if (Object.keys(patch).length > 0) {
        const { data: row, error } = await supabase
          .from("persons")
          .update(patch)
          .eq("id", input.id)
          .select(
            "id, kind, display_name, legal_name, visibility_scope, is_active, notes, created_by, created_at, updated_at",
          )
          .single();
        if (error) throw mapPgError(error.code, error.message);
        person = row as PersonDTO;
      } else {
        const { data: row, error } = await supabase
          .from("persons")
          .select(
            "id, kind, display_name, legal_name, visibility_scope, is_active, notes, created_by, created_at, updated_at",
          )
          .eq("id", input.id)
          .single();
        if (error) throw mapPgError(error.code, error.message);
        person = row as PersonDTO;
      }

      // Upsert field values one-by-one (per-row upsert to respect unique
      // (person_id, field_definition_id) and surface per-row RLS denials).
      const upserted: PersonFieldValueDTO[] = [];
      if (input.field_values) {
        for (const fv of input.field_values) {
          const { data: row, error } = await supabase
            .from("person_field_values")
            .upsert(
              {
                person_id: person.id,
                field_definition_id: fv.field_definition_id,
                value: fv.value as never,
              },
              { onConflict: "person_id,field_definition_id" },
            )
            .select("id, person_id, field_definition_id, value, updated_at")
            .single();
          if (error) throw mapPgError(error.code, error.message);
          upserted.push(row as PersonFieldValueDTO);
        }
      }

      return { ...person, field_values: upserted };
    } catch (e) {
      throw toServerError(e);
    }
  });

/* ---------- getPerson ---------- */

export const getPerson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => GetPersonInputSchema.parse(input))
  .handler(async ({ data, context }): Promise<PersonWithFieldValuesDTO | null> => {
    try {
      const { supabase } = context;
      const { data: personRow, error: personErr } = await supabase
        .from("persons")
        .select(
          "id, kind, display_name, legal_name, visibility_scope, is_active, notes, created_by, created_at, updated_at",
        )
        .eq("id", data.id)
        .maybeSingle();
      if (personErr) throw mapPgError(personErr.code, personErr.message);
      if (!personRow) return null;

      const { data: fvRows, error: fvErr } = await supabase
        .from("person_field_values")
        .select("id, person_id, field_definition_id, value, updated_at")
        .eq("person_id", data.id);
      if (fvErr) throw mapPgError(fvErr.code, fvErr.message);

      return {
        ...(personRow as PersonDTO),
        field_values: (fvRows as PersonFieldValueDTO[]) ?? [],
      };
    } catch (e) {
      throw toServerError(e);
    }
  });
