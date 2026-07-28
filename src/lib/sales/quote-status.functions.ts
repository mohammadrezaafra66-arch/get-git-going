/**
 * SF-1.b — Quote status hardening
 *
 * Authenticated serverFn that updates `sales_quotes.status` (and clears /
 * sets `cancel_reason`) on behalf of the signed-in user. Uses the
 * user-scoped Supabase client from `requireSupabaseAuth` so all existing
 * defenses keep applying as-is:
 *
 *  - RLS policies on `sales_quotes` (admin/manager full, sales own +
 *    restricted target statuses).
 *  - DB trigger `trg_sales_quotes_validate_status` (transition rules).
 *  - DB trigger `trg_audit_sales_quotes` (audit row with `auth.uid()`).
 *
 * This file deliberately does NOT:
 *  - import `supabaseAdmin` / use the service role,
 *  - insert into `audit_logs` from JS (DB trigger covers it),
 *  - touch `sales_quote_items`, send-queue, or share logs,
 *  - accept any patch field other than `status` and `cancel_reason`.
 */

import { createServerFn, createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { UpdateQuoteStatusInputSchema, type UpdateQuoteStatusResult } from "./quote-status.schemas";

/* ---------- error envelope (same pattern as customers.functions.ts) ---------- */

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
        `[quote-status.serverFn] auth/middleware threw Response status=${e.status} body=${JSON.stringify(body)}`,
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
        `[quote-status.serverFn] handler threw Error name=${e.name} message=${JSON.stringify(e.message).slice(0, 200)}`,
      );
      throw e;
    }
    console.error(
      `[quote-status.serverFn] non-Error throw type=${typeof e} value=${JSON.stringify(e)?.slice(0, 200)}`,
    );
    throw new Error("خطای ناشناخته در پردازش درخواست");
  }
});

function mapPgError(code: string | undefined, message: string): Error {
  if (code === "42501") return new Error("دسترسی لازم برای این عملیات را ندارید");
  // DB trigger / check-constraint messages are already Persian-friendly where
  // we control them; pass through the raw message otherwise so trigger
  // validation errors stay meaningful.
  if (code === "P0001") return new Error(message || "تغییر وضعیت مجاز نیست");
  if (code === "23514") return new Error(message || "مقدار وارد شده مجاز نیست");
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

/* ---------- updateQuoteStatus ---------- */

export const updateQuoteStatus = createServerFn({ method: "POST" })
  .middleware([surfaceAuthError, requireSupabaseAuth])
  .inputValidator((input) => UpdateQuoteStatusInputSchema.parse(input))
  .handler(async ({ data, context }): Promise<UpdateQuoteStatusResult> => {
    try {
      const { supabase } = context;
      // SF-1.c3: route the status transition through the SECURITY DEFINER
      // RPC `public.update_sales_quote_status`. This preserves the
      // authenticated session (so `auth.uid()` is available to the audit
      // and validate-status triggers) while enabling a future revoke of
      // direct UPDATE on `public.sales_quotes` from the `authenticated`
      // role. Authorization, cancel-reason requirement, and the
      // sales-owner target-status whitelist are enforced inside the RPC
      // and mirror the existing RLS policies. Transition validity and
      // audit logging stay in the existing DB triggers.
      const { data: rows, error } = await supabase.rpc("update_sales_quote_status", {
        p_quote_id: data.id,
        p_next: data.next,
        // Item 195 — a rejection carries a reason too, so it can no longer be
        // dropped here. The RPC decides which column it lands in.
        p_reason:
          data.next === "canceled" || data.next === "rejected"
            ? (data.reason ?? undefined)
            : undefined,
      });
      if (error) throw mapPgError(error.code, error.message);
      const row = Array.isArray(rows) ? rows[0] : rows;
      if (!row) throw new Error("پیش‌فاکتور یافت نشد یا دسترسی به آن ندارید");
      return row as UpdateQuoteStatusResult;
    } catch (e) {
      throw toServerError(e);
    }
  });
