import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  authenticateBot,
  checkBotRateLimit,
  clientIp,
  extractBearer,
  isUuid,
  jsonResponse,
  logBotUsage,
  mapBotError,
} from "@/server/bot-api";

const MAX_BODY_BYTES = 64 * 1024;
const OBSERVATORY_SLUG = "afrakala-product-price-observatory";
const VALID_SOURCES = new Set(["torob", "purchista", "other"]);

export const Route = createFileRoute("/api/public/bot/dynamic-tables/$tableId/rows/upsert")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const ip = clientIp(request);
        const tableId = params.tableId;
        const endpoint = `/api/public/bot/dynamic-tables/${tableId}/rows/upsert`;

        if (!isUuid(tableId)) {
          logBotUsage({
            api_key_id: null,
            table_id: null,
            endpoint,
            method: "POST",
            status_code: 400,
            error_code: "invalid_table_id",
            ip,
          });
          return jsonResponse(400, {
            error: "invalid_table_id",
            message: "شناسه جدول نامعتبر است.",
          });
        }

        const auth = await authenticateBot(extractBearer(request.headers.get("authorization")));
        if (!auth.ok) {
          logBotUsage({
            api_key_id: null,
            table_id: tableId,
            endpoint,
            method: "POST",
            status_code: auth.status,
            error_code: auth.code,
            ip,
          });
          await checkBotRateLimit(null, ip);
          return jsonResponse(auth.status, { error: auth.code, message: auth.message });
        }

        const rl = await checkBotRateLimit(auth.keyId, ip);
        if (!rl.ok) {
          logBotUsage({
            api_key_id: auth.keyId,
            table_id: tableId,
            endpoint,
            method: "POST",
            status_code: 429,
            error_code: rl.code,
            ip,
          });
          return new Response(JSON.stringify({ error: rl.code, message: rl.message }), {
            status: 429,
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              "Retry-After": String(rl.retryAfter),
            },
          });
        }

        let raw: string;
        try {
          raw = await request.text();
        } catch {
          logBotUsage({
            api_key_id: auth.keyId,
            table_id: tableId,
            endpoint,
            method: "POST",
            status_code: 400,
            error_code: "body_read_failed",
            ip,
          });
          return jsonResponse(400, {
            error: "body_read_failed",
            message: "خواندن بدنه درخواست ممکن نشد.",
          });
        }
        if (raw.length > MAX_BODY_BYTES) {
          logBotUsage({
            api_key_id: auth.keyId,
            table_id: tableId,
            endpoint,
            method: "POST",
            status_code: 413,
            error_code: "body_too_large",
            ip,
            request_size: raw.length,
          });
          return jsonResponse(413, {
            error: "body_too_large",
            message: "اندازه بدنه درخواست بیش از حد مجاز است.",
          });
        }

        let body: unknown;
        try {
          body = raw.length ? JSON.parse(raw) : {};
        } catch {
          logBotUsage({
            api_key_id: auth.keyId,
            table_id: tableId,
            endpoint,
            method: "POST",
            status_code: 400,
            error_code: "invalid_json",
            ip,
            request_size: raw.length,
          });
          return jsonResponse(400, {
            error: "invalid_json",
            message: "بدنه درخواست JSON معتبر نیست.",
          });
        }

        const obj =
          body && typeof body === "object" && !Array.isArray(body)
            ? (body as Record<string, unknown>)
            : {};

        const uniqueByRaw = obj.unique_by;
        if (
          !Array.isArray(uniqueByRaw) ||
          uniqueByRaw.length === 0 ||
          !uniqueByRaw.every((k) => typeof k === "string" && k.length > 0 && k.length <= 64)
        ) {
          logBotUsage({
            api_key_id: auth.keyId,
            table_id: tableId,
            endpoint,
            method: "POST",
            status_code: 400,
            error_code: "invalid_unique_by",
            ip,
            request_size: raw.length,
          });
          return jsonResponse(400, {
            error: "invalid_unique_by",
            message:
              'فیلد unique_by باید آرایه‌ای از نام ستون‌های یکتایی باشد (مثلاً ["source","extraction_batch_id","external_product_id"]).',
          });
        }

        const values =
          obj.values && typeof obj.values === "object" && !Array.isArray(obj.values)
            ? (obj.values as Record<string, unknown>)
            : null;
        if (!values) {
          logBotUsage({
            api_key_id: auth.keyId,
            table_id: tableId,
            endpoint,
            method: "POST",
            status_code: 400,
            error_code: "invalid_values",
            ip,
            request_size: raw.length,
          });
          return jsonResponse(400, {
            error: "invalid_values",
            message: "فیلد values باید یک آبجکت JSON باشد.",
          });
        }

        // BOT-MATCHING-ENFORCEMENT — observatory-specific gate.
        // Look up the table slug; only enforce on the observatory table so
        // other dynamic tables keep their previous upsert behavior.
        const { data: tableMeta } = await supabaseAdmin
          .from("dynamic_tables")
          .select("slug")
          .eq("id", tableId)
          .maybeSingle();

        if (tableMeta?.slug === OBSERVATORY_SLUG) {
          const sm = (obj as { source_match?: unknown }).source_match;
          if (!sm || typeof sm !== "object" || Array.isArray(sm)) {
            logBotUsage({
              api_key_id: auth.keyId,
              table_id: tableId,
              endpoint,
              method: "POST",
              status_code: 400,
              error_code: "missing_source_match",
              ip,
              request_size: raw.length,
            });
            return jsonResponse(400, {
              error: "missing_source_match",
              message:
                "برای جدول رصدخانه، source_match با source_name و حداقل یکی از source_product_url/source_product_id الزامی است.",
            });
          }
          const smObj = sm as Record<string, unknown>;
          const srcName = typeof smObj.source_name === "string" ? smObj.source_name.trim() : "";
          if (!VALID_SOURCES.has(srcName)) {
            logBotUsage({
              api_key_id: auth.keyId,
              table_id: tableId,
              endpoint,
              method: "POST",
              status_code: 400,
              error_code: "invalid_source_name",
              ip,
              request_size: raw.length,
            });
            return jsonResponse(400, {
              error: "invalid_source_name",
              message: "source_name باید یکی از torob | purchista | other باشد.",
            });
          }
          const srcUrl =
            typeof smObj.source_product_url === "string" &&
            smObj.source_product_url.trim().length > 0
              ? smObj.source_product_url.trim()
              : null;
          const srcId =
            typeof smObj.source_product_id === "string" && smObj.source_product_id.trim().length > 0
              ? smObj.source_product_id.trim()
              : null;
          if (!srcUrl && !srcId) {
            logBotUsage({
              api_key_id: auth.keyId,
              table_id: tableId,
              endpoint,
              method: "POST",
              status_code: 400,
              error_code: "missing_source_reference",
              ip,
              request_size: raw.length,
            });
            return jsonResponse(400, {
              error: "missing_source_reference",
              message:
                "حداقل یکی از source_product_url یا source_product_id باید مقدار داشته باشد.",
            });
          }

          const valProductId =
            typeof values.afrakala_product_id === "string" ? values.afrakala_product_id : null;
          if (!valProductId || !isUuid(valProductId)) {
            logBotUsage({
              api_key_id: auth.keyId,
              table_id: tableId,
              endpoint,
              method: "POST",
              status_code: 400,
              error_code: "invalid_afrakala_product_id",
              ip,
              request_size: raw.length,
            });
            return jsonResponse(400, {
              error: "invalid_afrakala_product_id",
              message: "values.afrakala_product_id باید UUID معتبر باشد.",
            });
          }

          const { data: resolved, error: resolveErr } = await supabaseAdmin.rpc(
            "resolve_market_product_match",
            {
              p_source_name: srcName as never,
              p_source_product_url: srcUrl ?? undefined,
              p_source_product_id: srcId ?? undefined,
            },
          );
          if (resolveErr) {
            logBotUsage({
              api_key_id: auth.keyId,
              table_id: tableId,
              endpoint,
              method: "POST",
              status_code: 500,
              error_code: "match_resolve_failed",
              ip,
              request_size: raw.length,
            });
            return jsonResponse(500, {
              error: "match_resolve_failed",
              message: "خطا در بررسی تطبیق بازار.",
            });
          }
          const matchRow = Array.isArray(resolved)
            ? resolved[0]
            : (resolved as { afrakala_product_id?: string | null } | null);
          if (!matchRow || !matchRow.afrakala_product_id) {
            logBotUsage({
              api_key_id: auth.keyId,
              table_id: tableId,
              endpoint,
              method: "POST",
              status_code: 403,
              error_code: "approved_match_required",
              ip,
              request_size: raw.length,
            });
            return jsonResponse(403, {
              error: "approved_match_required",
              message: "Approved market match is required before updating observatory row.",
            });
          }
          if (matchRow.afrakala_product_id !== valProductId) {
            logBotUsage({
              api_key_id: auth.keyId,
              table_id: tableId,
              endpoint,
              method: "POST",
              status_code: 409,
              error_code: "match_product_mismatch",
              ip,
              request_size: raw.length,
            });
            return jsonResponse(409, {
              error: "match_product_mismatch",
              message: "approved match به محصول دیگری وصل است.",
            });
          }
          // Defensive: never persist source_match into row cells.
          if ("source_match" in values) delete (values as Record<string, unknown>).source_match;
        }

        const { data, error } = await supabaseAdmin.rpc("bot_upsert_table_row", {
          p_key_id: auth.keyId,
          p_table_id: tableId,
          p_unique_by: uniqueByRaw as string[],
          p_values: values as unknown as never,
        });

        if (error) {
          const m = mapBotError(error.message);
          logBotUsage({
            api_key_id: auth.keyId,
            table_id: tableId,
            endpoint,
            method: "POST",
            status_code: m.status,
            error_code: m.code,
            ip,
            request_size: raw.length,
          });
          return jsonResponse(m.status, { error: m.code, message: m.message });
        }

        const row = (Array.isArray(data) ? data[0] : data) as {
          out_mode: "created" | "updated";
          out_row_id: string;
          out_row_number: number | string;
          out_is_active: boolean;
          out_created_at: string;
          out_updated_at: string;
          out_values: Record<string, unknown>;
        } | null;

        if (!row) {
          logBotUsage({
            api_key_id: auth.keyId,
            table_id: tableId,
            endpoint,
            method: "POST",
            status_code: 500,
            error_code: "server_error",
            ip,
            request_size: raw.length,
          });
          return jsonResponse(500, { error: "server_error", message: "upsert ناموفق بود." });
        }

        const status = row.out_mode === "created" ? 201 : 200;
        logBotUsage({
          api_key_id: auth.keyId,
          table_id: tableId,
          endpoint,
          method: "POST",
          status_code: status,
          ip,
          request_size: raw.length,
          response_count: Object.keys(row.out_values ?? {}).length,
        });

        return jsonResponse(status, {
          mode: row.out_mode,
          row_id: row.out_row_id,
          row_number: Number(row.out_row_number),
          is_active: !!row.out_is_active,
          created_at: row.out_created_at,
          updated_at: row.out_updated_at,
          values: row.out_values ?? {},
        });
      },
    },
  },
});
