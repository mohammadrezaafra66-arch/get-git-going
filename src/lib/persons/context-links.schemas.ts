/**
 * Phase 2 — Persons Core (S10)
 *
 * Shared Zod schemas + types for `public.person_context_links`.
 * Pure module — safe to import from server and client code.
 * Does NOT touch Supabase / process.env.
 *
 * Mirrors the CHECK constraint in the S09 migration
 * (person_context_links_context_kind_check). Keep in sync with DB.
 */

import { z } from "zod";

export const PERSON_CONTEXT_KINDS = [
  "customer",
  "supplier",
  "driver",
  "sender",
  "receiver",
  "referrer",
  "marketer",
  "representative",
  "complainant",
  "returner",
  "staff_link",
  "credit_party",
  "accounting_party",
  "delivery_party",
  "purchase_owner",
  "sales_expert",
  "warehouse_owner",
  "other",
] as const;
export type PersonContextKind = (typeof PERSON_CONTEXT_KINDS)[number];

export const PersonContextKindEnum = z.enum(PERSON_CONTEXT_KINDS);

/** Optional ref pointer — both NULL or both set (DB enforces). */
const RefTableSchema = z
  .string()
  .trim()
  .min(1)
  .max(63)
  .regex(/^[a-z_][a-z0-9_]*$/i, "نام جدول مرجع نامعتبر است");

const NoteSchema = z.string().trim().max(2000).nullable().optional();

export const ListPersonContextLinksInputSchema = z.object({
  person_id: z.string().uuid({ message: "شناسه شخص نامعتبر است" }),
  context_kind: PersonContextKindEnum.optional(),
  include_ended: z.boolean().optional().default(true),
});
export type ListPersonContextLinksInput = z.infer<typeof ListPersonContextLinksInputSchema>;

export const AddPersonContextLinkInputSchema = z
  .object({
    person_id: z.string().uuid({ message: "شناسه شخص نامعتبر است" }),
    context_kind: PersonContextKindEnum,
    ref_table: RefTableSchema.nullable().optional(),
    ref_id: z.string().uuid({ message: "شناسه ردیف مرجع نامعتبر است" }).nullable().optional(),
    note: NoteSchema,
    started_at: z.string().datetime({ offset: true }).optional(),
  })
  .superRefine((val, ctx) => {
    const hasTable = val.ref_table !== null && val.ref_table !== undefined;
    const hasId = val.ref_id !== null && val.ref_id !== undefined;
    if (hasTable !== hasId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "جدول مرجع و شناسه مرجع باید همزمان مقدار داشته باشند یا هر دو خالی باشند",
        path: ["ref_table"],
      });
    }
  });
export type AddPersonContextLinkInput = z.infer<typeof AddPersonContextLinkInputSchema>;

/**
 * Update is intentionally narrow: only `note` and `started_at`.
 * Changing person_id / context_kind / ref_table / ref_id would rewrite
 * business history and requires a separate, explicitly approved flow.
 */
export const UpdatePersonContextLinkInputSchema = z
  .object({
    id: z.string().uuid({ message: "شناسه ارتباط نامعتبر است" }),
    note: NoteSchema,
    started_at: z.string().datetime({ offset: true }).optional(),
  })
  .refine((v) => v.note !== undefined || v.started_at !== undefined, {
    message: "هیچ تغییری برای اعمال وجود ندارد",
  });
export type UpdatePersonContextLinkInput = z.infer<typeof UpdatePersonContextLinkInputSchema>;

export const EndPersonContextLinkInputSchema = z.object({
  id: z.string().uuid({ message: "شناسه ارتباط نامعتبر است" }),
  ended_at: z.string().datetime({ offset: true }).optional(),
});
export type EndPersonContextLinkInput = z.infer<typeof EndPersonContextLinkInputSchema>;

export type PersonContextLinkDTO = {
  id: string;
  person_id: string;
  context_kind: PersonContextKind;
  ref_table: string | null;
  ref_id: string | null;
  note: string | null;
  started_at: string;
  ended_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};
