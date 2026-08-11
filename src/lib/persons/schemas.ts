/**
 * Phase 2 — Persons Core (S07 correction)
 *
 * Shared Zod schemas and TypeScript types for the persons domain.
 * Pure module — safe to import from both server and client code.
 * Does NOT touch Supabase / process.env.
 */

import { z } from "zod";
import { IDENTIFIER_KINDS, type IdentifierKind } from "./identifiers-normalize";
import { PersonContextKindEnum } from "./context-links.schemas";

/** Serializable JSON value — used for jsonb fields shipped across serverFn boundary. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/* ---------- persons ---------- */

export const PERSON_KINDS = ["individual", "organization"] as const;
export type PersonKind = (typeof PERSON_KINDS)[number];

export const PERSON_VISIBILITY_SCOPES = [
  "internal_general",
  "restricted_finance",
  "restricted_executive",
] as const;
export type PersonVisibilityScope = (typeof PERSON_VISIBILITY_SCOPES)[number];

/** jsonb value stored in person_field_values.value */
export const PersonFieldValueJsonSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(PersonFieldValueJsonSchema),
    z.record(z.string(), PersonFieldValueJsonSchema),
  ]),
);

/** One entry of {definition_id, value} provided alongside a person mutation */
export const PersonFieldValueInputSchema = z.object({
  field_definition_id: z.string().uuid({ message: "شناسه تعریف فیلد نامعتبر است" }),
  value: PersonFieldValueJsonSchema,
});
export type PersonFieldValueInput = z.infer<typeof PersonFieldValueInputSchema>;

export const IdentifierKindEnum = z.enum(
  IDENTIFIER_KINDS as unknown as [IdentifierKind, ...IdentifierKind[]],
);
export const IdentifierStatusEnum = z.enum(["provisional", "confirmed", "revoked"]);

/**
 * Identifier supplied INLINE with a person creation (item 226).
 *
 * Deliberately has no `person_id` — the person does not exist yet. The raw
 * value is normalized server-side by normalizeIdentifier() before it reaches
 * person_create_full(); the DB never normalizes (see the migration header).
 */
export const CreatePersonIdentifierSchema = z.object({
  kind: IdentifierKindEnum,
  value_raw: z
    .string()
    .min(1, "مقدار شناسه نمی‌تواند خالی باشد")
    .max(512, "طول مقدار شناسه بیش از حد مجاز است"),
  is_primary: z.boolean().optional().default(false),
  status: IdentifierStatusEnum.optional().default("provisional"),
});
export type CreatePersonIdentifier = z.infer<typeof CreatePersonIdentifierSchema>;

/**
 * `kind` defaults to 'individual' and everything except `display_name` is
 * optional — a person must be creatable from a name alone, because roles and
 * profile data must never be preconditions for introducing a person.
 */
export const CreatePersonInputSchema = z.object({
  kind: z.enum(PERSON_KINDS).optional().default("individual"),
  display_name: z
    .string()
    .trim()
    .min(1, "نام نمایشی نمی‌تواند خالی باشد")
    .max(255, "طول نام نمایشی بیش از حد مجاز است"),
  legal_name: z.string().trim().max(255).optional().nullable(),
  visibility_scope: z.enum(PERSON_VISIBILITY_SCOPES).optional().default("internal_general"),
  is_active: z.boolean().optional().default(true),
  notes: z.string().trim().max(2000).optional().nullable(),
  field_values: z.array(PersonFieldValueInputSchema).optional().default([]),
  identifiers: z.array(CreatePersonIdentifierSchema).optional().default([]),
  /** Optional provenance: where this person was introduced from. Never a gate. */
  context_kind: PersonContextKindEnum.optional().nullable(),
  context_ref_table: z.string().trim().max(63).optional().nullable(),
  context_ref_id: z.string().uuid().optional().nullable(),
  context_note: z.string().trim().max(2000).optional().nullable(),
});
export type CreatePersonInput = z.infer<typeof CreatePersonInputSchema>;

export const UpdatePersonInputSchema = z.object({
  id: z.string().uuid({ message: "شناسه شخص نامعتبر است" }),
  kind: z.enum(PERSON_KINDS).optional(),
  display_name: z.string().trim().min(1).max(255).optional(),
  legal_name: z.string().trim().max(255).optional().nullable(),
  visibility_scope: z.enum(PERSON_VISIBILITY_SCOPES).optional(),
  is_active: z.boolean().optional(),
  notes: z.string().trim().max(2000).optional().nullable(),
  field_values: z.array(PersonFieldValueInputSchema).optional(),
});
export type UpdatePersonInput = z.infer<typeof UpdatePersonInputSchema>;

/* ---------- identifiers (shared input shape) ---------- */

export const PersonIdentifierInputSchema = z.object({
  person_id: z.string().uuid({ message: "شناسه شخص نامعتبر است" }),
  kind: IdentifierKindEnum,
  value_raw: z
    .string()
    .min(1, "مقدار شناسه نمی‌تواند خالی باشد")
    .max(512, "طول مقدار شناسه بیش از حد مجاز است"),
  status: IdentifierStatusEnum.optional().default("provisional"),
  is_primary: z.boolean().optional().default(false),
});
export type PersonIdentifierInput = z.infer<typeof PersonIdentifierInputSchema>;

/** Alias kept for explicitness — same shape as PersonIdentifierInput. */
export const AddPersonIdentifierInputSchema = PersonIdentifierInputSchema;
export type AddPersonIdentifierInput = PersonIdentifierInput;

export const UpdatePersonIdentifierInputSchema = z.object({
  id: z.string().uuid({ message: "شناسه ردیف نامعتبر است" }),
  value_raw: z.string().min(1).max(512).optional(),
  kind: IdentifierKindEnum.optional(),
  status: IdentifierStatusEnum.optional(),
  is_primary: z.boolean().optional(),
});
export type UpdatePersonIdentifierInput = z.infer<typeof UpdatePersonIdentifierInputSchema>;

export const RevokePersonIdentifierInputSchema = z.object({
  id: z.string().uuid({ message: "شناسه ردیف نامعتبر است" }),
});
export type RevokePersonIdentifierInput = z.infer<typeof RevokePersonIdentifierInputSchema>;

/* ---------- DTOs ---------- */

export type PersonDTO = {
  id: string;
  kind: PersonKind;
  display_name: string;
  legal_name: string | null;
  visibility_scope: PersonVisibilityScope;
  is_active: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type PersonFieldValueDTO = {
  id: string;
  person_id: string;
  field_definition_id: string;
  value: JsonValue;
  updated_at: string;
};

export type PersonWithFieldValuesDTO = PersonDTO & {
  field_values: PersonFieldValueDTO[];
};

/* ---------- searchPersons (S19B) ---------- */

/**
 * Read-only person picker search input.
 *
 * Behavior:
 *  - `query` is trimmed; if its trimmed length is < 2 the serverFn returns []
 *    (cheap, predictable, no PG round-trip).
 *  - `limit` is clamped server-side to [1..20]; default 20.
 *  - `kind` defaults to "all" → no kind filter.
 *  - `include_inactive` defaults to false → only active rows.
 */
export const SearchPersonsInputSchema = z.object({
  query: z.string().max(80, "طول عبارت جستجو بیش از حد مجاز است"),
  limit: z.number().int().min(1).max(20).optional().default(20),
  kind: z.enum(["individual", "organization", "all"]).optional().default("all"),
  include_inactive: z.boolean().optional().default(false),
});
export type SearchPersonsInput = z.infer<typeof SearchPersonsInputSchema>;

/**
 * Narrow picker DTO — INTENTIONALLY excludes notes, identifiers, field_values,
 * created_by, audit timestamps, and visibility_scope. Do NOT widen this shape
 * without a fresh RLS/leak review.
 */
export type SearchPersonResultDTO = {
  id: string;
  display_name: string;
  legal_name: string | null;
  kind: PersonKind;
  is_active: boolean;
};
