/**
 * Phase 2 — Persons Core (S10)
 *
 * Server-side read/write path for `public.person_context_links` (S09).
 *
 * Responsibilities:
 *  - Validate input with Zod (Persian errors).
 *  - Delegate all row-level authorization to S09 RLS:
 *      SELECT — inherited via parent person visibility (EXISTS persons).
 *      INSERT/UPDATE — admin/manager only.
 *      DELETE — no policy; closure is modeled by setting ended_at.
 *  - Preserve S09 audit triggers — handlers do plain DML.
 *  - Map Postgres errors (unique / RLS / CHECK / FK) to safe Persian messages.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  AddPersonContextLinkInputSchema,
  EndPersonContextLinkInputSchema,
  ListPersonContextLinksInputSchema,
  UpdatePersonContextLinkInputSchema,
  type PersonContextLinkDTO,
} from "./context-links.schemas";

const SELECT_COLS =
  "id, person_id, context_kind, ref_table, ref_id, note, started_at, ended_at, created_by, created_at, updated_at";

/** Map raw Postgres / RLS errors to Persian, business-safe messages. */
function mapPgError(code: string | undefined, message: string): Error {
  if (code === "23505") {
    if (message.includes("uq_pcl_active_ref")) {
      return new Error("این ارتباط فعال قبلاً برای این شخص ثبت شده است.");
    }
    return new Error("مقدار تکراری است");
  }
  if (code === "42501") return new Error("دسترسی لازم برای این عملیات را ندارید");
  if (code === "23514") {
    if (message.includes("person_context_links_context_kind_check")) {
      return new Error("نوع ارتباط نامعتبر است");
    }
    if (message.includes("person_context_links_ref_pair_check")) {
      return new Error("جدول مرجع و شناسه مرجع باید همزمان مقدار داشته باشند یا هر دو خالی باشند");
    }
    if (message.includes("person_context_links_time_range_check")) {
      return new Error("تاریخ پایان نمی‌تواند قبل از تاریخ شروع باشد");
    }
    return new Error("مقدار وارد شده با محدودیت‌های پایگاه داده سازگار نیست");
  }
  if (code === "23503") return new Error("شخص مرتبط یافت نشد");
  return new Error(message || "خطای ناشناخته در پایگاه داده");
}

/* ---------- list ---------- */

export const listPersonContextLinks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ListPersonContextLinksInputSchema.parse(input))
  .handler(async ({ data, context }): Promise<PersonContextLinkDTO[]> => {
    const { supabase } = context;
    let q = supabase
      .from("person_context_links")
      .select(SELECT_COLS)
      .eq("person_id", data.person_id);

    if (data.context_kind) q = q.eq("context_kind", data.context_kind);
    if (!data.include_ended) q = q.is("ended_at", null);

    const { data: rows, error } = await q.order("started_at", { ascending: false });
    if (error) throw mapPgError(error.code, error.message);
    return (rows as PersonContextLinkDTO[]) ?? [];
  });

/* ---------- add ---------- */

export const addPersonContextLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => AddPersonContextLinkInputSchema.parse(input))
  .handler(async ({ data, context }): Promise<PersonContextLinkDTO> => {
    const { supabase } = context;
    const payload: {
      person_id: string;
      context_kind: string;
      ref_table: string | null;
      ref_id: string | null;
      note: string | null;
      started_at?: string;
    } = {
      person_id: data.person_id,
      context_kind: data.context_kind,
      ref_table: data.ref_table ?? null,
      ref_id: data.ref_id ?? null,
      note: data.note ?? null,
    };
    if (data.started_at !== undefined) payload.started_at = data.started_at;

    const { data: row, error } = await supabase
      .from("person_context_links")
      .insert(payload)
      .select(SELECT_COLS)
      .single();
    if (error) throw mapPgError(error.code, error.message);
    return row as PersonContextLinkDTO;
  });

/* ---------- update (note / started_at only) ---------- */

export const updatePersonContextLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => UpdatePersonContextLinkInputSchema.parse(input))
  .handler(async ({ data, context }): Promise<PersonContextLinkDTO> => {
    const { supabase } = context;
    const patch: { note?: string | null; started_at?: string } = {};
    if (data.note !== undefined) patch.note = data.note ?? null;
    if (data.started_at !== undefined) patch.started_at = data.started_at;

    const { data: row, error } = await supabase
      .from("person_context_links")
      .update(patch)
      .eq("id", data.id)
      .select(SELECT_COLS)
      .single();
    if (error) throw mapPgError(error.code, error.message);
    if (!row) throw new Error("ارتباط یافت نشد یا دسترسی به آن ندارید");
    return row as PersonContextLinkDTO;
  });

/* ---------- end (close by setting ended_at) ---------- */

export const endPersonContextLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => EndPersonContextLinkInputSchema.parse(input))
  .handler(async ({ data, context }): Promise<PersonContextLinkDTO> => {
    const { supabase } = context;
    const endedAt = data.ended_at ?? new Date().toISOString();
    const { data: row, error } = await supabase
      .from("person_context_links")
      .update({ ended_at: endedAt })
      .eq("id", data.id)
      .is("ended_at", null)
      .select(SELECT_COLS)
      .single();
    if (error) throw mapPgError(error.code, error.message);
    if (!row) throw new Error("ارتباط فعال یافت نشد یا قبلاً بسته شده است");
    return row as PersonContextLinkDTO;
  });
