import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  authenticateBot, checkBotRateLimit, clientIp, extractBearer, isUuid, jsonResponse,
  logBotUsage, mapBotError,
} from "@/server/bot-api";

const MAX_BODY_BYTES = 64 * 1024;

export const Route = createFileRoute("/api/public/bot/dynamic-tables/$tableId/rows/upsert")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const ip = clientIp(request);
        const tableId = params.tableId;
        const endpoint = `/api/public/bot/dynamic-tables/${tableId}/rows/upsert`;

        if (!isUuid(tableId)) {
          logBotUsage({ api_key_id: null, table_id: null, endpoint, method: "POST",
            status_code: 400, error_code: "invalid_table_id", ip });
          return jsonResponse(400, { error: "invalid_table_id", message: "شناسه جدول نامعتبر است." });
        }

        const auth = await authenticateBot(extractBearer(request.headers.get("authorization")));
        if (!auth.ok) {
          logBotUsage({ api_key_id: null, table_id: tableId, endpoint, method: "POST",
            status_code: auth.status, error_code: auth.code, ip });
          await checkBotRateLimit(null, ip);
          return jsonResponse(auth.status, { error: auth.code, message: auth.message });
        }

        const rl = await checkBotRateLimit(auth.keyId, ip);
        if (!rl.ok) {
          logBotUsage({ api_key_id: auth.keyId, table_id: tableId, endpoint, method: "POST",
            status_code: 429, error_code: rl.code, ip });
          return new Response(JSON.stringify({ error: rl.code, message: rl.message }), {
            status: 429,
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              "Retry-After": String(rl.retryAfter),
            },
          });
        }

        let raw: string;
        try { raw = await request.text(); }
        catch {
          logBotUsage({ api_key_id: auth.keyId, table_id: tableId, endpoint, method: "POST",
            status_code: 400, error_code: "body_read_failed", ip });
          return jsonResponse(400, { error: "body_read_failed", message: "خواندن بدنه درخواست ممکن نشد." });
        }
        if (raw.length > MAX_BODY_BYTES) {
          logBotUsage({ api_key_id: auth.keyId, table_id: tableId, endpoint, method: "POST",
            status_code: 413, error_code: "body_too_large", ip, request_size: raw.length });
          return jsonResponse(413, { error: "body_too_large", message: "اندازه بدنه درخواست بیش از حد مجاز است." });
        }

        let body: unknown;
        try { body = raw.length ? JSON.parse(raw) : {}; }
        catch {
          logBotUsage({ api_key_id: auth.keyId, table_id: tableId, endpoint, method: "POST",
            status_code: 400, error_code: "invalid_json", ip, request_size: raw.length });
          return jsonResponse(400, { error: "invalid_json", message: "بدنه درخواست JSON معتبر نیست." });
        }

        const obj = (body && typeof body === "object" && !Array.isArray(body))
          ? (body as Record<string, unknown>) : {};

        const uniqueByRaw = obj.unique_by;
        if (!Array.isArray(uniqueByRaw) || uniqueByRaw.length === 0
          || !uniqueByRaw.every((k) => typeof k === "string" && k.length > 0 && k.length <= 64)) {
          logBotUsage({ api_key_id: auth.keyId, table_id: tableId, endpoint, method: "POST",
            status_code: 400, error_code: "invalid_unique_by", ip, request_size: raw.length });
          return jsonResponse(400, {
            error: "invalid_unique_by",
            message: "فیلد unique_by باید آرایه‌ای از نام ستون‌های یکتایی باشد (مثلاً [\"source\",\"extraction_batch_id\",\"external_product_id\"]).",
          });
        }

        const values = (obj.values && typeof obj.values === "object" && !Array.isArray(obj.values))
          ? (obj.values as Record<string, unknown>) : null;
        if (!values) {
          logBotUsage({ api_key_id: auth.keyId, table_id: tableId, endpoint, method: "POST",
            status_code: 400, error_code: "invalid_values", ip, request_size: raw.length });
          return jsonResponse(400, { error: "invalid_values", message: "فیلد values باید یک آبجکت JSON باشد." });
        }

        const { data, error } = await supabaseAdmin.rpc("bot_upsert_table_row", {
          p_key_id: auth.keyId,
          p_table_id: tableId,
          p_unique_by: uniqueByRaw as string[],
          p_values: values as unknown as never,
        });

        if (error) {
          const m = mapBotError(error.message);
          logBotUsage({ api_key_id: auth.keyId, table_id: tableId, endpoint, method: "POST",
            status_code: m.status, error_code: m.code, ip, request_size: raw.length });
          return jsonResponse(m.status, { error: m.code, message: m.message });
        }

        const row = (Array.isArray(data) ? data[0] : data) as
          | {
              out_mode: "created" | "updated";
              out_row_id: string;
              out_row_number: number | string;
              out_is_active: boolean;
              out_created_at: string;
              out_updated_at: string;
              out_values: Record<string, unknown>;
            }
          | null;

        if (!row) {
          logBotUsage({ api_key_id: auth.keyId, table_id: tableId, endpoint, method: "POST",
            status_code: 500, error_code: "server_error", ip, request_size: raw.length });
          return jsonResponse(500, { error: "server_error", message: "upsert ناموفق بود." });
        }

        const status = row.out_mode === "created" ? 201 : 200;
        logBotUsage({ api_key_id: auth.keyId, table_id: tableId, endpoint, method: "POST",
          status_code: status, ip, request_size: raw.length,
          response_count: Object.keys(row.out_values ?? {}).length });

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