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

import { createServerFn, createMiddleware } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  CreatePersonInputSchema,
  SearchPersonsInputSchema,
  UpdatePersonInputSchema,
  type CreatePersonInput,
  type PersonDTO,
  type PersonFieldValueDTO,
  type PersonFieldValueInput,
  type PersonKind,
  type PersonWithFieldValuesDTO,
  type SearchPersonResultDTO,
  type SearchPersonsInput,
  type UpdatePersonInput,
} from "./schemas";
import { normalizeIdentifier } from "./identifiers-normalize";

const GetPersonInputSchema = z.object({
  id: z.string().uuid({ message: "شناسه شخص نامعتبر است" }),
});

/**
 * Diagnostic + error-normalization middleware.
 *
 * `requireSupabaseAuth` (auto-generated, must not be edited) short-circuits
 * with `throw new Response(...)` on auth failure. In TanStack Start's Worker
 * SSR runtime, h3 swallows a thrown `Response` from a serverFn middleware and
 * collapses it into the opaque envelope
 *   { status: 500, unhandled: true, message: "HTTPError" }
 * dropping the original status and body. The browser then sees a generic 500
 * even though the real reason is concrete (missing header, invalid token,
 * missing env, etc.) and no log line is written.
 *
 * This wrapper runs BEFORE `requireSupabaseAuth` in the middleware chain. It
 * awaits `next()`, catches any thrown `Response`, logs a sanitized line
 * (status + truncated body — never tokens/cookies/secrets), and re-throws a
 * proper `Error` with a Persian message so the client receives a real
 * actionable error instead of `HTTPError`.
 *
 * It does NOT bypass authentication: the original throw is re-raised as an
 * Error, so the handler still never runs on auth failure.
 */
const surfaceAuthError = createMiddleware({ type: "function" }).server(async ({ next }) => {
  try {
    return await next();
  } catch (e) {
    if (typeof Response !== "undefined" && e instanceof Response) {
      let body = "";
      try {
        body = (await e.clone().text()).slice(0, 200);
      } catch {
        /* ignore body read failure */
      }
      console.error(
        `[persons.serverFn] auth/middleware threw Response status=${e.status} body=${JSON.stringify(body)}`,
      );
      if (e.status === 401) {
        throw new Error("نشست کاربری معتبر نیست. لطفاً دوباره وارد شوید.");
      }
      if (e.status === 403) {
        throw new Error("دسترسی لازم برای این عملیات را ندارید");
      }
      throw new Error(`خطای سرور (${e.status})`);
    }
    if (e instanceof Error) {
      console.error(
        `[persons.serverFn] handler/middleware threw Error name=${e.name} message=${JSON.stringify(e.message).slice(0, 200)}`,
      );
      throw e;
    }
    console.error(
      `[persons.serverFn] non-Error throw type=${typeof e} value=${JSON.stringify(e)?.slice(0, 200)}`,
    );
    throw new Error("خطای ناشناخته در پردازش درخواست");
  }
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

/**
 * @deprecated Superseded by public.person_create_full() (item 226). createPerson
 * no longer issues separate field-value INSERTs. Retained only because removing
 * it is out of scope for this phase; delete once no caller remains.
 */
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

/**
 * Atomic person creation — item 226.
 *
 * Delegates the whole write to `public.person_create_full()`, which inserts
 * persons + person_identifiers + person_field_values + an optional
 * person_context_links observation inside ONE function body, i.e. one
 * transaction. This closes the partial-write window described in the module
 * header: previously the person row and its field values were separate round
 * trips and a failure on the second left an orphan person behind.
 *
 * Division of responsibility (deliberate — do not "fix" by duplicating):
 *   - Normalization of identifier values: TypeScript only (normalizeIdentifier).
 *   - Uniqueness + required-field enforcement + authorization: database only.
 *
 * The old client-side required-field pre-check was dropped so the rule has a
 * single implementation. `validateRequiredPersonFields` is still used by
 * updatePerson and remains exported.
 */
export const createPerson = createServerFn({ method: "POST" })
  .middleware([surfaceAuthError, requireSupabaseAuth])
  .inputValidator((input) => CreatePersonInputSchema.parse(input))
  .handler(async ({ data, context }): Promise<PersonWithFieldValuesDTO> => {
    try {
      const input: CreatePersonInput = data;
      const { supabase } = context;

      // Normalize before any write, so an invalid identifier fails fast and
      // never leaves a half-created person behind.
      const identifiers = input.identifiers.map((idf) => {
        const norm = normalizeIdentifier(idf.kind, idf.value_raw);
        if (!norm.ok) throw new Error(norm.message_fa);
        return {
          kind: idf.kind,
          value_raw: idf.value_raw,
          value_normalized: norm.value_normalized,
          is_primary: idf.is_primary,
          status: idf.status,
        };
      });

      const { data: rpcRes, error: rpcErr } = await supabase.rpc("person_create_full", {
        p_display_name: input.display_name,
        p_kind: input.kind,
        p_legal_name: input.legal_name ?? null,
        p_visibility_scope: input.visibility_scope,
        p_notes: input.notes ?? null,
        p_is_active: input.is_active,
        p_identifiers: identifiers,
        p_field_values: input.field_values,
        p_context_kind: input.context_kind ?? null,
        p_context_ref_table: input.context_ref_table ?? null,
        p_context_ref_id: input.context_ref_id ?? null,
        p_context_note: input.context_note ?? null,
      });
      if (rpcErr) throw mapPgError(rpcErr.code, rpcErr.message);

      const personId = (rpcRes as { person_id?: string } | null)?.person_id;
      if (!personId) throw new Error("ایجاد شخص ناموفق بود — شناسه‌ای بازگردانده نشد");

      // Read back the committed row (and any field values) for the DTO.
      const { data: personRow, error: readErr } = await supabase
        .from("persons")
        .select(
          "id, kind, display_name, legal_name, visibility_scope, is_active, notes, created_by, created_at, updated_at",
        )
        .eq("id", personId)
        .single();
      if (readErr) throw mapPgError(readErr.code, readErr.message);
      if (!personRow) throw new Error("ایجاد شخص ناموفق بود — رکوردی بازگردانده نشد");

      const { data: fvRows, error: fvErr } = await supabase
        .from("person_field_values")
        .select("id, person_id, field_definition_id, value, updated_at")
        .eq("person_id", personId);
      if (fvErr) throw mapPgError(fvErr.code, fvErr.message);

      return {
        ...(personRow as PersonDTO),
        field_values: (fvRows as PersonFieldValueDTO[] | null) ?? [],
      };
    } catch (e) {
      throw toServerError(e);
    }
  });

/* ---------- updatePerson ---------- */

export const updatePerson = createServerFn({ method: "POST" })
  .middleware([surfaceAuthError, requireSupabaseAuth])
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
  .middleware([surfaceAuthError, requireSupabaseAuth])
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

/* ---------- searchPersons (S19B) ---------- */

/**
 * Sanitize a free-text search term for safe use inside a PostgREST `.or()`
 * ilike filter. PostgREST parses the filter string itself, so commas /
 * parentheses / quotes can change the meaning of the query, and `%` / `_`
 * are SQL ilike wildcards we do not want users to inject. We replace any
 * such character with a single space and collapse whitespace.
 */
function sanitizeSearchTerm(raw: string): string {
  return raw
    .replace(/[%_,()*"'\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Read-only person picker search — Phase 2.
 *
 * Delegates to `public.search_visible_persons` (migration 298, SECURITY INVOKER).
 * Identifier/alias matching is enforced inside the RPC under RLS; this serverFn
 * never queries person_identifiers directly and never uses a service role.
 *
 * Narrow DTO only — id, display_name, legal_name, kind, is_active.
 * If trimmed query length < 2 → returns [] without hitting the DB (picker UX).
 */
export const searchPersons = createServerFn({ method: "POST" })
  .middleware([surfaceAuthError, requireSupabaseAuth])
  .inputValidator((input) => SearchPersonsInputSchema.parse(input))
  .handler(async ({ data, context }): Promise<SearchPersonResultDTO[]> => {
    try {
      const input: SearchPersonsInput = data;
      const term = sanitizeSearchTerm(input.query ?? "");
      if (term.length < 2) return [];

      const { supabase } = context;
      const { data: rows, error } = await supabase.rpc("search_visible_persons", {
        p_query: term,
        p_limit: input.limit,
        p_offset: 0,
        p_kind: input.kind === "all" ? null : input.kind,
      });
      if (error) throw mapPgError(error.code, error.message);

      const mapped = ((rows as Array<{
        id: string;
        display_name: string;
        legal_name: string | null;
        kind: PersonKind;
        is_active: boolean;
      }> | null) ?? [])
        .filter((r) => (input.include_inactive ? true : r.is_active))
        .map((r) => ({
          id: r.id,
          display_name: r.display_name,
          legal_name: r.legal_name,
          kind: r.kind,
          is_active: r.is_active,
        }));

      return mapped;
    } catch (e) {
      throw toServerError(e);
    }
  });
