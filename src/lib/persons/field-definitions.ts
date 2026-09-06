/**
 * Wave 6 B-4 — the query layer for `person_field_definitions` and `person_field_values`.
 *
 * THE SERVER SIDE OF THIS FEATURE WAS ALREADY COMPLETE. Both tables exist with RLS,
 * validation triggers, audit triggers, and a whole function layer
 * (`getPerson`/`updatePerson`/`createPerson` -> `person_create_full`). What did not exist was
 * any UI: `grep -rln "person_field" src/` returned only `lib/persons/functions.ts` and
 * `schemas.ts`, and not one `.tsx` file. This file adds NO backend anything — every column it
 * reads was verified present first.
 *
 * FIELD TYPES: there are SEVEN, not five, and boolean is `'bool'`, not `'boolean'`. Taken from
 * the live CHECK constraint, verbatim:
 *   CHECK (field_type = ANY (ARRAY['text','number','date','bool','select','multiselect','jsonb']))
 *   CHECK (applies_to_kind = ANY (ARRAY['individual','organization','both']))
 *
 * RLS, measured, and NOT re-implemented here:
 *   pfd_select_active_all_authed  is_active = true OR admin/manager
 *   pfd_insert_admin_manager      admin/manager
 *   pfd_update_admin_manager      admin/manager
 *   pfv_select_via_person         via the person's visibility_scope
 *   pfv_update_admin_manager      admin/manager
 */
import { supabase } from "@/integrations/supabase/client";

/** The seven values the CHECK constraint allows. Not five, and boolean is 'bool'. */
export const PERSON_FIELD_TYPES = [
  "text",
  "number",
  "date",
  "bool",
  "select",
  "multiselect",
  "jsonb",
] as const;
export type PersonFieldType = (typeof PERSON_FIELD_TYPES)[number];

export const PERSON_FIELD_TYPE_FA: Record<PersonFieldType, string> = {
  text: "متن",
  number: "عدد",
  date: "تاریخ",
  bool: "بله / خیر",
  select: "انتخاب یکی",
  multiselect: "انتخاب چند مورد",
  jsonb: "داده ساخت‌یافته (JSON)",
};

export const PERSON_FIELD_KINDS = ["individual", "organization", "both"] as const;
export type PersonFieldKind = (typeof PERSON_FIELD_KINDS)[number];

export const PERSON_FIELD_KIND_FA: Record<PersonFieldKind, string> = {
  individual: "فقط اشخاص حقیقی",
  organization: "فقط اشخاص حقوقی",
  both: "هر دو",
};

export interface PersonFieldDefinition {
  id: string;
  name: string;
  label: string;
  field_type: PersonFieldType;
  options: unknown;
  is_required: boolean;
  is_active: boolean;
  sort_order: number;
  help_text: string | null;
  validation_regex: string | null;
  applies_to_kind: PersonFieldKind;
  created_at: string;
  updated_at: string;
}

const DEF_COLUMNS =
  "id, name, label, field_type, options, is_required, is_active, sort_order, help_text, validation_regex, applies_to_kind, created_at, updated_at";

/**
 * All definitions the caller may see. An admin/manager sees inactive ones too — that is
 * `pfd_select_active_all_authed`'s job, not this function's, so there is no role check here.
 */
export async function listPersonFieldDefinitions(): Promise<PersonFieldDefinition[]> {
  const { data, error } = await supabase
    .from("person_field_definitions")
    .select(DEF_COLUMNS)
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as PersonFieldDefinition[];
}

export type PersonFieldDefinitionInput = {
  name: string;
  label: string;
  field_type: PersonFieldType;
  applies_to_kind: PersonFieldKind;
  is_required: boolean;
  is_active: boolean;
  sort_order: number;
  help_text: string | null;
  validation_regex: string | null;
  /** Only meaningful for select / multiselect. Stored in the jsonb `options` column. */
  options: string[] | null;
};

export async function createPersonFieldDefinition(
  input: PersonFieldDefinitionInput,
): Promise<void> {
  const { error } = await supabase
    .from("person_field_definitions")
    .insert({ ...input, options: input.options ?? null } as never);
  if (error) throw new Error(error.message);
}

export async function updatePersonFieldDefinition(
  id: string,
  patch: Partial<PersonFieldDefinitionInput>,
): Promise<void> {
  const { error } = await supabase
    .from("person_field_definitions")
    .update(patch as never)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export interface PersonFieldValueRow {
  id: string;
  person_id: string;
  field_definition_id: string;
  value: unknown;
  updated_at: string;
}

/** The stored values for one person. */
export async function listPersonFieldValues(personId: string): Promise<PersonFieldValueRow[]> {
  const { data, error } = await supabase
    .from("person_field_values")
    .select("id, person_id, field_definition_id, value, updated_at")
    .eq("person_id", personId);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as PersonFieldValueRow[];
}

/**
 * Person ids whose value for one definition matches. Used by the person-list filter.
 *
 * The match is EXACT, not a substring, and that is a deliberate correctness choice rather than
 * a simplification. `value` is a jsonb column holding a top-level SCALAR for every type except
 * multiselect and jsonb, and PostgREST's `->>` operator addresses a key or an array index — it
 * does not address a scalar. (Postgres happens to return the scalar for `'"gold"'::jsonb ->> 0`,
 * but that is a quirk to rely on, not a contract.) Exact jsonb equality is well defined for
 * text, select, number and bool alike, so the filter uses `value = to_jsonb(needle)`, which is
 * what PostgREST sends for `.eq` against a jsonb column.
 *
 * `needle` is therefore JSON-encoded here. An empty needle means "has any value for this
 * field", which is a genuinely useful filter in its own right.
 *
 * Bounded by `limit` — the caller intersects the result with its own query (rule 11).
 */
export async function findPersonIdsByFieldValue(
  fieldDefinitionId: string,
  needle: string,
  limit = 500,
): Promise<string[]> {
  let q = supabase
    .from("person_field_values")
    .select("person_id")
    .eq("field_definition_id", fieldDefinitionId)
    .limit(limit);

  const trimmed = needle.trim();
  if (trimmed) {
    // Numbers and booleans are stored unquoted; everything else as a JSON string.
    const encoded =
      trimmed === "true" || trimmed === "false"
        ? trimmed
        : Number.isFinite(Number(trimmed)) && trimmed !== ""
          ? trimmed
          : JSON.stringify(trimmed);
    q = q.eq("value", encoded as never);
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => (r as { person_id: string }).person_id);
}

/** Render one stored jsonb value as Persian-readable text. */
export function formatFieldValue(value: unknown, type: PersonFieldType): string {
  if (value === null || value === undefined || value === "") return "—";
  if (type === "bool") return value === true || value === "true" ? "بله" : "خیر";
  if (type === "multiselect" && Array.isArray(value)) return value.join("، ");
  if (type === "jsonb" && typeof value === "object") return JSON.stringify(value);
  return String(value);
}
