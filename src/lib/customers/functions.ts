/**
 * Phase 2 — Customers ↔ Persons (S18B)
 *
 * Server-side write path for `public.customers` and the customer ↔ person
 * link RPCs added in S18A.
 *
 * Responsibilities:
 *  - Validate input with Zod (Persian messages).
 *  - Delegate row-level authorization to existing customers / persons /
 *    person_context_links RLS — uses the user-scoped Supabase client from
 *    `requireSupabaseAuth`. No service role, no SECURITY DEFINER.
 *  - For link / unlink, call the SECURITY INVOKER RPCs `customer_set_person`
 *    and `customer_clear_person` so the multi-statement work runs in a single
 *    Postgres transaction.
 *  - Map Postgres / RLS errors to safe Persian messages.
 *
 * Audit:
 *  - customer create / update field changes  → handled by existing
 *    `customers_audit` trigger (note: that trigger's diff currently does NOT
 *    include `person_id`; not modified here per S18B scope).
 *  - link add / link close                   → handled by existing
 *    `trg_pcl_audit_insert` / `trg_pcl_audit_update` on
 *    `person_context_links`.
 *  - No audit rows are written from JS.
 *
 * UI integration:
 *  - S18B does NOT change `CustomerForm`. The form still writes directly with
 *    the browser Supabase client. S19 will migrate the UI to call these
 *    serverFns; the browser client-side middleware
 *    (`attachSupabaseAuth`) already attaches the bearer token to serverFn
 *    RPCs, so no per-call header wiring is required from the UI side.
 */

import { createServerFn, createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  CreateCustomerInputSchema,
  LinkCustomerToPersonInputSchema,
  UnlinkCustomerFromPersonInputSchema,
  UpdateCustomerInputSchema,
  type CustomerDTO,
  type LinkCustomerToPersonResult,
  type UnlinkCustomerFromPersonResult,
} from "./schemas";

const SELECT_COLS =
  "id, name, phone, email, city, address, tax_id, notes, responsible_id, accounting_code, link_group, birth_date, is_active, person_id, created_at, updated_at";

/* ---------- error envelope (same pattern as persons.functions.ts) ---------- */

const surfaceAuthError = createMiddleware({ type: "function" }).server(async ({ next }) => {
  try {
    return await next();
  } catch (e) {
    if (typeof Response !== "undefined" && e instanceof Response) {
      let body = "";
      try {
        body = (await e.clone().text()).slice(0, 200);
      } catch {
        /* ignore */
      }
      console.error(
        `[customers.serverFn] auth/middleware threw Response status=${e.status} body=${JSON.stringify(body)}`,
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
        `[customers.serverFn] handler threw Error name=${e.name} message=${JSON.stringify(e.message).slice(0, 200)}`,
      );
      throw e;
    }
    console.error(
      `[customers.serverFn] non-Error throw type=${typeof e} value=${JSON.stringify(e)?.slice(0, 200)}`,
    );
    throw new Error("خطای ناشناخته در پردازش درخواست");
  }
});

function mapPgError(code: string | undefined, message: string): Error {
  if (code === "23505") {
    if (message.toLowerCase().includes("accounting_code")) {
      return new Error("کد حسابداری تکراری است");
    }
    if (message.includes("uq_pcl_active_ref")) {
      return new Error("این ارتباط فعال قبلاً برای این مشتری ثبت شده است.");
    }
    return new Error("مقدار تکراری است");
  }
  if (code === "42501") return new Error("دسترسی لازم برای این عملیات را ندارید");
  if (code === "23514") return new Error("مقدار وارد شده با محدودیت‌های پایگاه داده سازگار نیست");
  if (code === "23503") return new Error("مشتری یا شخص مرتبط یافت نشد");
  if (code === "P0002") return new Error(message || "رکورد یافت نشد یا دسترسی به آن ندارید");
  if (code === "22023") return new Error(message || "ورودی نامعتبر است");
  return new Error(message || "خطای ناشناخته در پایگاه داده");
}

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

/* ---------- createCustomer ---------- */

/**
 * createCustomer does NOT accept `person_id`. See note in
 * `schemas.ts → CreateCustomerInputSchema`. To attach a person after
 * creation, call `linkCustomerToPerson` with the returned id.
 *
 * @deprecated Phase 6.2. This inserts into `customers` directly and therefore
 * creates a row with `person_id = NULL` — the exact hole Phase 6 closes. It has
 * no callers (verified by grep; the only other mention is a comment in
 * QuickAddCustomerDialog, which already uses `person_create_inline`).
 *
 * Use `supabase.rpc("person_create_inline", { p_context_kind: "customer", ... })`
 * instead — see `CustomerForm.tsx` for the reference call, including
 * `p_legacy_fields` for customer-only columns.
 *
 * Left in place rather than rewritten because rule 15 forbids reworking code
 * nothing calls. Note that after migration 233 makes `customers.person_id`
 * NOT NULL this function will fail loudly at runtime, which is the intended
 * outcome: no silent person-less customer.
 */
export const createCustomer = createServerFn({ method: "POST" })
  .middleware([surfaceAuthError, requireSupabaseAuth])
  .inputValidator((input) => CreateCustomerInputSchema.parse(input))
  .handler(async ({ data, context }): Promise<CustomerDTO> => {
    try {
      const { supabase } = context;
      const payload = {
        name: data.name,
        phone: data.phone ?? null,
        email: data.email ?? null,
        city: data.city ?? null,
        address: data.address ?? null,
        tax_id: data.tax_id ?? null,
        notes: data.notes ?? null,
        responsible_id: data.responsible_id ?? null,
        accounting_code: data.accounting_code ?? null,
        link_group: data.link_group ?? null,
        birth_date: data.birth_date ?? null,
        ...(data.is_active !== undefined ? { is_active: data.is_active } : {}),
      };

      const { data: row, error } = await supabase
        .from("customers")
        .insert(payload)
        .select(SELECT_COLS)
        .single();
      if (error) throw mapPgError(error.code, error.message);
      if (!row) throw new Error("ایجاد مشتری ناموفق بود — رکوردی بازگردانده نشد");
      return row as CustomerDTO;
    } catch (e) {
      throw toServerError(e);
    }
  });

/* ---------- updateCustomer ---------- */

/**
 * updateCustomer updates ONLY whitelisted, non-link columns.
 * `person_id` is intentionally not in the whitelist — it must be changed via
 * `linkCustomerToPerson` / `unlinkCustomerFromPerson` so the matching
 * `person_context_links` row stays consistent.
 */
export const updateCustomer = createServerFn({ method: "POST" })
  .middleware([surfaceAuthError, requireSupabaseAuth])
  .inputValidator((input) => UpdateCustomerInputSchema.parse(input))
  .handler(async ({ data, context }): Promise<CustomerDTO> => {
    try {
      const { supabase } = context;
      const patch: Record<string, unknown> = {};
      const p = data.patch;
      if (p.name !== undefined) patch.name = p.name;
      if (p.phone !== undefined) patch.phone = p.phone ?? null;
      if (p.email !== undefined) patch.email = p.email ?? null;
      if (p.city !== undefined) patch.city = p.city ?? null;
      if (p.address !== undefined) patch.address = p.address ?? null;
      if (p.tax_id !== undefined) patch.tax_id = p.tax_id ?? null;
      if (p.notes !== undefined) patch.notes = p.notes ?? null;
      if (p.responsible_id !== undefined) patch.responsible_id = p.responsible_id ?? null;
      if (p.accounting_code !== undefined) patch.accounting_code = p.accounting_code ?? null;
      if (p.link_group !== undefined) patch.link_group = p.link_group ?? null;
      if (p.birth_date !== undefined) patch.birth_date = p.birth_date ?? null;
      if (p.is_active !== undefined) patch.is_active = p.is_active;

      if (Object.keys(patch).length === 0) {
        throw new Error("هیچ تغییری ارسال نشده است");
      }

      const { data: row, error } = await supabase
        .from("customers")
        .update(patch as never)
        .eq("id", data.id)
        .select(SELECT_COLS)
        .single();
      if (error) throw mapPgError(error.code, error.message);
      if (!row) throw new Error("مشتری یافت نشد یا دسترسی به آن ندارید");
      return row as CustomerDTO;
    } catch (e) {
      throw toServerError(e);
    }
  });

/* ---------- linkCustomerToPerson ---------- */

export const linkCustomerToPerson = createServerFn({ method: "POST" })
  .middleware([surfaceAuthError, requireSupabaseAuth])
  .inputValidator((input) => LinkCustomerToPersonInputSchema.parse(input))
  .handler(async ({ data, context }): Promise<LinkCustomerToPersonResult> => {
    try {
      const { supabase } = context;
      const { data: linkId, error } = await supabase.rpc("customer_set_person", {
        p_customer_id: data.customer_id,
        p_person_id: data.person_id,
        p_note: data.note ?? undefined,
      });
      if (error) throw mapPgError(error.code, error.message);
      if (!linkId || typeof linkId !== "string") {
        throw new Error("ایجاد ارتباط ناموفق بود");
      }
      return { link_id: linkId };
    } catch (e) {
      throw toServerError(e);
    }
  });

/* ---------- unlinkCustomerFromPerson ---------- */

export const unlinkCustomerFromPerson = createServerFn({ method: "POST" })
  .middleware([surfaceAuthError, requireSupabaseAuth])
  .inputValidator((input) => UnlinkCustomerFromPersonInputSchema.parse(input))
  .handler(async ({ data, context }): Promise<UnlinkCustomerFromPersonResult> => {
    try {
      const { supabase } = context;
      const { data: changed, error } = await supabase.rpc("customer_clear_person", {
        p_customer_id: data.customer_id,
        p_note: data.note ?? undefined,
      });
      if (error) throw mapPgError(error.code, error.message);
      return { changed: Boolean(changed) };
    } catch (e) {
      throw toServerError(e);
    }
  });
