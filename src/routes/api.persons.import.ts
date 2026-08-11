import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Database } from "@/integrations/supabase/types";
import { IDENTIFIER_KINDS } from "@/lib/persons/identifiers-normalize";
import { PERSON_CONTEXT_KINDS } from "@/lib/persons/context-links.schemas";

/**
 * POST /api/persons/import — the single import entry point (item 230).
 *
 * Replaces the per-entity import paths: CustomerImportForm used to INSERT
 * straight into `customers`, and there was never a supplier import at all.
 * Everything now funnels into person_import_batch(), so one set of matching,
 * normalization and provenance rules applies regardless of entity type.
 *
 * AUTHORIZATION
 *   Deliberately builds a USER-SCOPED client from the caller's bearer token
 *   rather than using the service-role client. person_import_batch is
 *   SECURITY INVOKER, so its RLS guarantees only hold if the caller's identity
 *   is carried through. Using supabaseAdmin here would silently let any
 *   authenticated user import as though they were an administrator.
 *
 * PARSING
 *   This endpoint takes already-parsed rows as JSON. The XLSX/CSV parsing stays
 *   in the browser (SheetJS is already dynamically imported by the existing
 *   import forms) so we do not ship a second parser server-side and do not have
 *   to accept file uploads here.
 */

const IdentifierSchema = z.object({
  kind: z.enum(IDENTIFIER_KINDS as unknown as [string, ...string[]]),
  value_raw: z.string().trim().min(1).max(512),
  is_primary: z.boolean().optional(),
});

const RowSchema = z.object({
  display_name: z.string().trim().min(1).max(255),
  kind: z.enum(["individual", "organization"]).optional(),
  context_kind: z.enum(PERSON_CONTEXT_KINDS as unknown as [string, ...string[]]),
  identifiers: z.array(IdentifierSchema).max(10).optional(),
  city: z.string().trim().max(80).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  accounting_code: z.string().trim().max(30).optional().nullable(),
});

/**
 * Bounded so one request cannot pin a connection for minutes. The existing
 * CustomerImportForm already caps a file at 1000 rows and batches by 50; this
 * matches the per-request half of that contract.
 */
const BodySchema = z.object({
  rows: z.array(RowSchema).min(1).max(500),
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export const Route = createFileRoute("/api/persons/import")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
          return jsonResponse(500, {
            ok: false,
            error: "config",
            message: "پیکربندی سرور ناقص است.",
          });
        }

        const authHeader = request.headers.get("authorization") ?? "";
        if (!authHeader.startsWith("Bearer ")) {
          return jsonResponse(401, {
            ok: false,
            error: "unauthorized",
            message: "Authorization Bearer token الزامی است.",
          });
        }
        const token = authHeader.slice("Bearer ".length).trim();
        if (!token) {
          return jsonResponse(401, {
            ok: false,
            error: "unauthorized",
            message: "Authorization Bearer token الزامی است.",
          });
        }

        let parsed: z.infer<typeof BodySchema>;
        try {
          parsed = BodySchema.parse(await request.json());
        } catch (e) {
          return jsonResponse(400, {
            ok: false,
            error: "invalid_body",
            message: "بدنهٔ درخواست معتبر نیست.",
            detail: e instanceof z.ZodError ? e.issues.slice(0, 10) : undefined,
          });
        }

        // User-scoped client — RLS stays in force. See the note above.
        const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        });

        const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
        if (claimsErr || !claims?.claims?.sub) {
          return jsonResponse(401, {
            ok: false,
            error: "unauthorized",
            message: "نشست کاربری معتبر نیست.",
          });
        }

        const { data, error } = await supabase.rpc("person_import_batch", {
          p_rows: parsed.rows as never,
        });

        if (error) {
          // 42501 is an RLS refusal, not a server fault.
          const status = error.code === "42501" ? 403 : 400;
          return jsonResponse(status, {
            ok: false,
            error: error.code ?? "rpc_failed",
            message: error.message || "ورود دسته‌ای اشخاص ناموفق بود.",
          });
        }

        // person_import_batch reports per-row outcomes; a partially rejected
        // batch is still a 200 so the caller can show which rows failed.
        return jsonResponse(200, { ok: true, result: data });
      },
    },
  },
});
