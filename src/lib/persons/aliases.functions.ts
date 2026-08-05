/**
 * Phase 4 — person_aliases CRUD (user JWT, RLS-authoritative).
 *
 * Normalization is owned by the GENERATED column alias_normalized
 * (normalize_fa_text). Do not write alias_normalized from the client.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const ALIAS_KINDS = [
  "legal",
  "trade",
  "former",
  "nickname",
  "transliteration",
  "misspelling",
  "other",
] as const;
export type AliasKind = (typeof ALIAS_KINDS)[number];

export const ALIAS_KIND_LABEL: Record<AliasKind, string> = {
  legal: "قانونی",
  trade: "تجاری",
  former: "قبلی",
  nickname: "مستعار",
  transliteration: "نویسه‌گردانی",
  misspelling: "غلط‌املایی رایج",
  other: "سایر",
};

const AliasKindEnum = z.enum(ALIAS_KINDS);

const AliasTextSchema = z
  .string()
  .transform((s) => s.trim())
  .pipe(
    z
      .string()
      .min(1, "نام دیگر نمی‌تواند خالی باشد")
      .max(200, "طول نام دیگر بیش از حد مجاز است"),
  );

const CreateInputSchema = z.object({
  person_id: z.string().uuid({ message: "شناسه شخص نامعتبر است" }),
  alias: AliasTextSchema,
  alias_kind: AliasKindEnum.optional().default("other"),
  source: z.string().trim().max(200).nullable().optional(),
});

const UpdateInputSchema = z.object({
  id: z.string().uuid({ message: "شناسه نام دیگر نامعتبر است" }),
  alias: AliasTextSchema.optional(),
  alias_kind: AliasKindEnum.optional(),
  source: z.string().trim().max(200).nullable().optional(),
});

const DeleteInputSchema = z.object({
  id: z.string().uuid({ message: "شناسه نام دیگر نامعتبر است" }),
});

const ListInputSchema = z.object({
  person_id: z.string().uuid({ message: "شناسه شخص نامعتبر است" }),
});

export type PersonAliasDTO = {
  id: string;
  person_id: string;
  alias: string;
  alias_normalized: string | null;
  alias_kind: AliasKind;
  source: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

const SELECT_COLS =
  "id, person_id, alias, alias_normalized, alias_kind, source, created_by, created_at, updated_at";

function mapPgError(code: string | undefined, message: string): Error {
  if (/[؀-ۿ]/.test(message)) return new Error(message);
  if (code === "23505") {
    if (message.includes("uq_person_aliases_person_normalized")) {
      return new Error("این نام دیگر قبلاً برای همین شخص ثبت شده است");
    }
    return new Error("مقدار تکراری است");
  }
  if (code === "42501") return new Error("دسترسی لازم برای این عملیات را ندارید");
  if (code === "23514") return new Error("مقدار وارد شده با محدودیت‌های پایگاه داده سازگار نیست");
  if (code === "23503") return new Error("شخص مرتبط یافت نشد");
  if (code === "PGRST116") return new Error("نام دیگر یافت نشد یا به آن دسترسی ندارید");
  return new Error(message || "خطای ناشناخته در پایگاه داده");
}

export const listPersonAliases = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ListInputSchema.parse(input))
  .handler(async ({ data, context }): Promise<PersonAliasDTO[]> => {
    const { data: rows, error } = await context.supabase
      .from("person_aliases")
      .select(SELECT_COLS)
      .eq("person_id", data.person_id)
      .order("alias", { ascending: true });
    if (error) throw mapPgError(error.code, error.message);
    return (rows ?? []) as PersonAliasDTO[];
  });

export const createPersonAlias = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => CreateInputSchema.parse(input))
  .handler(async ({ data, context }): Promise<PersonAliasDTO> => {
    const { data: row, error } = await context.supabase
      .from("person_aliases")
      .insert({
        person_id: data.person_id,
        alias: data.alias,
        alias_kind: data.alias_kind,
        source: data.source ?? null,
        created_by: context.userId ?? null,
      })
      .select(SELECT_COLS)
      .single();
    if (error) throw mapPgError(error.code, error.message);
    return row as PersonAliasDTO;
  });

export const updatePersonAlias = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => UpdateInputSchema.parse(input))
  .handler(async ({ data, context }): Promise<PersonAliasDTO> => {
    const patch: {
      alias?: string;
      alias_kind?: AliasKind;
      source?: string | null;
    } = {};
    if (data.alias !== undefined) patch.alias = data.alias;
    if (data.alias_kind !== undefined) patch.alias_kind = data.alias_kind;
    if (data.source !== undefined) patch.source = data.source;
    if (Object.keys(patch).length === 0) {
      throw new Error("هیچ تغییری برای اعمال وجود ندارد");
    }

    const { data: row, error } = await context.supabase
      .from("person_aliases")
      .update(patch)
      .eq("id", data.id)
      .select(SELECT_COLS)
      .single();
    if (error) throw mapPgError(error.code, error.message);
    return row as PersonAliasDTO;
  });

export const deletePersonAlias = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => DeleteInputSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ success: true }> => {
    const { error, count } = await context.supabase
      .from("person_aliases")
      .delete({ count: "exact" })
      .eq("id", data.id);
    if (error) throw mapPgError(error.code, error.message);
    if (count === 0) {
      throw new Error("نام دیگر یافت نشد یا به آن دسترسی ندارید");
    }
    return { success: true };
  });
