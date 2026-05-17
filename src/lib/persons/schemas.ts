/**
 * Phase 2 — Persons Core (S07 correction)
 *
 * Shared Zod schemas and TypeScript types for the persons domain.
 * Pure module — safe to import from both server and client code.
 * Does NOT touch Supabase / process.env.
 */

import { z } from "zod";
import { IDENTIFIER_KINDS, type IdentifierKind } from "./identifiers-normalize";

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
export const PersonFieldValueJsonSchema: z.ZodType<unknown> = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.unknown()),
  z.record(z.string(), z.unknown()),
]);

/** One entry of {definition_id, value} provided alongside a person mutation */
export const PersonFieldValueInputSchema = z.object({
  field_definition_id: z.string().uuid({ message: "شناسه تعریف فیلد نامعتبر است" }),
  value: PersonFieldValueJsonSchema,
});
export type PersonFieldValueInput = z.infer<typeof PersonFieldValueInputSchema>;

export const CreatePersonInputSchema = z.object({
  kind: z.enum(PERSON_KINDS),
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

export const IdentifierKindEnum = z.enum(
  IDENTIFIER_KINDS as unknown as [IdentifierKind, ...IdentifierKind[]],
);
export const IdentifierStatusEnum = z.enum(["provisional", "confirmed", "revoked"]);

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
  value: unknown;
  updated_at: string;
};

export type PersonWithFieldValuesDTO = PersonDTO & {
  field_values: PersonFieldValueDTO[];
};
